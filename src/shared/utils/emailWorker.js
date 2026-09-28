const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { parentPort } = require('worker_threads');

// Load environment variables from .env file
dotenv.config();

// Create a transporter using the SMTP configuration. `secure` MUST be derived
// from the port: 465 uses implicit TLS (true); 587/25/2525 use STARTTLS
// (false → nodemailer upgrades automatically). Hard-coding `true` on port 587
// breaks the TLS handshake immediately.
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

// Function to replace placeholders and send the email
const sendEmail = async ({ to, subject, templateFile, placeholders, replyTo, fromEmail }) => {
  try {
    // Read the HTML template from the file
    const templatePath = path.join(__dirname, '../emails', templateFile); // Adjust the path as needed
    console.log('temp path', templatePath)
    let htmlContent = fs.readFileSync(templatePath, 'utf-8');

    // Replace placeholders with actual values in the template
    // Handle both %s placeholders and {{variableName}} placeholders
    if (Array.isArray(placeholders)) {
      // Handle %s placeholders (array-based)
      let placeholderIndex = 0;
      htmlContent = htmlContent.replace(/%s/g, (match) => {
        if (placeholderIndex < placeholders.length) {
          return placeholders[placeholderIndex++];
        }
        return match; // Keep %s if we run out of placeholders
      });
    } else if (typeof placeholders === 'object' && placeholders !== null) {
      // Handle {{variableName}} placeholders (object-based)
      htmlContent = htmlContent.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return placeholders[key] !== undefined ? placeholders[key] : match;
      });
    }

    // Attach actual JUPEB logo file as inline CID attachment
    const logoLocations = [
      path.join(__dirname, '../assets/logo.png'),
      path.join(__dirname, '../emails/assets/logo.png'),
      path.join(__dirname, '../../../logo.png'),
    ];
    const resolvedLogoPath = logoLocations.find((p) => fs.existsSync(p));

    const attachments = [];
    if (resolvedLogoPath) {
      attachments.push({
        filename: 'logo.png',
        path: resolvedLogoPath,
        cid: 'jupeb-logo', // Matches <img src="cid:jupeb-logo" ...>
      });
    }

    // Mail options configuration
    const mailOptions = {
      from: `"${process.env.APP_NAME || 'App'}" <${fromEmail || process.env.FROM_EMAIL}>`,
      to,
      subject,
      html: htmlContent,
      ...(attachments.length > 0 && { attachments }),
      ...(replyTo && { replyTo }), // Include replyTo if provided
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent: %s', info.messageId);
    parentPort.postMessage({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error('Error sending email: ', error);
    parentPort.postMessage({ success: false, error: error.message });
  }
};

// Listen for messages from the main thread
parentPort.on('message', sendEmail);
