/**
 * AWS S3 Configuration
 *
 * NOTE: Requires installation of @aws-sdk/client-s3
 * npm install @aws-sdk/client-s3
 */

const { S3Client } = require('@aws-sdk/client-s3');

const s3Config = {
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
};

const s3Client = new S3Client(s3Config);

const s3BucketName = process.env.AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET || 'opinionpulse-files';
const s3BucketBaseUrl = process.env.AWS_S3_BUCKET_BASE_URL;

module.exports = {
  s3Client,
  s3BucketName,
  s3BucketBaseUrl,
  s3Config
};
