/**
 * S3-compatible storage (AWS S3 or DigitalOcean Spaces)
 *
 * Select backend with S3_PROVIDER=aws|digitalocean
 * Requires: @aws-sdk/client-s3
 */

const { S3Client } = require('@aws-sdk/client-s3');

const S3_PROVIDERS = ['aws', 'digitalocean'];

function envFirst(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined && value !== '') {
      return value;
    }
  }
  return undefined;
}

const s3Provider = (() => {
  const raw = (process.env.S3_PROVIDER || 'aws').toLowerCase();
  if (!S3_PROVIDERS.includes(raw)) {
    throw new Error(`Invalid S3_PROVIDER "${raw}". Use: ${S3_PROVIDERS.join(', ')}`);
  }
  return raw;
})();

let s3Region;
let s3BucketName;
let s3BucketBaseUrl;
let s3Config;

if (s3Provider === 'digitalocean') {
  const accessKeyId = envFirst('DO_SPACES_ACCESS_KEY', 'NEXT_PUBLIC_DO_SPACES_ACCESS_KEY');
  const secretAccessKey = envFirst('DO_SPACES_SECRET', 'NEXT_PUBLIC_DO_SPACES_SECRET');
  const spacesRegion = envFirst('DO_SPACES_REGION', 'NEXT_PUBLIC_DO_SPACES_REGION');
  const endpoint = envFirst('DO_SPACES_ENDPOINT', 'NEXT_PUBLIC_DO_SPACES_ENDPOINT');

  s3BucketName = envFirst('DO_SPACES_BUCKET', 'NEXT_PUBLIC_DO_SPACES_BUCKET') || 'app-files';
  s3BucketBaseUrl = process.env.AWS_S3_BUCKET_BASE_URL;
  s3Region = 'us-east-1';

  s3Config = {
    region: s3Region,
    endpoint,
    forcePathStyle: false,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  };
} else {
  s3Region = process.env.AWS_REGION || 'us-east-1';
  s3BucketName =
    process.env.AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET || 'app-files';
  s3BucketBaseUrl = process.env.AWS_S3_BUCKET_BASE_URL;

  s3Config = {
    region: s3Region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  };
}

const s3Client = new S3Client(s3Config);

/**
 * Build a public object URL for an S3 key.
 * @param {string} s3Key
 * @returns {string}
 */
function buildPublicObjectUrl(s3Key) {
  if (s3BucketBaseUrl) {
    return `${s3BucketBaseUrl.replace(/\/$/, '')}/${s3Key}`;
  }

  if (s3Provider === 'digitalocean') {
    const spacesRegion = envFirst('DO_SPACES_REGION', 'NEXT_PUBLIC_DO_SPACES_REGION');
    if (spacesRegion) {
      return `https://${s3BucketName}.${spacesRegion}.digitaloceanspaces.com/${s3Key}`;
    }
    const endpoint = envFirst('DO_SPACES_ENDPOINT', 'NEXT_PUBLIC_DO_SPACES_ENDPOINT');
    if (endpoint) {
      const base = endpoint.replace(/\/$/, '');
      return `${base}/${s3BucketName}/${s3Key}`;
    }
  }

  return `https://${s3BucketName}.s3.${s3Region}.amazonaws.com/${s3Key}`;
}

module.exports = {
  s3Client,
  s3BucketName,
  s3BucketBaseUrl,
  s3Config,
  s3Provider,
  buildPublicObjectUrl,
};
