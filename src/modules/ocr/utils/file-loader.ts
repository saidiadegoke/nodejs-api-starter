import axios from 'axios';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { DataSource } from 'typeorm';

let s3Client: any;
let s3BucketName: string = 'app-files';
try {
  const s3 = require('../../../utils/config/s3.config');
  s3Client = s3.s3Client;
  s3BucketName = s3.s3BucketName || 'app-files';
} catch {
  // s3 fallback
}

async function streamToBuffer(stream: any): Promise<Buffer> {
  const chunks: any[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (c: any) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

async function loadFromS3(s3Key: string): Promise<Buffer> {
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

async function loadFromUrl(url: string): Promise<Buffer> {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 20000,
    maxContentLength: 50 * 1024 * 1024,
  });
  return Buffer.from(response.data);
}

export async function loadFileBuffer(dataSource: DataSource, fileId: string) {
  const rows = await dataSource.query(`SELECT * FROM files WHERE id = $1 AND deleted_at IS NULL`, [fileId]);
  const file = rows[0];
  if (!file) {
    const err: any = new Error('File not found');
    err.code = 'OCR_FILE_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  let buffer: Buffer;
  if (file.provider === 's3' && s3Client) {
    buffer = await loadFromS3(file.provider_path);
  } else if (file.file_url) {
    buffer = await loadFromUrl(file.file_url);
  } else {
    const err: any = new Error(`Cannot load buffer for provider ${file.provider}`);
    err.code = 'OCR_FILE_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  const meta = typeof file.metadata === 'string' ? JSON.parse(file.metadata) : (file.metadata || {});

  return {
    buffer,
    file,
    mimeType: file.file_type,
    filename: meta.original_name || file.provider_path || `${fileId}`,
  };
}
