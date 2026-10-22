const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

let transporter = null;

function getTransporter() {
  if (!transporter && process.env.SMTP_HOST && process.env.SMTP_USER) {
    const port = Number(process.env.SMTP_PORT) || 465;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }
  return transporter;
}

function renderEmailHtml(templateFile, placeholders, to) {
  const candidatePaths = [
    path.join(__dirname, '../../modules/mail/mail-templates', templateFile),
    path.join(process.cwd(), 'src/modules/mail/mail-templates', templateFile),
    path.join(process.cwd(), 'dist/modules/mail/mail-templates', templateFile),
    path.join(__dirname, '../emails', templateFile),
  ];
  const templatePath = candidatePaths.find((p) => fs.existsSync(p)) || candidatePaths[0];
  if (!fs.existsSync(templatePath)) {
    console.error(`Email template file not found: ${templateFile}`);
    return null;
  }

  let htmlContent = fs.readFileSync(templatePath, 'utf-8');

  if (Array.isArray(placeholders)) {
    let placeholderIndex = 0;
    const sanitized = placeholders.map((val, idx) => {
      if (idx === 0 && typeof val === 'string' && (!val.trim() || val.trim().toLowerCase() === 'there')) {
        return 'User';
      }
      return val;
    });
    htmlContent = htmlContent.replace(/%s/g, (match) => {
      if (placeholderIndex < sanitized.length) {
        return sanitized[placeholderIndex++];
      }
      return match;
    });
  } else if (typeof placeholders === 'object' && placeholders !== null) {
    const ph = { ...placeholders };
    const rawFirst = ph.firstName ? String(ph.firstName).trim() : '';
    const rawName = ph.name ? String(ph.name).trim() : '';
    const rawUni = ph.universityName ? String(ph.universityName).trim() : '';
    const rawRole = ph.role ? String(ph.role).trim() : '';

    const resolvedFirstName =
      (rawFirst && rawFirst.toLowerCase() !== 'there' ? rawFirst : '') ||
      (rawName && rawName.toLowerCase() !== 'there' ? rawName : '') ||
      rawUni ||
      (rawRole ? `${rawRole.replace(/_/g, ' ')} User` : '') ||
      'User';

    ph.firstName = resolvedFirstName;
    if (!ph.name || String(ph.name).trim().toLowerCase() === 'there') {
      ph.name = resolvedFirstName;
    }

    htmlContent = htmlContent.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return ph[key] !== undefined && ph[key] !== null
        ? String(ph[key])
        : match;
    });

    if (htmlContent.includes('%s')) {
      let fallbackList;
      const tFile = String(templateFile || '').toLowerCase();
      if (tFile.includes('password-reset-success')) {
        const date = ph.resetDate || ph.date || new Date().toISOString();
        const url = ph.loginUrl || ph.portalUrl || '';
        fallbackList = [resolvedFirstName, date, url, date, ph.email || to || ''];
      } else if (tFile.includes('welcome')) {
        const url = ph.portalUrl || ph.loginUrl || ph.welcomeUrl || ph.url || '';
        fallbackList = [resolvedFirstName, url, ph.email || to || ''];
      } else if (tFile.includes('direct-transfer')) {
        fallbackList = [
          ph.appName || 'JUPEB Portal',
          resolvedFirstName,
          ph.amount || '',
          ph.reference || '',
          ph.bankName || '',
          ph.accountName || '',
          ph.accountNumber || '',
          ph.statusUrl || '',
          ph.statusUrl || '',
          ph.appName || 'JUPEB Portal',
        ];
      } else {
        const url = ph.verifyUrl || ph.resetUrl || ph.loginUrl || ph.url || '';
        fallbackList = [
          resolvedFirstName,
          url,
          url,
          ph.email || to || '',
        ];
      }
      let idx = 0;
      htmlContent = htmlContent.replace(/%s/g, (match) => {
        if (idx < fallbackList.length) {
          return fallbackList[idx++];
        }
        return match;
      });
    }
  }

  return htmlContent;
}

const sendEmail = async ({ to, subject, templateFile, placeholders, replyTo, fromEmail }) => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    return null;
  }
  if (!to) {
    return null;
  }
  if (process.env.NODE_ENV === 'test' && process.env.JUPEB_EMAIL_FORCE !== '1') {
    return 'mock-test-message-id';
  }

  const transport = getTransporter();
  if (!transport) return null;

  try {
    const htmlContent = renderEmailHtml(templateFile, placeholders, to);
    if (!htmlContent) return null;

    const logoLocations = [
      path.join(__dirname, '../../modules/mail/mail-templates/assets/logo.png'),
      path.join(process.cwd(), 'src/modules/mail/mail-templates/assets/logo.png'),
      path.join(__dirname, '../assets/logo.png'),
      path.join(process.cwd(), 'logo.png'),
    ];
    const resolvedLogoPath = logoLocations.find((p) => fs.existsSync(p));

    const attachments = [];
    if (resolvedLogoPath) {
      attachments.push({
        filename: 'logo.png',
        path: resolvedLogoPath,
        cid: 'jupeb-logo',
      });
    }

    const appName = process.env.APP_NAME || 'Registration Portal';
    const from = fromEmail || process.env.FROM_EMAIL || process.env.SMTP_USER;

    const mailOptions = {
      from: `"${appName}" <${from}>`,
      to,
      subject,
      html: htmlContent,
      ...(attachments.length > 0 && { attachments }),
      ...(replyTo && { replyTo }),
    };

    const info = await transport.sendMail(mailOptions);
    return info.messageId;
  } catch (error) {
    console.error('Error sending email:', error && error.message);
    return null;
  }
};

sendEmail.renderEmailHtml = renderEmailHtml;
module.exports = sendEmail;
