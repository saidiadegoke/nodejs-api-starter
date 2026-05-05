const crypto = require('crypto');
const ApiKey = require('../models/apiKey.model');

/**
 * API Key Service.
 * Keys are hashed (SHA-256) before storage; the raw key is only returned at creation time.
 * Format: `sk_live_<8 hex>` prefix + 56 more hex chars.
 */
class ApiKeyService {
  static async generate(userId, name) {
    if (!name || !name.trim()) {
      throw new Error('API key name is required');
    }

    const rawKey = crypto.randomBytes(32).toString('hex');
    const keyPrefix = 'sk_live_' + rawKey.substring(0, 8);
    const fullKey = keyPrefix + rawKey.substring(8);
    const keyHash = crypto.createHash('sha256').update(fullKey).digest('hex');

    const record = await ApiKey.create(userId, name.trim(), keyPrefix, keyHash);

    return {
      id: record.id,
      name: record.name,
      key: fullKey,
      key_prefix: record.key_prefix,
      status: record.status,
      created_at: record.created_at,
    };
  }

  static async list(userId) {
    return await ApiKey.findByUserId(userId);
  }

  static async revoke(id, userId) {
    const key = await ApiKey.revoke(id, userId);
    if (!key) {
      throw new Error('API key not found');
    }
    return key;
  }

  /**
   * Hash an incoming raw key and look it up. Touches last_used_at on success.
   */
  static async authenticate(rawKey) {
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyRecord = await ApiKey.findByHash(keyHash);
    if (!keyRecord) {
      throw new Error('Invalid API key');
    }
    ApiKey.touchLastUsed(keyRecord.id).catch(() => {});
    return keyRecord;
  }
}

module.exports = ApiKeyService;
