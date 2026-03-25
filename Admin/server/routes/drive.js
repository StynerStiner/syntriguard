const router = require('express').Router();
const path = require('path');
const { google } = require('googleapis');
const PDFDocument = require('pdfkit');
const { Readable } = require('stream');
const db = require('../db');
const auth = require('../middleware/auth');

// Google Drive integration
// Requires: GOOGLE_SERVICE_ACCOUNT_KEY (path to service account JSON) in .env
// Or: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN for OAuth

function getGoogleAuth() {
  // Prefer OAuth (works with free Gmail accounts)
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_REFRESH_TOKEN) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    return oauth2Client;
  }

  // Fallback: Service Account (requires Google Workspace)
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    const keyPath = path.resolve(__dirname, '..', process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const key = require(keyPath);
    return new google.auth.GoogleAuth({
      credentials: key,
      scopes: ['https://www.googleapis.com/auth/drive.file']
    });
  }

  throw new Error('Google Drive not configured. Run: node google-oauth-setup.js');
}

// Generate schedule PDF as a buffer (reusable)
async function generateSchedulePDF(startDate, endDate) {
  const shifts = await db.query(`
    SELECT sh.shift_date, sh.start_time, sh.end_time, sh.shift_type, sh.status,
           g.full_name as guard_name, g.guard_id, s.name as site_name
    FROM shifts sh
    JOIN guards g ON sh.guard_id = g.id
    JOIN sites s ON sh.site_id = s.id
    WHERE sh.shift_date BETWEEN $1 AND $2
    ORDER BY sh.shift_date, sh.start_time
  `, [startDate, endDate]);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).font('Helvetica-Bold').text('SyntriGuard Security Services NV', { align: 'center' });
    doc.fontSize(12).font('Helvetica').text(`Shift Schedule: ${startDate} to ${endDate}`, { align: 'center' });
    doc.fontSize(9).text(`Generated: ${new Date().toLocaleString('en-US', { timeZone: 'America/Paramaribo' })}`, { align: 'center' });
    doc.moveDown(1.5);

    const widths = [80, 55, 55, 80, 150, 120, 80];
    const headers = ['Date', 'Start', 'End', 'Type', 'Guard', 'Site', 'Status'];
    let y = doc.y;

    doc.rect(50, y - 5, widths.reduce((a, b) => a + b, 0), 20).fill('#1a3a5c');
    doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold');
    let x = 50;
    headers.forEach((h, i) => { doc.text(h, x, y, { width: widths[i] }); x += widths[i]; });
    doc.fillColor('#000000');
    y += 25;

    for (const shift of shifts.rows) {
      doc.fontSize(9).font('Helvetica');
      x = 50;
      const cells = [
        new Date(shift.shift_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
        shift.start_time?.substring(0, 5),
        shift.end_time?.substring(0, 5),
        shift.shift_type || '—',
        `${shift.guard_name} (${shift.guard_id})`,
        shift.site_name,
        shift.status
      ];
      cells.forEach((c, i) => { doc.text(String(c), x, y, { width: widths[i] }); x += widths[i]; });
      y += 18;
    }

    doc.fontSize(8).text(
      `Total shifts: ${shifts.rows.length} | SyntriGuard Security Services NV`,
      50, y + 20, { align: 'center' }
    );

    doc.end();
  });
}

// POST /api/drive/upload-schedule — generate schedule PDF and upload to Google Drive
router.post('/upload-schedule', auth, async (req, res) => {
  try {
    const { start, end, folder_id } = req.body;
    const startDate = start || new Date().toISOString().split('T')[0];
    const endDate = end || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    const authClient = getGoogleAuth();
    const drive = google.drive({ version: 'v3', auth: authClient });

    // Generate PDF
    const pdfBuffer = await generateSchedulePDF(startDate, endDate);
    const fileName = `SyntriGuard_Schedule_${startDate}_to_${endDate}.pdf`;

    // Upload to Drive
    const fileMetadata = {
      name: fileName,
      mimeType: 'application/pdf'
    };
    if (folder_id) fileMetadata.parents = [folder_id];

    const media = {
      mimeType: 'application/pdf',
      body: Readable.from(pdfBuffer)
    };

    const file = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink, webContentLink',
      supportsAllDrives: true
    });

    // Audit log
    await db.query(
      `INSERT INTO audit_log (user_id, action, entity_type, details)
       VALUES ($1, 'drive_upload', 'schedule', $2)`,
      [req.user.id, JSON.stringify({ file_id: file.data.id, file_name: fileName })]
    );

    res.json({
      success: true,
      file: {
        id: file.data.id,
        name: file.data.name,
        view_url: file.data.webViewLink,
        download_url: file.data.webContentLink
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/drive/upload-incident — generate incident report and upload
router.post('/upload-incident', auth, async (req, res) => {
  try {
    const { incident_id, folder_id } = req.body;

    const result = await db.query(`
      SELECT i.*, s.name as site_name, s.address as site_address,
             g.full_name as guard_name, g.guard_id, g.phone as guard_phone
      FROM incidents i
      LEFT JOIN sites s ON i.site_id = s.id
      LEFT JOIN guards g ON i.guard_id = g.id
      WHERE i.id = $1
    `, [incident_id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Incident not found' });
    const inc = result.rows[0];

    const authClient = getGoogleAuth();
    const drive = google.drive({ version: 'v3', auth: authClient });

    // Generate incident PDF
    const pdfBuffer = await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(20).font('Helvetica-Bold').text('INCIDENT REPORT', { align: 'center' });
      doc.moveDown();
      doc.fontSize(11).font('Helvetica');
      doc.text(`Incident: ${inc.incident_id} | Type: ${inc.type} | Severity: ${inc.severity}`);
      doc.text(`Site: ${inc.site_name} | Guard: ${inc.guard_name} (${inc.guard_id})`);
      doc.text(`Filed: ${inc.filed_at ? new Date(inc.filed_at).toLocaleString() : '—'}`);
      doc.moveDown();
      doc.text(inc.description || 'No description.');
      doc.end();
    });

    const fileName = `SyntriGuard_Incident_${inc.incident_id}.pdf`;
    const fileMetadata = { name: fileName, mimeType: 'application/pdf' };
    if (folder_id) fileMetadata.parents = [folder_id];

    const file = await drive.files.create({
      requestBody: fileMetadata,
      media: { mimeType: 'application/pdf', body: Readable.from(pdfBuffer) },
      fields: 'id, name, webViewLink',
      supportsAllDrives: true
    });

    res.json({ success: true, file: { id: file.data.id, name: file.data.name, view_url: file.data.webViewLink } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
