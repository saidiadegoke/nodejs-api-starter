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
  doc.moveDown(0.6);
  rule(doc);
  doc.moveDown(0.6);
}

function renderCandidate(doc, preview) {
  const c = preview.candidate || {};
  doc.fillColor(COLORS.text).fontSize(14).font('Helvetica-Bold').text(safe(c.full_name));
  doc.moveDown(0.1);
  doc.fillColor(COLORS.muted).fontSize(10).font('Helvetica')
    .text(`Candidate code: ${safe(c.provisional_candidate_code)}`)
    .text(`JUPEB number:   ${safe(c.jupeb_candidate_number)}`)
    .text(`Status:         ${safe(c.status)}`);
  doc.moveDown(0.6);
}

function renderTwoColumn(doc, title, pairs) {
  section(doc, title);
  const colWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2 - 6;
  const left = doc.page.margins.left;
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
    if (b) {
      doc.fillColor(COLORS.muted).fontSize(8).font('Helvetica')
        .text(b[0].toUpperCase(), right, rowStartY, { width: colWidth });
      doc.fillColor(COLORS.text).fontSize(11).font('Helvetica-Bold')
        .text(safe(b[1]), right, rowStartY + 11, { width: colWidth });
    }

    const rightEndY = doc.y;

    // Advance past the taller column + a small gap
    doc.y = Math.max(leftEndY, rightEndY) + 6;
  }
  doc.moveDown(0.4);
}

function drawPair(doc, x, y, width, label, value) {
  doc.fillColor(COLORS.muted).fontSize(8).font('Helvetica').text(label.toUpperCase(), x, y, { width });
  doc.fillColor(COLORS.text).fontSize(11).font('Helvetica-Bold').text(value, x, y + 11, { width });
}

function section(doc, title) {
  doc.moveDown(0.4);
  doc.fillColor(COLORS.accent).fontSize(11).font('Helvetica-Bold').text(title.toUpperCase());
  doc.moveDown(0.2);
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
  doc.fillColor(COLORS.text).fontSize(11).font('Helvetica-Bold').text(safe(sc.code) + ' — ' + safe(sc.title));
  doc.moveDown(0.4);
}

function renderAcademic(doc, preview) {
  const groups = preview.academic_details || [];
  section(doc, 'Academic results');
  if (groups.length === 0) {
    doc.fillColor(COLORS.muted).fontSize(10).font('Helvetica').text('No results entered yet.');
    doc.moveDown(0.4);
    return;
  }
  for (const g of groups) {
    doc.fillColor(COLORS.text).fontSize(11).font('Helvetica-Bold')
      .text(`${(g.source || '').toUpperCase()} — Sitting ${g.sitting} (${(g.origins || []).join(', ') || 'manual'})`);
    doc.moveDown(0.2);

    const subjectColX = doc.page.margins.left;
    const gradeColX = doc.page.margins.left + 280;
    const normColX = doc.page.margins.left + 360;
    const scoreColX = doc.page.margins.left + 420;

    doc.fillColor(COLORS.muted).fontSize(8).font('Helvetica');
    doc.text('SUBJECT', subjectColX, doc.y, { continued: true, width: 280 });
    doc.text('GRADE', gradeColX - subjectColX, undefined, { continued: true });
    doc.text('A–F', normColX - gradeColX, undefined, { continued: true });
    doc.text('SCORE', scoreColX - normColX);
    doc.moveDown(0.1);
    rule(doc);
    doc.moveDown(0.2);

    for (const s of g.subjects || []) {
      doc.fillColor(COLORS.text).fontSize(10).font('Helvetica');
      const y = doc.y;
      doc.text(safe(s.subject), subjectColX, y, { width: 270 });
      doc.text(safe(s.grade), gradeColX, y);
      doc.text(safe(s.grade_normalized), normColX, y);
      doc.text(s.score === null || s.score === undefined ? '—' : String(s.score), scoreColX, y);
      doc.moveDown(0.2);
    }
    doc.moveDown(0.3);
  }
}

function renderBiometricStatus(doc, preview) {
  const status = preview.biometric_status || 'none';
  const types = (preview.biometrics || []).map((b) => b.capture_type);
  doc.moveDown(0.3);
  doc.fillColor(COLORS.accent).fontSize(11).font('Helvetica-Bold').text('BIOMETRIC CAPTURE', { continued: false });
  doc.fillColor(COLORS.text).fontSize(10).font('Helvetica')
    .text(`Status: ${status}`)
    .text(`Captured: ${types.length ? types.join(', ') : 'none'}`);
  doc.moveDown(0.4);
}

function renderSignatureBlock(doc) {
  doc.moveDown(1);
  rule(doc);
  doc.moveDown(0.6);
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const colWidth = (right - left - 24) / 2;

  doc.fillColor(COLORS.muted).fontSize(8).font('Helvetica').text('CANDIDATE SIGNATURE', left, doc.y);
  doc.fillColor(COLORS.muted).text('DATE', left + colWidth + 24, doc.y - 9);
  doc.moveDown(2);
  doc.strokeColor(COLORS.rule).lineWidth(0.5)
    .moveTo(left, doc.y).lineTo(left + colWidth, doc.y).stroke()
    .moveTo(left + colWidth + 24, doc.y).lineTo(right, doc.y).stroke();
  doc.moveDown(0.8);
  doc.fillColor(COLORS.muted).fontSize(8).text('INSTITUTION OFFICIAL', left, doc.y);
  doc.text('DATE', left + colWidth + 24, doc.y - 9);
  doc.moveDown(2);
  doc.strokeColor(COLORS.rule).lineWidth(0.5)
    .moveTo(left, doc.y).lineTo(left + colWidth, doc.y).stroke()
    .moveTo(left + colWidth + 24, doc.y).lineTo(right, doc.y).stroke();
}

function renderFooter(doc) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    doc.fillColor(COLORS.muted).fontSize(8).font('Helvetica')
      .text(
        `Generated ${new Date().toISOString().slice(0, 10)} · page ${i + 1} of ${range.count}`,
        doc.page.margins.left,
        doc.page.height - doc.page.margins.bottom + 10,
        { align: 'right', width: doc.page.width - doc.page.margins.left - doc.page.margins.right }
      );
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
      margins: { top: 56, bottom: 64, left: 48, right: 48 },
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
