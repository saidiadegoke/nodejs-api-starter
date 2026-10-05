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
      htmlContent = htmlContent.replace(/%s/g, (match) => {
        if (placeholderIndex < placeholders.length) {
          return placeholders[placeholderIndex++];
        }
        return match;
      });
    } else if (typeof placeholders === 'object' && placeholders !== null) {
      htmlContent = htmlContent.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return placeholders[key] !== undefined && placeholders[key] !== null
          ? String(placeholders[key])
          : match;
      });
    }

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

module.exports = sendEmail;
