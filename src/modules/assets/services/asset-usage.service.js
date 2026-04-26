const FileModel = require('../../files/models/file.model');

const BYTES_PER_MB = 1024 * 1024;
const BYTES_PER_GB = 1024 * BYTES_PER_MB;

const DEFAULT_STORAGE_LIMIT_MB = Number(process.env.STORAGE_LIMIT_MB || 1024);

function formatBytes(bytes) {
  if (bytes >= BYTES_PER_GB) return `${(bytes / BYTES_PER_GB).toFixed(1)} GB`;
  if (bytes >= BYTES_PER_MB) return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

class AssetUsageService {
  static async getUsage(userId) {
    const storageLimitMb = DEFAULT_STORAGE_LIMIT_MB;
    const storageLimitBytes = storageLimitMb < 0 ? Number.MAX_SAFE_INTEGER : storageLimitMb * BYTES_PER_MB;

    const storageUsedBytes = await FileModel.getStorageUsedBytes(userId);
    const overageBytes = Math.max(0, storageUsedBytes - storageLimitBytes);
    const percentUsed = storageLimitBytes > 0 && storageLimitBytes < Number.MAX_SAFE_INTEGER
      ? Math.min(100, (storageUsedBytes / storageLimitBytes) * 100)
      : 0;

    return {
      storageUsedBytes,
      storageLimitBytes: storageLimitBytes === Number.MAX_SAFE_INTEGER ? -1 : storageLimitBytes,
      storageUsedFormatted: formatBytes(storageUsedBytes),
      storageLimitFormatted: storageLimitBytes < 0 ? 'Unlimited' : formatBytes(storageLimitBytes),
      percentUsed: Math.round(percentUsed * 10) / 10,
      isOverLimit: overageBytes > 0,
      overageBytes
    };
  }

  static async checkCanUpload(userId, additionalBytes) {
    const usage = await this.getUsage(userId);
    if (usage.storageLimitBytes < 0) {
      return { allowed: true, usage };
    }
    const wouldUse = usage.storageUsedBytes + additionalBytes;
    if (wouldUse <= usage.storageLimitBytes) {
      return { allowed: true, usage };
    }
    return {
      allowed: false,
      usage,
      reason: 'Storage limit exceeded.'
    };
  }
}

module.exports = AssetUsageService;
