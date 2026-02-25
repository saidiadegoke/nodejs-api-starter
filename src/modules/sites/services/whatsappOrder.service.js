/**
 * WhatsApp Order Service
 * Generates structured order messages and WhatsApp URLs.
 * Used by the public /whatsapp-order endpoint and can be used server-side for order tracking.
 */

const DEFAULT_TEMPLATE = `Hi! I'd like to place an order:

🛒 *Order Details*
━━━━━━━━━━━━━━━
{items}

💰 *Price*
━━━━━━━━━━━━━━━
{price_breakdown}
*Total: {currency}{total_price}*

📍 *Delivery*
━━━━━━━━━━━━━━━
Location: {delivery_zone}

Sent via SmartStore.ng`;

/**
 * Generate a formatted WhatsApp order message.
 * @param {object} orderData
 * @param {Array<{name:string, variants:Array<{group:string,value:string}>, quantity:number, unitPrice:number}>} orderData.items
 * @param {{name:string, fee:number}|null} orderData.deliveryZone
 * @param {string} [orderData.currency] - Currency symbol, default '₦'
 * @param {string} [template] - Message template with placeholders
 */
function generateOrderMessage(orderData, template = DEFAULT_TEMPLATE) {
  const { items, deliveryZone, currency = '₦' } = orderData;

  const itemLines = items.map((item, i) => {
    const variantStr = item.variants && item.variants.length > 0
      ? item.variants.map(v => `${v.group}: ${v.value}`).join(' | ')
      : '';
    const prefix = items.length > 1 ? `${i + 1}. ` : '';
    const variantLine = variantStr ? `\n   ${variantStr}` : '';
    return `${prefix}${item.name}${variantLine}\n   ${item.quantity} × ${currency}${formatNumber(item.unitPrice)}`;
  }).join('\n\n');

  const subtotal = items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
  const deliveryFee = deliveryZone?.fee ?? 0;
  const total = subtotal + deliveryFee;

  const priceBreakdown = deliveryFee > 0
    ? `Subtotal: ${currency}${formatNumber(subtotal)}\nDelivery: ${currency}${formatNumber(deliveryFee)} (${deliveryZone.name})`
    : `Subtotal: ${currency}${formatNumber(subtotal)}`;

  const message = template
    .replace('{items}', itemLines)
    .replace('{price_breakdown}', priceBreakdown)
    .replace('{total_price}', formatNumber(total))
    .replace('{delivery_zone}', deliveryZone?.name || 'To be confirmed')
    .replace('{currency}', currency);

  return message;
}

/**
 * Build a wa.me URL from a phone number and message.
 * Normalizes Nigerian numbers (strip leading 0, prefix with 234).
 */
function generateWhatsAppURL(phoneNumber, message) {
  const cleaned = String(phoneNumber).replace(/\D/g, '');
  const normalized = cleaned.startsWith('0')
    ? '234' + cleaned.substring(1)
    : cleaned.startsWith('234') ? cleaned : '234' + cleaned;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

/**
 * Format a number with Nigerian locale (e.g. 14000 → "14,000").
 */
function formatNumber(num) {
  return Number(num).toLocaleString('en-NG');
}

module.exports = {
  generateOrderMessage,
  generateWhatsAppURL,
  formatNumber,
};
