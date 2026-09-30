import { Injectable } from '@nestjs/common';

@Injectable()
export class RegistrationFormPdfService {
  async renderRegistrationFormPdf(preview: any): Promise<Buffer> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const PDFDocument = require('pdfkit');
      return new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err: Error) => reject(err));

        doc.fontSize(18).text('JUPEB Registration Slip', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Candidate: ${preview.candidate?.full_name || preview.candidate?.name || '—'}`);
        doc.text(`Registration Code: ${preview.candidate?.provisional_candidate_code || '—'}`);
        doc.text(`Candidate Number: ${preview.candidate?.jupeb_candidate_number || 'Pending'}`);
        doc.text(`Institution: ${preview.university?.name || '—'}`);
        doc.text(`Academic Session: ${preview.session?.academic_year || '—'}`);
        doc.text(`Status: ${preview.registration?.status || '—'}`);
        doc.moveDown();
        doc.text(`Generated At: ${new Date().toISOString()}`);

        doc.end();
      });
    } catch {
      // Return a plain text/fallback buffer if pdfkit is not present
      return Buffer.from(`JUPEB Registration Form\nCandidate: ${preview.candidate?.full_name || '—'}`);
    }
  }
}
