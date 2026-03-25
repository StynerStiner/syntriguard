const router = require('express').Router();
const { google } = require('googleapis');
const db = require('../db');
const auth = require('../middleware/auth');

// ─── Google Auth Helper ─────────────────────────────────────
function getGoogleAuth() {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_REFRESH_TOKEN) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    return oauth2Client;
  }
  throw new Error('Google not configured');
}

// ─── Color Constants ────────────────────────────────────────
const COLORS = {
  darkBlue:  { red: 0.1,  green: 0.23, blue: 0.36 },
  white:     { red: 1,    green: 1,    blue: 1    },
  yellow:    { red: 1,    green: 0.95, blue: 0.6  },
  red:       { red: 1,    green: 0.8,  blue: 0.8  },
  green:     { red: 0.8,  green: 1,    blue: 0.8  },
  lightGrey: { red: 0.95, green: 0.95, blue: 0.95 },
  headerGreen: { red: 0.13, green: 0.55, blue: 0.13 },
  headerRed:   { red: 0.6,  green: 0.1,  blue: 0.1  },
};

// ─── Helpers ────────────────────────────────────────────────

function getMonthRange(monthStr) {
  // monthStr = "2026-03"
  const [year, month] = monthStr.split('-').map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0); // last day of month
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
    year,
    month,
    monthName: start.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    daysInMonth: end.getDate()
  };
}

function getWeekNumber(date, monthStart) {
  const dayOfMonth = date.getDate();
  // Week 1 = days 1-7, Week 2 = days 8-14, etc.
  return Math.ceil(dayOfMonth / 7);
}

function formatDateBanner(date) {
  const d = new Date(date);
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${days[d.getUTCDay()]}, ${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function getStatusColor(status, revisionCount) {
  if (status === 'cancelled') return COLORS.red;
  if (revisionCount > 0) return COLORS.yellow;
  return null; // white / default
}

// ─── POST /api/sheets/schedule/sync — Master Monthly Spreadsheet ────

router.post('/schedule/sync', auth, async (req, res) => {
  try {
    const { month, folder_id } = req.body;
    const monthStr = month || new Date().toISOString().substring(0, 7);
    const folderId = folder_id || process.env.GOOGLE_DRIVE_FOLDER_ID;
    const { startDate, endDate, year, month: monthNum, monthName, daysInMonth } = getMonthRange(monthStr);

    const authClient = getGoogleAuth();
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    const drive = google.drive({ version: 'v3', auth: authClient });

    // ── Check sheet_registry for existing spreadsheet ──
    const existing = await db.query(
      'SELECT * FROM sheet_registry WHERE sheet_type = $1 AND period = $2',
      ['schedule', monthStr]
    );

    let fileId, url;
    let isUpdate = false;

    if (existing.rows.length > 0) {
      // UPDATE existing spreadsheet
      fileId = existing.rows[0].spreadsheet_id;
      url = existing.rows[0].spreadsheet_url;
      isUpdate = true;

      // Delete all existing sheets except the first, then recreate
      try {
        const ssInfo = await sheets.spreadsheets.get({ spreadsheetId: fileId });
        const existingSheets = ssInfo.data.sheets;
        // We'll clear and rebuild all tabs
        const deleteRequests = existingSheets.slice(1).map(s => ({
          deleteSheet: { sheetId: s.properties.sheetId }
        }));
        if (deleteRequests.length > 0) {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: fileId,
            requestBody: { requests: deleteRequests }
          });
        }
        // Rename first sheet to Summary
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: fileId,
          requestBody: {
            requests: [{
              updateSheetProperties: {
                properties: { sheetId: existingSheets[0].properties.sheetId, title: 'Summary' },
                fields: 'title'
              }
            }]
          }
        });
      } catch (err) {
        console.error('Error cleaning existing spreadsheet, creating new one:', err.message);
        isUpdate = false;
      }
    }

    if (!isUpdate) {
      // CREATE new spreadsheet
      const spreadsheet = await sheets.spreadsheets.create({
        requestBody: {
          properties: { title: `SyntriGuard Schedule — ${monthName}` },
          sheets: [{ properties: { title: 'Summary', sheetId: 0 } }]
        }
      });
      fileId = spreadsheet.data.spreadsheetId;
      url = spreadsheet.data.spreadsheetUrl;

      // Move to folder
      if (folderId) {
        try {
          await drive.files.update({
            fileId,
            addParents: folderId,
            removeParents: 'root',
            fields: 'id, parents'
          });
        } catch (e) {
          console.error('Could not move to folder:', e.message);
        }
      }
    }

    // ── Fetch all data for the month ──
    const [shiftsResult, revisionsResult, sitesResult, incidentsResult] = await Promise.all([
      db.query(`
        SELECT sh.id, sh.shift_date, sh.start_time, sh.end_time, sh.shift_type, sh.status,
               sh.revision_count, sh.created_at as shift_created_at,
               g.full_name as guard_name, g.guard_id as guard_code, g.phone,
               s.name as site_name
        FROM shifts sh
        LEFT JOIN guards g ON sh.guard_id = g.id
        LEFT JOIN sites s ON sh.site_id = s.id
        WHERE sh.shift_date BETWEEN $1 AND $2
        ORDER BY sh.shift_date, sh.start_time, s.name
      `, [startDate, endDate]),
      db.query(`
        SELECT sr.*, g_old.full_name as old_guard_name, g_new.full_name as new_guard_name,
               s_old.name as old_site_name, s_new.name as new_site_name,
               u.full_name as changed_by_name
        FROM shift_revisions sr
        LEFT JOIN guards g_old ON sr.old_guard_id = g_old.id
        LEFT JOIN guards g_new ON sr.new_guard_id = g_new.id
        LEFT JOIN sites s_old ON sr.old_site_id = s_old.id
        LEFT JOIN sites s_new ON sr.new_site_id = s_new.id
        LEFT JOIN users u ON sr.changed_by = u.id
        LEFT JOIN shifts sh ON sr.shift_id = sh.id
        WHERE sh.shift_date BETWEEN $1 AND $2
        ORDER BY sr.created_at DESC
      `, [startDate, endDate]),
      db.query(`
        SELECT s.name, s.district, s.guards_assigned, s.status,
               c.name as client_name,
               (SELECT COUNT(DISTINCT sh.guard_id) FROM shifts sh WHERE sh.site_id = s.id AND sh.shift_date BETWEEN $1 AND $2) as scheduled_guards
        FROM sites s
        LEFT JOIN clients c ON s.client_id = c.id
        WHERE s.status = 'active'
        ORDER BY s.name
      `, [startDate, endDate]),
      db.query(`
        SELECT COUNT(*) as open_count FROM incidents WHERE status IN ('open', 'investigating')
      `)
    ]);

    const allShifts = shiftsResult.rows;
    const revisions = revisionsResult.rows;
    const sites = sitesResult.rows;
    const openIncidents = parseInt(incidentsResult.rows[0]?.open_count || '0');

    // ── Calculate weeks ──
    const weekGroups = {};
    const shiftsByDate = {};
    for (const shift of allShifts) {
      const d = new Date(shift.shift_date);
      const weekNum = getWeekNumber(d);
      const dateStr = d.toISOString().split('T')[0];
      if (!weekGroups[weekNum]) weekGroups[weekNum] = {};
      if (!weekGroups[weekNum][dateStr]) weekGroups[weekNum][dateStr] = [];
      weekGroups[weekNum][dateStr].push(shift);
      if (!shiftsByDate[dateStr]) shiftsByDate[dateStr] = [];
      shiftsByDate[dateStr].push(shift);
    }

    const totalWeeks = Math.ceil(daysInMonth / 7);
    const uniqueGuards = new Set(allShifts.map(s => s.guard_code)).size;
    const uniqueSites = new Set(allShifts.map(s => s.site_name)).size;
    const totalSites = sites.length;
    const coveragePct = totalSites > 0 ? Math.round((uniqueSites / totalSites) * 100) : 0;

    // ── Build tab names ──
    const tabNames = [];
    for (let w = 1; w <= totalWeeks; w++) {
      tabNames.push(`Week ${w}`);
    }

    // ── Add all tabs ──
    const addSheetRequests = [];
    let sheetIdCounter = 100;
    const tabSheetIds = { 'Summary': 0 };

    for (const tabName of tabNames) {
      tabSheetIds[tabName] = sheetIdCounter;
      addSheetRequests.push({ addSheet: { properties: { title: tabName, sheetId: sheetIdCounter } } });
      sheetIdCounter++;
    }
    // Changes Log tab
    tabSheetIds['Changes Log'] = sheetIdCounter;
    addSheetRequests.push({ addSheet: { properties: { title: 'Changes Log', sheetId: sheetIdCounter } } });
    sheetIdCounter++;
    // Sites Overview tab
    tabSheetIds['Sites Overview'] = sheetIdCounter;
    addSheetRequests.push({ addSheet: { properties: { title: 'Sites Overview', sheetId: sheetIdCounter } } });

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: fileId,
      requestBody: { requests: addSheetRequests }
    });

    // ══════════════════════════════════════════════════════════
    // POPULATE TABS
    // ══════════════════════════════════════════════════════════

    const allValueUpdates = [];
    const allFormatRequests = [];

    // ── SUMMARY TAB ──
    const summaryData = [
      ['SyntriGuard Schedule Summary'],
      [''],
      ['Month', monthName],
      ['Generated', new Date().toLocaleString('en-GB', { timeZone: 'America/Paramaribo' })],
      [''],
      ['Total Shifts', allShifts.length],
      ['Guards Active', uniqueGuards],
      ['Sites Covered', `${uniqueSites} / ${totalSites}`],
      ['Coverage %', `${coveragePct}%`],
      ['Open Incidents', openIncidents],
      ['Total Revisions', revisions.length],
      [''],
      ['Status Breakdown'],
      ['Scheduled', allShifts.filter(s => s.status === 'scheduled').length],
      ['Completed', allShifts.filter(s => s.status === 'completed').length],
      ['In Progress', allShifts.filter(s => s.status === 'in_progress').length],
      ['Cancelled', allShifts.filter(s => s.status === 'cancelled').length],
      ['Missed', allShifts.filter(s => s.status === 'missed').length],
    ];

    allValueUpdates.push({
      range: 'Summary!A1',
      values: summaryData
    });

    // Summary title formatting
    allFormatRequests.push({
      repeatCell: {
        range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 3 },
        cell: {
          userEnteredFormat: {
            backgroundColor: COLORS.darkBlue,
            textFormat: { bold: true, fontSize: 14, foregroundColor: COLORS.white }
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat)'
      }
    });
    // Summary labels bold
    allFormatRequests.push({
      repeatCell: {
        range: { sheetId: 0, startRowIndex: 2, endRowIndex: 18, startColumnIndex: 0, endColumnIndex: 1 },
        cell: {
          userEnteredFormat: { textFormat: { bold: true } }
        },
        fields: 'userEnteredFormat(textFormat)'
      }
    });

    // ── WEEK TABS ──
    for (let w = 1; w <= totalWeeks; w++) {
      const tabName = `Week ${w}`;
      const sheetId = tabSheetIds[tabName];
      const weekData = weekGroups[w] || {};
      const rows = [];
      let currentRow = 0;
      const bannerRows = [];
      const shiftRowFormats = []; // { rowIndex, color }

      // Header description row
      rows.push([`Week ${w} — ${monthName}`]);
      rows.push([]);
      currentRow = 2;

      // Sort dates
      const dates = Object.keys(weekData).sort();
      // Also include dates that have no shifts for completeness
      const weekStartDay = (w - 1) * 7 + 1;
      const weekEndDay = Math.min(w * 7, daysInMonth);
      const allDatesInWeek = [];
      for (let d = weekStartDay; d <= weekEndDay; d++) {
        const dateObj = new Date(year, monthNum - 1, d);
        allDatesInWeek.push(dateObj.toISOString().split('T')[0]);
      }

      for (const dateStr of allDatesInWeek) {
        const dateShifts = weekData[dateStr] || [];
        // Date banner row
        const bannerText = formatDateBanner(dateStr);
        rows.push([bannerText, '', '', '', '', '', '', '']);
        bannerRows.push(currentRow);
        currentRow++;

        if (dateShifts.length === 0) {
          rows.push(['', '', '', '', '', '', '', 'No shifts scheduled']);
          currentRow++;
        } else {
          // Column headers for this date
          rows.push(['Time', 'Guard ID', 'Guard Name', 'Phone', 'Site', 'Shift Type', 'Status', 'Rev#']);
          const headerRowIdx = currentRow;
          currentRow++;

          for (const shift of dateShifts) {
            const startTime = shift.start_time ? shift.start_time.substring(0, 5) : '';
            const endTime = shift.end_time ? shift.end_time.substring(0, 5) : '';
            const revCount = shift.revision_count || 0;
            rows.push([
              `${startTime} - ${endTime}`,
              shift.guard_code || '',
              shift.guard_name || '',
              shift.phone || '',
              shift.site_name || '',
              shift.shift_type || '',
              shift.status || '',
              revCount > 0 ? `Rev ${revCount}` : ''
            ]);

            // Determine row color
            const color = getStatusColor(shift.status, revCount);
            if (color) {
              shiftRowFormats.push({ rowIndex: currentRow, color });
            }
            // Check if shift was added after initial creation (created_at is after the first day of month + 1 day)
            if (shift.shift_created_at) {
              const createdDate = new Date(shift.shift_created_at);
              const monthStart = new Date(year, monthNum - 1, 1);
              // If created more than 2 days after month start, consider it "added after initial"
              if (createdDate > new Date(monthStart.getTime() + 2 * 86400000) && shift.status !== 'cancelled' && revCount === 0) {
                shiftRowFormats.push({ rowIndex: currentRow, color: COLORS.green });
              }
            }
            currentRow++;
          }
        }
        // Blank row between dates
        rows.push([]);
        currentRow++;
      }

      allValueUpdates.push({
        range: `'${tabName}'!A1`,
        values: rows
      });

      // Week tab title formatting
      allFormatRequests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 8 },
          cell: {
            userEnteredFormat: {
              backgroundColor: COLORS.darkBlue,
              textFormat: { bold: true, fontSize: 12, foregroundColor: COLORS.white }
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)'
        }
      });

      // Date banner formatting (dark blue, white text, bold)
      for (const bannerRow of bannerRows) {
        allFormatRequests.push({
          repeatCell: {
            range: { sheetId, startRowIndex: bannerRow, endRowIndex: bannerRow + 1, startColumnIndex: 0, endColumnIndex: 8 },
            cell: {
              userEnteredFormat: {
                backgroundColor: COLORS.darkBlue,
                textFormat: { bold: true, foregroundColor: COLORS.white }
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)'
          }
        });
        // Merge banner row
        allFormatRequests.push({
          mergeCells: {
            range: { sheetId, startRowIndex: bannerRow, endRowIndex: bannerRow + 1, startColumnIndex: 0, endColumnIndex: 8 },
            mergeType: 'MERGE_ALL'
          }
        });
      }

      // Shift row color coding
      for (const fmt of shiftRowFormats) {
        allFormatRequests.push({
          repeatCell: {
            range: { sheetId, startRowIndex: fmt.rowIndex, endRowIndex: fmt.rowIndex + 1, startColumnIndex: 0, endColumnIndex: 8 },
            cell: {
              userEnteredFormat: { backgroundColor: fmt.color }
            },
            fields: 'userEnteredFormat(backgroundColor)'
          }
        });
      }

      // Auto-resize columns
      allFormatRequests.push({
        autoResizeDimensions: {
          dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 8 }
        }
      });
    }

    // ── CHANGES LOG TAB ──
    const changesSheetId = tabSheetIds['Changes Log'];
    const changesHeader = ['Date', 'Shift ID', 'Rev#', 'Changed By', 'AI?', 'Old Guard', 'New Guard', 'Old Site', 'New Site', 'Old Time', 'New Time', 'Old Status', 'New Status', 'Reason'];
    const changesRows = [changesHeader];
    for (const rev of revisions) {
      changesRows.push([
        rev.created_at ? new Date(rev.created_at).toLocaleString('en-GB') : '',
        rev.shift_id || '',
        rev.revision_number || '',
        rev.changed_by_name || (rev.changed_by_ai ? 'AI' : 'System'),
        rev.changed_by_ai ? 'Yes' : 'No',
        rev.old_guard_name || '',
        rev.new_guard_name || '',
        rev.old_site_name || '',
        rev.new_site_name || '',
        rev.old_start_time ? `${rev.old_start_time}-${rev.old_end_time}` : '',
        rev.new_start_time ? `${rev.new_start_time}-${rev.new_end_time}` : '',
        rev.old_status || '',
        rev.new_status || '',
        rev.reason || ''
      ]);
    }
    if (revisions.length === 0) {
      changesRows.push(['No revisions recorded for this period']);
    }

    allValueUpdates.push({
      range: "'Changes Log'!A1",
      values: changesRows
    });

    allFormatRequests.push({
      repeatCell: {
        range: { sheetId: changesSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 14 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.85, green: 0.55, blue: 0.1 },
            textFormat: { bold: true, foregroundColor: COLORS.white }
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat)'
      }
    });
    allFormatRequests.push({
      autoResizeDimensions: {
        dimensions: { sheetId: changesSheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 14 }
      }
    });

    // ── SITES OVERVIEW TAB ──
    const sitesSheetId = tabSheetIds['Sites Overview'];
    const sitesHeader = ['Site Name', 'Client', 'District', 'Guards Assigned', 'Guards Scheduled (Month)', 'Status'];
    const sitesRows = [sitesHeader];
    for (const site of sites) {
      sitesRows.push([
        site.name,
        site.client_name || '',
        site.district || '',
        site.guards_assigned || 0,
        site.scheduled_guards || 0,
        site.status
      ]);
    }

    allValueUpdates.push({
      range: "'Sites Overview'!A1",
      values: sitesRows
    });

    allFormatRequests.push({
      repeatCell: {
        range: { sheetId: sitesSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 6 },
        cell: {
          userEnteredFormat: {
            backgroundColor: COLORS.headerGreen,
            textFormat: { bold: true, foregroundColor: COLORS.white }
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat)'
      }
    });
    allFormatRequests.push({
      autoResizeDimensions: {
        dimensions: { sheetId: sitesSheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 6 }
      }
    });

    // ══════════════════════════════════════════════════════════
    // WRITE ALL DATA & FORMAT
    // ══════════════════════════════════════════════════════════

    // Batch update values
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: fileId,
      requestBody: {
        valueInputOption: 'RAW',
        data: allValueUpdates
      }
    });

    // Batch update formatting (split into chunks of 100 to avoid API limits)
    const chunkSize = 100;
    for (let i = 0; i < allFormatRequests.length; i += chunkSize) {
      const chunk = allFormatRequests.slice(i, i + chunkSize);
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: fileId,
        requestBody: { requests: chunk }
      });
    }

    // ── Update or insert sheet_registry ──
    if (isUpdate) {
      await db.query(
        'UPDATE sheet_registry SET updated_at = NOW() WHERE sheet_type = $1 AND period = $2',
        ['schedule', monthStr]
      );
    } else {
      await db.query(
        `INSERT INTO sheet_registry (sheet_type, period, spreadsheet_id, spreadsheet_url, folder_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (sheet_type, period) DO UPDATE SET
           spreadsheet_id = EXCLUDED.spreadsheet_id,
           spreadsheet_url = EXCLUDED.spreadsheet_url,
           updated_at = NOW()`,
        ['schedule', monthStr, fileId, url, folderId, req.user.id]
      );
    }

    // Audit log
    await db.query(
      `INSERT INTO audit_log (user_id, action, entity_type, details)
       VALUES ($1, 'sheets_schedule_sync', 'schedule', $2)`,
      [req.user.id, JSON.stringify({
        spreadsheet_id: fileId,
        period: monthStr,
        is_update: isUpdate,
        total_shifts: allShifts.length,
        tabs_created: 2 + totalWeeks + 1 // Summary + weeks + Changes Log + Sites Overview
      })]
    );

    const tabsCreated = ['Summary', ...tabNames, 'Changes Log', 'Sites Overview'];

    res.json({
      spreadsheet_id: fileId,
      url,
      tabs_created: tabsCreated,
      total_shifts: allShifts.length
    });
  } catch (err) {
    console.error('Schedule sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Helper: create a spreadsheet in the SyntriGuard folder ─────
async function createSheet(title, folderId) {
  const authClient = getGoogleAuth();
  const sheetsSvc = google.sheets({ version: 'v4', auth: authClient });
  const drive = google.drive({ version: 'v3', auth: authClient });

  const spreadsheet = await sheetsSvc.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [{ properties: { title: 'Sheet1' } }]
    }
  });

  const fileId = spreadsheet.data.spreadsheetId;
  const sheetId = spreadsheet.data.sheets[0].properties.sheetId;

  if (folderId) {
    try {
      await drive.files.update({
        fileId,
        addParents: folderId,
        removeParents: 'root',
        fields: 'id, parents'
      });
    } catch (e) {
      console.error('Could not move to folder:', e.message);
    }
  }

  return { sheets: sheetsSvc, fileId, sheetId, url: spreadsheet.data.spreadsheetUrl };
}

// ─── POST /api/sheets/roster — export guard roster to Google Sheet ──

router.post('/roster', auth, async (req, res) => {
  try {
    const folderId = req.body.folder_id || process.env.GOOGLE_DRIVE_FOLDER_ID;

    const guards = await db.query(`
      SELECT g.guard_id, g.full_name, g.role, g.phone, g.email, g.status,
             g.performance_score, g.hire_date, s.name as site_name
      FROM guards g
      LEFT JOIN sites s ON g.assigned_site_id = s.id
      ORDER BY g.guard_id
    `);

    const title = `SyntriGuard Guard Roster — ${new Date().toLocaleDateString('en-GB')}`;
    const { sheets, fileId, sheetId, url } = await createSheet(title, folderId);

    const headers = ['Guard ID', 'Name', 'Role', 'Site', 'Phone', 'Email', 'Status', 'Performance', 'Hire Date'];
    const rows = guards.rows.map(g => [
      g.guard_id,
      g.full_name,
      g.role,
      g.site_name || 'Unassigned',
      g.phone || '',
      g.email || '',
      g.status,
      g.performance_score ? g.performance_score + '%' : '—',
      g.hire_date ? new Date(g.hire_date).toLocaleDateString('en-GB') : ''
    ]);

    await sheets.spreadsheets.values.update({
      spreadsheetId: fileId,
      range: 'Sheet1!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [headers, ...rows] }
    });

    const formatRequests = [
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              backgroundColor: COLORS.darkBlue,
              textFormat: { bold: true, foregroundColor: COLORS.white, fontSize: 11 }
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)'
        }
      },
      { autoResizeDimensions: { dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 9 } } },
      // Alternating row colors for readability
      {
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 9 }],
            booleanRule: {
              condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=MOD(ROW(),2)=0' }] },
              format: { backgroundColor: COLORS.lightGrey }
            }
          },
          index: 0
        }
      },
      // Freeze header row
      {
        updateSheetProperties: {
          properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
          fields: 'gridProperties.frozenRowCount'
        }
      }
    ];

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: fileId,
      requestBody: { requests: formatRequests }
    });

    res.json({ success: true, spreadsheet_id: fileId, url, rows: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/sheets/incidents — export incidents to Google Sheet ──

router.post('/incidents', auth, async (req, res) => {
  try {
    const folderId = req.body.folder_id || process.env.GOOGLE_DRIVE_FOLDER_ID;

    const incidents = await db.query(`
      SELECT i.incident_id, i.type, i.severity, i.status, i.description,
             i.damages_srd, i.police_notified, i.filed_at, i.resolved_at,
             s.name as site_name, g.full_name as guard_name
      FROM incidents i
      LEFT JOIN sites s ON i.site_id = s.id
      LEFT JOIN guards g ON i.guard_id = g.id
      ORDER BY i.filed_at DESC
    `);

    const title = `SyntriGuard Incident Log — ${new Date().toLocaleDateString('en-GB')}`;
    const { sheets, fileId, sheetId, url } = await createSheet(title, folderId);

    const headers = ['Incident ID', 'Type', 'Severity', 'Status', 'Site', 'Filed By', 'Date Filed', 'Damages (SRD)', 'Police', 'Resolved', 'Description'];
    const rows = incidents.rows.map(i => [
      i.incident_id,
      i.type,
      i.severity,
      i.status,
      i.site_name || '',
      i.guard_name || '',
      i.filed_at ? new Date(i.filed_at).toLocaleDateString('en-GB') : '',
      i.damages_srd ? `SRD ${Number(i.damages_srd).toLocaleString()}` : '—',
      i.police_notified || 'no',
      i.resolved_at ? new Date(i.resolved_at).toLocaleDateString('en-GB') : 'Pending',
      i.description?.substring(0, 200) || ''
    ]);

    await sheets.spreadsheets.values.update({
      spreadsheetId: fileId,
      range: 'Sheet1!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [headers, ...rows] }
    });

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: fileId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: COLORS.headerRed,
                  textFormat: { bold: true, foregroundColor: COLORS.white }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          },
          { autoResizeDimensions: { dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 11 } } }
        ]
      }
    });

    res.json({ success: true, spreadsheet_id: fileId, url, rows: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/sheets/clients — export clients & sites to Google Sheet ──

router.post('/clients', auth, async (req, res) => {
  try {
    const folderId = req.body.folder_id || process.env.GOOGLE_DRIVE_FOLDER_ID;

    const clients = await db.query(`
      SELECT c.name as client, s.name as site_name, s.address, s.district,
             s.guards_assigned, s.status, c.contract_value_srd
      FROM sites s
      JOIN clients c ON s.client_id = c.id
      ORDER BY c.name, s.name
    `);

    const title = `SyntriGuard Clients & Sites — ${new Date().toLocaleDateString('en-GB')}`;
    const { sheets, fileId, sheetId, url } = await createSheet(title, folderId);

    const headers = ['Client', 'Site', 'Address', 'District', 'Guards', 'Contract (SRD/mo)', 'Status'];
    const rows = clients.rows.map(c => [
      c.client,
      c.site_name,
      c.address || '',
      c.district || '',
      c.guards_assigned || 0,
      c.contract_value_srd ? Number(c.contract_value_srd).toLocaleString() : '—',
      c.status
    ]);

    await sheets.spreadsheets.values.update({
      spreadsheetId: fileId,
      range: 'Sheet1!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [headers, ...rows] }
    });

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: fileId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: COLORS.headerGreen,
                  textFormat: { bold: true, foregroundColor: COLORS.white }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)'
            }
          },
          { autoResizeDimensions: { dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 7 } } }
        ]
      }
    });

    res.json({ success: true, spreadsheet_id: fileId, url, rows: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
