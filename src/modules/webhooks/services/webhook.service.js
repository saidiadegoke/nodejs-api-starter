const crypto = require('crypto');
const Webhook = require('../models/webhook.model');

/**
 * Webhook service.
 *
 * By default any event name is accepted. If you want a closed set of event
 * names, populate the `VALID_EVENTS` array below and the validators will
 * enforce it.
 */
const VALID_EVENTS = []; // e.g. ['order.created', 'user.registered']

function assertEventsAllowed(events) {
  if (VALID_EVENTS.length === 0) return;
  const invalid = events.filter((e) => !VALID_EVENTS.includes(e));
  if (invalid.length > 0) {
    throw new Error(
      `Invalid event(s): ${invalid.join(', ')}. Valid events: ${VALID_EVENTS.join(', ')}`
    );
  }
}

class WebhookService {
  static async create(userId, data) {
    const { url, events, is_active } = data;

    try {
      new URL(url);
    } catch {
      throw new Error('Invalid webhook URL');
    }

    if (!events || !Array.isArray(events) || events.length === 0) {
      throw new Error('At least one event is required');
    }
    assertEventsAllowed(events);

    const secret = crypto.randomBytes(16).toString('hex');

    return await Webhook.create(userId, {
      url,
      events,
      secret,
      is_active: is_active !== undefined ? is_active : true,
    });
  }

  static async list(userId) {
    return await Webhook.findByUserId(userId);
  }

  static async getById(id, userId) {
    const webhook = await Webhook.findById(id, userId);
    if (!webhook) throw new Error('Webhook not found');
    return webhook;
  }

  static async update(id, userId, data) {
    const existing = await Webhook.findById(id, userId);
    if (!existing) throw new Error('Webhook not found');

    if (data.url) {
      try {
        new URL(data.url);
      } catch {
        throw new Error('Invalid webhook URL');
      }
    }

    if (data.events) {
      if (!Array.isArray(data.events) || data.events.length === 0) {
        throw new Error('At least one event is required');
      }
      assertEventsAllowed(data.events);
    }

    return await Webhook.update(id, userId, data);
  }

  static async delete(id, userId) {
    const existing = await Webhook.findById(id, userId);
    if (!existing) throw new Error('Webhook not found');
    return await Webhook.delete(id, userId);
  }

  /**
   * Fire-and-forget delivery to every active webhook subscribed to `event` for `userId`.
   * The payload is signed with HMAC-SHA256 using the per-webhook secret; signature is sent
   * in the `X-Webhook-Signature` header. Delivery failures are swallowed silently.
   */
  static fire(userId, event, payload) {
    (async () => {
      try {
        const webhooks = await Webhook.findActiveByEvent(userId, event);
        for (const webhook of webhooks) {
          try {
            const body = JSON.stringify({
              event,
              payload,
              timestamp: new Date().toISOString(),
            });
            const signature = crypto
              .createHmac('sha256', webhook.secret)
              .update(body)
              .digest('hex');

            fetch(webhook.url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Signature': signature,
              },
              body,
            }).catch(() => {});
          } catch {
            // swallow per-webhook errors
          }
        }
      } catch {
        // swallow lookup errors
      }
    })();
  }

  static getValidEvents() {
    return VALID_EVENTS;
  }
}

module.exports = WebhookService;
