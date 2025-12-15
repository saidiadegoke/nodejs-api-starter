const { Worker } = require('worker_threads');
const path = require('path');

const sendEmail = ({ to, subject, templateFile, placeholders, replyTo, fromEmail }) => {
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
