const { Worker } = require('worker_threads');
const path = require('path');

const sendEmail = ({ to, subject, templateFile, placeholders, replyTo, fromEmail }) => {
  // No-op when SMTP isn't configured (CI / fresh local). Returning a
  // resolved promise keeps callers' fire-and-forget chains happy without
  // spawning a worker that would just fail at connect time.
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    return Promise.resolve(null);
  }
  if (!to) {
    return Promise.resolve(null);
  }
  // Never send real mail during the test suite. Tests load `.env` which
  // includes real SMTP creds; left unchecked, every lifecycle event
  // would try to connect to the live SMTP server (slow + noisy + leaks
  // worker threads that Jest then has to force-kill). Set
  // `JUPEB_EMAIL_FORCE=1` to bypass when manually exercising mail
  // delivery from an integration test.
  if (process.env.NODE_ENV === 'test' && process.env.JUPEB_EMAIL_FORCE !== '1') {
    return Promise.resolve(null);
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'emailWorker.js'));

    // Listen for messages from the worker
    worker.on('message', (result) => {
      if (result.success) {
        resolve(result.messageId);
      } else {
        reject(new Error(result.error));
      }
    });

    // Listen for errors from the worker
    worker.on('error', reject);

    // Listen for exit events from the worker
    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });

    // Send the email details to the worker
    worker.postMessage({ to, subject, templateFile, placeholders, replyTo, fromEmail });
  });
};

module.exports = sendEmail;
