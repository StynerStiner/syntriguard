const router = require('express').Router();
const PDFDocument = require('pdfkit');
const db = require('../db');
const auth = require('../middleware/auth');

// Helper: draw a table row
function drawTableRow(doc, y, cells, widths, opts = {}) {
  let x = 50;
  const fontSize = opts.fontSize || 9;
  const bold = opts.bold || false;

  doc.fontSize(fontSize);
  if (bold) doc.font('Helvetica-Bold');
  else doc.font('Helvetica');

  cells.forEach((cell, i) => {
    doc.text(String(cell || '—'), x, y, { width: widths[i], align: 'left' });
    x += widths[i];
  });
}

// GET /api/pdf/schedule?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/schedule', auth, async (req, res) => {
  try {
    const { start, end } = req.query;
    const startDate = start || new Date().toISOString().split('T')[0];
    const endDate = end || new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    const shifts = await db.query(`
      SELECT sh.shift_date, sh.start_time, sh.end_time, sh.shift_type, sh.status,
             g.full_name as guard_name, g.guard_id, s.name as site_name
      FROM shifts sh
      JOIN guards g ON sh.guard_id = g.id
      JOIN sites s ON sh.site_id = s.id
      WHERE sh.shift_date BETWEEN $1 AND $2
      ORDER BY sh.shift_date, sh.start_time
    `, [startDate, endDate]);

    const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="SyntriGuard_Schedule_${startDate}_to_${endDate}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('SyntriGuard Security Services NV', { align: 'center' });
    doc.fontSize(12).font('Helvetica').text(`Shift Schedule: ${startDate} to ${endDate}`, { align: 'center' });
    doc.fontSize(9).text(`Generated: ${new Date().toLocaleString('en-US', { timeZone: 'America/Paramaribo' })}`, { align: 'center' });
    doc.moveDown(1.5);

    // Table header
    const widths = [80, 55, 55, 80, 150, 120, 80];
    const headers = ['Date', 'Start', 'End', 'Type', 'Guard', 'Site', 'Status'];
    let y = doc.y;

    doc.rect(50, y - 5, widths.reduce((a, b) => a + b, 0), 20).fill('#1a3a5c');
    doc.fillColor('#ffffff');
    drawTableRow(doc, y, headers, widths, { bold: true, fontSize: 10 });
    doc.fillColor('#000000');
    y += 25;

    // Table rows
    let lastDate = '';
    for (const shift of shifts.rows) {
      if (y > 520) {
        doc.addPage();
        y = 50;
        doc.rect(50, y - 5, widths.reduce((a, b) => a + b, 0), 20).fill('#1a3a5c');
        doc.fillColor('#ffffff');
        drawTableRow(doc, y, headers, widths, { bold: true, fontSize: 10 });
        doc.fillColor('#000000');
        y += 25;
      }

      const dateStr = new Date(shift.shift_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const showDate = dateStr !== lastDate ? dateStr : '';
      lastDate = dateStr;

      if (showDate) {
        doc.rect(50, y - 3, widths.reduce((a, b) => a + b, 0), 18).fill('#f0f4f8');
        doc.fillColor('#000000');
      }

      drawTableRow(doc, y, [
        showDate,
        shift.start_time?.substring(0, 5),
        shift.end_time?.substring(0, 5),
        shift.shift_type || '—',
        `${shift.guard_name} (${shift.guard_id})`,
        shift.site_name,
        shift.status
      ], widths);
      y += 18;
    }

    // Footer
    doc.moveDown(2);
    doc.fontSize(8).font('Helvetica').text(
      `Total shifts: ${shifts.rows.length} | SyntriGuard Security Services NV | Keizerstraat 72, Paramaribo | +597 520-8800`,
      50, doc.y, { align: 'center' }
    );

    doc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pdf/incident/:id
router.get('/incident/:id', auth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT i.*, s.name as site_name, s.address as site_address,
             g.full_name as guard_name, g.guard_id, g.phone as guard_phone
      FROM incidents i
      LEFT JOIN sites s ON i.site_id = s.id
      LEFT JOIN guards g ON i.guard_id = g.id
      WHERE i.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Incident not found' });
    const inc = result.rows[0];

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="SyntriGuard_Incident_${inc.incident_id}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('SyntriGuard Security Services NV', { align: 'center' });
    doc.fontSize(14).text('INCIDENT REPORT', { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#1a3a5c');
    doc.moveDown(1);

    // Incident details
    const field = (label, value) => {
      doc.fontSize(10).font('Helvetica-Bold').text(label + ': ', { continued: true });
      doc.font('Helvetica').text(String(value || '—'));
    };

    field('Incident ID', inc.incident_id);
    field('Type', inc.type);
    field('Severity', inc.severity?.toUpperCase());
    field('Status', inc.status?.toUpperCase());
    doc.moveDown(0.5);

    field('Site', inc.site_name);
    field('Site Address', inc.site_address);
    field('Specific Location', inc.specific_location);
    doc.moveDown(0.5);

    field('Filed By', `${inc.guard_name} (${inc.guard_id})`);
    field('Guard Phone', inc.guard_phone);
    field('Date Filed', inc.filed_at ? new Date(inc.filed_at).toLocaleString() : '—');
    field('Date Resolved', inc.resolved_at ? new Date(inc.resolved_at).toLocaleString() : 'Pending');
    doc.moveDown(0.5);

    field('Damages (SRD)', inc.damages_srd ? `SRD ${Number(inc.damages_srd).toLocaleString()}` : 'None reported');
    field('Police Notified', inc.police_notified);
    field('Follow-up Required', inc.followup_required ? 'Yes' : 'No');
    doc.moveDown(1);

    // Description
    doc.fontSize(11).font('Helvetica-Bold').text('Description:');
    doc.fontSize(10).font('Helvetica').text(inc.description || 'No description provided.');
    doc.moveDown(1);

    if (inc.additional_notes) {
      doc.fontSize(11).font('Helvetica-Bold').text('Additional Notes:');
      doc.fontSize(10).font('Helvetica').text(inc.additional_notes);
      doc.moveDown(1);
    }

    // Signature lines
    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(250, doc.y).stroke();
    doc.fontSize(9).text('Reporting Guard Signature', 50, doc.y + 5);

    doc.moveTo(300, doc.y - 5).lineTo(545, doc.y - 5).stroke();
    doc.text('Operations Supervisor Signature', 300, doc.y);

    // Footer
    doc.moveDown(3);
    doc.fontSize(8).text(
      `SyntriGuard Security Services NV | Keizerstraat 72, Paramaribo | +597 520-8800 | operations@syntriguard.sr`,
      50, doc.y, { align: 'center' }
    );

    doc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pdf/roster — full guard roster PDF
router.get('/roster', auth, async (req, res) => {
  try {
    const guards = await db.query(`
      SELECT g.guard_id, g.full_name, g.role, g.phone, g.status, g.performance_score,
             s.name as site_name
      FROM guards g
      LEFT JOIN sites s ON g.assigned_site_id = s.id
      ORDER BY g.guard_id
    `);

    const doc = new PDFDocument({ margin: 50, layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="SyntriGuard_Guard_Roster.pdf"');
    doc.pipe(res);

    doc.fontSize(20).font('Helvetica-Bold').text('SyntriGuard Security Services NV', { align: 'center' });
    doc.fontSize(14).text('Guard Roster', { align: 'center' });
    doc.fontSize(9).font('Helvetica').text(`Generated: ${new Date().toLocaleString('en-US', { timeZone: 'America/Paramaribo' })}`, { align: 'center' });
    doc.moveDown(1.5);

    const widths = [55, 130, 90, 130, 80, 75, 80];
    const headers = ['ID', 'Name', 'Role', 'Site', 'Phone', 'Score', 'Status'];
    let y = doc.y;

    doc.rect(50, y - 5, widths.reduce((a, b) => a + b, 0), 20).fill('#1a3a5c');
    doc.fillColor('#ffffff');
    drawTableRow(doc, y, headers, widths, { bold: true, fontSize: 10 });
    doc.fillColor('#000000');
    y += 25;

    for (const g of guards.rows) {
      drawTableRow(doc, y, [
        g.guard_id,
        g.full_name,
        g.role,
        g.site_name || 'Unassigned',
        g.phone || '—',
        g.performance_score ? g.performance_score + '%' : '—',
        g.status
      ], widths);
      y += 18;
    }

    doc.moveDown(2);
    doc.fontSize(8).font('Helvetica').text(
      `Total guards: ${guards.rows.length} | SyntriGuard Security Services NV | Keizerstraat 72, Paramaribo`,
      50, y + 20, { align: 'center' }
    );

    doc.end();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
