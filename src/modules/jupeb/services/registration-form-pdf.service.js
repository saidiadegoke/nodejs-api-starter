/**
 * Render the JUPEB registration form as a PDF.
 *
 * Input is the same composite shape returned by
 * `RegistrationService.getMeSubmissionPreview()`, so the renderer is decoupled
 * from the registration model and easy to unit-test with fixture data.
 */

let PDFDocumentCtor = null;
function getPdfKit() {
  if (PDFDocumentCtor) return PDFDocumentCtor;
  try {
    // eslint-disable-next-line global-require, import/no-unresolved
    PDFDocumentCtor = require('pdfkit');
    return PDFDocumentCtor;
  } catch (err) {
    const e = new Error('pdfkit is not installed. Run `npm install pdfkit`.');
    e.code = 'PDFKIT_UNAVAILABLE';
    e.cause = err;
    throw e;
  }
}

const COLORS = {
  text: '#1a1a2e',
  muted: '#5b6478',
  rule: '#cbd5e1',
  accent: '#1f7a3a',
};

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toISOString().slice(0, 10);
}

function safe(value) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function renderHeader(doc, preview) {
  doc.fillColor(COLORS.accent).fontSize(18).font('Helvetica-Bold').text('JUPEB Registration Form', { align: 'center' });
  doc.moveDown(0.2);
  const uniName = (preview.university && preview.university.name) || '—';
  const sessionLabel = (preview.session && preview.session.academic_year) || '—';
  doc.fillColor(COLORS.muted).fontSize(10).font('Helvetica')
    .text(`${uniName} · Session ${sessionLabel}`, { align: 'center' });
  doc.moveDown(0.5);
  rule(doc);
  doc.moveDown(0.5);
  doc.x = doc.page.margins.left;
}

function renderCandidate(doc, preview) {
  const c = preview.candidate || {};
  doc.x = doc.page.margins.left;
  doc.fillColor(COLORS.text).fontSize(14).font('Helvetica-Bold').text(safe(c.full_name));
  doc.moveDown(0.1);
  doc.fillColor(COLORS.muted).fontSize(10).font('Helvetica')
    .text(`JUPEB number: ${safe(c.jupeb_candidate_number || c.provisional_candidate_code)}`)
    .text(`Status:         ${safe(c.status)}`);
  doc.moveDown(0.4);
  doc.x = doc.page.margins.left;
}

function renderTwoColumn(doc, title, pairs) {
  section(doc, title);
  const left = doc.page.margins.left;
  const colWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2 - 6;
  const right = left + colWidth + 12;

  for (let i = 0; i < pairs.length; i += 2) {
    const a = pairs[i];
    const b = pairs[i + 1];

    const rowStartY = doc.y;

    // Draw left column
    doc.fillColor(COLORS.muted).fontSize(8).font('Helvetica')
      .text(a[0].toUpperCase(), left, rowStartY, { width: colWidth });
    doc.fillColor(COLORS.text).fontSize(11).font('Helvetica-Bold')
      .text(safe(a[1]), left, rowStartY + 11, { width: colWidth });

    const leftEndY = doc.y;

    // Draw right column at the same starting Y
    let rightEndY = rowStartY;
    if (b) {
      doc.fillColor(COLORS.muted).fontSize(8).font('Helvetica')
        .text(b[0].toUpperCase(), right, rowStartY, { width: colWidth });
      doc.fillColor(COLORS.text).fontSize(11).font('Helvetica-Bold')
        .text(safe(b[1]), right, rowStartY + 11, { width: colWidth });
      rightEndY = doc.y;
    }

    // Advance past the taller column + a small gap
    doc.y = Math.max(leftEndY, rightEndY) + 5;
  }
  doc.x = left;
  doc.moveDown(0.25);
}

function drawPair(doc, x, y, width, label, value) {
  doc.fillColor(COLORS.muted).fontSize(8).font('Helvetica').text(label.toUpperCase(), x, y, { width });
  doc.fillColor(COLORS.text).fontSize(11).font('Helvetica-Bold').text(value, x, y + 11, { width });
}

function section(doc, title) {
  doc.x = doc.page.margins.left;
  doc.moveDown(0.35);
  doc.fillColor(COLORS.accent).fontSize(11).font('Helvetica-Bold').text(title.toUpperCase(), doc.page.margins.left);
  doc.moveDown(0.2);
  doc.x = doc.page.margins.left;
}

function rule(doc) {
  const x1 = doc.page.margins.left;
  const x2 = doc.page.width - doc.page.margins.right;
  const y = doc.y;
  doc.strokeColor(COLORS.rule).lineWidth(0.5).moveTo(x1, y).lineTo(x2, y).stroke();
}

function renderBasicInfo(doc, preview) {
  const b = preview.basic_information || {};
  renderTwoColumn(doc, 'Basic information', [
    ['Date of birth', fmtDate(b.date_of_birth)],
    ['Gender', safe(b.gender)],
    ['State of origin', safe(b.state_of_origin)],
    ['LGA', safe(b.lga)],
    ['Place of birth', safe(b.place_of_birth)],
    ['Residential address', safe(b.residential_address)],
  ]);
}

function renderContact(doc, preview) {
  const c = preview.contact_information || {};
  renderTwoColumn(doc, 'Contact information', [
    ['Email', safe(c.email)],
    ['Phone', safe(c.phone)],
  ]);
}

function renderNok(doc, preview) {
  const n = preview.next_of_kin || {};
  const hasData = [n.name, n.relationship, n.phone, n.email, n.address]
    .some((v) => v !== null && v !== undefined && v !== '');
  if (!hasData) return;
  renderTwoColumn(doc, 'Next of kin', [
    ['Name', safe(n.name)],
    ['Relationship', safe(n.relationship)],
    ['Phone', safe(n.phone)],
    ['Email', safe(n.email)],
    ['Address', safe(n.address)],
  ]);
}

function renderSubjectCombination(doc, preview) {
  const sc = preview.subject_combination || {};
  section(doc, 'Subject combination');
  const left = doc.page.margins.left;
  doc.fillColor(COLORS.text).fontSize(11).font('Helvetica-Bold')
    .text(`${safe(sc.code)} — ${safe(sc.title)}`, left);
  doc.moveDown(0.3);
  doc.x = left;
}

function renderAcademic(doc, preview) {
  const groups = preview.academic_details || [];
  section(doc, 'Academic results');
  const left = doc.page.margins.left;

  if (groups.length === 0) {
    doc.fillColor(COLORS.muted).fontSize(10).font('Helvetica').text('No results entered yet.', left);
    doc.moveDown(0.3);
    doc.x = left;
    return;
  }

  const subjectColX = left;
  const gradeColX = left + 280;

  for (const g of groups) {
    doc.fillColor(COLORS.text).fontSize(11).font('Helvetica-Bold')
      .text(`${(g.source || '').toUpperCase()} — Sitting ${g.sitting} (${(g.origins || []).join(', ') || 'manual'})`, left);
    doc.moveDown(0.15);

    const headerY = doc.y;
    doc.fillColor(COLORS.muted).fontSize(8).font('Helvetica');
    doc.text('SUBJECT', subjectColX, headerY);
    doc.text('GRADE', gradeColX, headerY);
    doc.y = headerY + 11;
    rule(doc);
    doc.moveDown(0.2);

    for (const s of g.subjects || []) {
      const rowY = doc.y;
      doc.fillColor(COLORS.text).fontSize(10).font('Helvetica');
      doc.text(safe(s.subject), subjectColX, rowY, { width: 270 });
      doc.text(safe(s.grade), gradeColX, rowY);
      doc.moveDown(0.2);
    }
    doc.moveDown(0.25);
  }
  doc.x = left;
}

function renderBiometricStatus(doc, preview) {
  const status = preview.biometric_status || 'none';
  const types = (preview.biometrics || []).map((b) => b.capture_type);
  const left = doc.page.margins.left;
  doc.x = left;
  doc.moveDown(0.25);
  doc.fillColor(COLORS.accent).fontSize(11).font('Helvetica-Bold').text('BIOMETRIC CAPTURE', left);
  doc.moveDown(0.1);
  doc.fillColor(COLORS.text).fontSize(10).font('Helvetica')
    .text(`Status: ${status}`, left)
    .text(`Captured: ${types.length ? types.join(', ') : 'none'}`, left);
  doc.moveDown(0.3);
  doc.x = left;
}

function renderSignatureBlock(doc) {
  doc.moveDown(0.4);
  rule(doc);
  doc.moveDown(0.4);
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const colWidth = (right - left - 24) / 2;

  const y1 = doc.y;
  doc.fillColor(COLORS.muted).fontSize(8).font('Helvetica').text('CANDIDATE SIGNATURE', left, y1);
  doc.text('DATE', left + colWidth + 24, y1);
  const line1Y = y1 + 22;
  doc.strokeColor(COLORS.rule).lineWidth(0.5)
    .moveTo(left, line1Y).lineTo(left + colWidth, line1Y).stroke()
    .moveTo(left + colWidth + 24, line1Y).lineTo(right, line1Y).stroke();

  const y2 = line1Y + 10;
  doc.fillColor(COLORS.muted).fontSize(8).text('INSTITUTION OFFICIAL', left, y2);
  doc.text('DATE', left + colWidth + 24, y2);
  const line2Y = y2 + 22;
  doc.strokeColor(COLORS.rule).lineWidth(0.5)
    .moveTo(left, line2Y).lineTo(left + colWidth, line2Y).stroke()
    .moveTo(left + colWidth + 24, line2Y).lineTo(right, line2Y).stroke();

  doc.y = line2Y + 8;
  doc.x = left;
}

function renderFooter(doc) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    const origBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.fillColor(COLORS.muted).fontSize(8).font('Helvetica')
      .text(
        `Generated ${new Date().toISOString().slice(0, 10)} · page ${i + 1} of ${range.count}`,
        doc.page.margins.left,
        doc.page.height - 24,
        { align: 'right', width: doc.page.width - doc.page.margins.left - doc.page.margins.right }
      );
    doc.page.margins.bottom = origBottom;
  }
}

class RegistrationFormPdfService {
  /**
   * Render a full PDF for the given submission-preview-shaped payload.
   * @returns {Promise<Buffer>}
   */
  static async render(preview) {
    const PDFDocument = getPdfKit();
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 40, bottom: 40, left: 48, right: 48 },
      bufferPages: true,
      info: {
        Title: `JUPEB Registration Form — ${(preview.candidate && preview.candidate.full_name) || ''}`,
        Subject: 'JUPEB Registration Form',
        Producer: 'reg-portal-api',
      },
    });

    const chunks = [];
    const done = new Promise((resolve, reject) => {
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    renderHeader(doc, preview);
    renderCandidate(doc, preview);
    renderBasicInfo(doc, preview);
    renderContact(doc, preview);
    renderNok(doc, preview);
    renderSubjectCombination(doc, preview);
    renderAcademic(doc, preview);
    renderBiometricStatus(doc, preview);
    renderSignatureBlock(doc);
    renderFooter(doc);

    doc.end();
    return done;
  }
}

module.exports = RegistrationFormPdfService;

