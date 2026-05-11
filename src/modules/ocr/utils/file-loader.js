const axios = require('axios');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { s3Client, s3BucketName } = require('../../../shared/config/s3.config');
const FileModel = require('../../files/models/file.model');

/**
 * Load a file's bytes (and metadata) from whichever provider it lives on.
 * Used by the OCR worker so we can pass a real Buffer to providers.
 */

async function streamToBuffer(stream) {
  const chunks = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

async function loadFromS3(s3Key) {
  const command = new GetObjectCommand({ Bucket: s3BucketName, Key: s3Key });
  const response = await s3Client.send(command);
  const body = response.Body;
  if (!body) throw new Error('Empty S3 body');
  if (typeof body.transformToByteArray === 'function') {
    const arr = await body.transformToByteArray();
    return Buffer.from(arr);
  }
  return streamToBuffer(body);
}

async function loadFromUrl(url) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 20000,
    maxContentLength: 50 * 1024 * 1024
  });
  return Buffer.from(response.data);
}

/**
 * @param {string} fileId
 * @returns {Promise<{ buffer: Buffer, file: object, mimeType: string, filename: string }>}
 */
async function loadFileBuffer(fileId) {
  const file = await FileModel.findById(fileId);
  if (!file) {
    const err = new Error('File not found');
    err.code = 'OCR_FILE_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  let buffer;
  if (file.provider === 's3') {
    buffer = await loadFromS3(file.provider_path);
  } else if (file.file_url) {
    buffer = await loadFromUrl(file.file_url);
  } else {
    const err = new Error(`Cannot load buffer for provider ${file.provider}`);
    err.code = 'OCR_FILE_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  return {
    buffer,
    file,
    mimeType: file.file_type,
    filename:
      (file.metadata && file.metadata.original_name) ||
      file.provider_path ||
      `${fileId}`
  };
}

module.exports = { loadFileBuffer };
