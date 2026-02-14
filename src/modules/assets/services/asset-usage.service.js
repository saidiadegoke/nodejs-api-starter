const FileModel = require('../../files/models/file.model');
const SubscriptionModel = require('../../payments/models/subscription.model');
const PlanConfigService = require('../../payments/services/planConfig.service');

const BYTES_PER_MB = 1024 * 1024;
const BYTES_PER_GB = 1024 * BYTES_PER_MB;

/**
 * Format bytes as human-readable string
 */
function formatBytes(bytes) {
  if (bytes >= BYTES_PER_GB) {
    return `${(bytes / BYTES_PER_GB).toFixed(1)} GB`;
  }
  if (bytes >= BYTES_PER_MB) {
    return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

/**
 * Get plan name for display
 */
function planDisplayName(planType) {
  const names = {
    free: 'Free',
    small_scale: 'Small Scale',
    medium_scale: 'Medium Scale',
    large_scale: 'Large Scale'
  };
  return names[planType] || planType;
}

/**
 * Asset Usage Service
 * Computes storage usage and limits from plan_configs + files; exposes overage rates from plan_configs.overage_rates
 */
class AssetUsageService {
  /**
   * Get current storage usage and limits for a user
   * @param {string} userId
   * @param {string} [currency] - For overage price (default NGN)
   * @returns {Promise<Object>} usage payload for API
   */
  static async getUsage(userId, currency = 'NGN') {
    const subscription = await SubscriptionModel.getActiveSubscription(userId);
    const planType = subscription?.plan_type || 'free';

    const planConfig = await PlanConfigService.getConfigByType(planType);
    const limits = typeof planConfig.limits === 'string' ? JSON.parse(planConfig.limits) : planConfig.limits;
    const overageRates = typeof planConfig.overage_rates === 'string'
      ? (planConfig.overage_rates ? JSON.parse(planConfig.overage_rates) : {})
      : (planConfig.overage_rates || {});

    const storageLimitMb = limits.storage != null ? Number(limits.storage) : 100;
    const storageLimitBytes = storageLimitMb < 0 ? Number.MAX_SAFE_INTEGER : storageLimitMb * BYTES_PER_MB;

    const storageUsedBytes = await FileModel.getStorageUsedBytes(userId);
    const overageBytes = Math.max(0, storageUsedBytes - storageLimitBytes);
    const percentUsed = storageLimitBytes > 0 && storageLimitBytes < Number.MAX_SAFE_INTEGER
      ? Math.min(100, (storageUsedBytes / storageLimitBytes) * 100)
      : 0;
    const isOverLimit = overageBytes > 0;

    const storagePerGbMonth = overageRates.storage_per_gb_month || {};
    const overagePricePerGbPerMonth = storagePerGbMonth[currency] != null
      ? Number(storagePerGbMonth[currency])
      : (storagePerGbMonth.NGN != null ? Number(storagePerGbMonth.NGN) : 0);

    return {
      storageUsedBytes,
      storageLimitBytes: storageLimitBytes === Number.MAX_SAFE_INTEGER ? -1 : storageLimitBytes,
      storageUsedFormatted: formatBytes(storageUsedBytes),
      storageLimitFormatted: storageLimitBytes < 0 ? 'Unlimited' : formatBytes(storageLimitBytes),
      percentUsed: Math.round(percentUsed * 10) / 10,
      isOverLimit,
      overageBytes,
      planName: planDisplayName(planType),
      planType,
      overagePricePerGbPerMonth,
      currency
    };
  }

  /**
   * Check if user can upload additional bytes (under limit or overage allowed)
   * @param {string} userId
   * @param {number} additionalBytes
   * @param {boolean} allowOverage - If true, only returns false when overage not configured
   * @returns {Promise<{ allowed: boolean, usage?: Object, reason?: string }>}
   */
  static async checkCanUpload(userId, additionalBytes, allowOverage = true) {
    const usage = await this.getUsage(userId);
    if (usage.storageLimitBytes < 0) {
      return { allowed: true, usage };
    }
    const wouldUse = usage.storageUsedBytes + additionalBytes;
    if (wouldUse <= usage.storageLimitBytes) {
      return { allowed: true, usage };
    }
    if (allowOverage && usage.overagePricePerGbPerMonth != null && usage.overagePricePerGbPerMonth > 0) {
      return { allowed: true, usage };
    }
    return {
      allowed: false,
      usage,
      reason: 'Storage limit exceeded. Upgrade your plan or free up space.'
    };
  }
}

module.exports = AssetUsageService;
