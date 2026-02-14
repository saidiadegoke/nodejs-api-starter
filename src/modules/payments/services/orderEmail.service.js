/**
 * Send order confirmation & receipt email to customer after successful merchandise payment.
 * Respects site email_settings (send_order_confirmation_to_customer, send_receipt_to_customer).
 */

const sendEmail = require('../../../shared/utils/sendEmail');
const CustomizationModel = require('../../sites/models/customization.model');
const SiteModel = require('../../sites/models/site.model');

const DEFAULT_FROM = process.env.FROM_EMAIL || 'noreply@smartstore.ng';

/**
 * Get email settings for a site. When null/undefined, default to sending both.
 */
function shouldSendOrderEmail(emailSettings) {
  if (!emailSettings || typeof emailSettings !== 'object') return true;
  if (emailSettings.send_order_confirmation_to_customer === false) return false;
  if (emailSettings.send_receipt_to_customer === false) return false;
  return true;
}

/**
 * Build order items table rows HTML from payment metadata.items.
 */
function buildOrderItemsHtml(items, currency = 'NGN') {
  if (!Array.isArray(items) || items.length === 0) {
    return '<tr><td colspan="4">No items</td></tr>';
  }
  return items
    .map((item) => {
      const qty = Number(item.quantity) || 1;
      const unitPrice = Number(item.price) || 0;
      const subtotal = qty * unitPrice;
      const name = (item.name || 'Item').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<tr><td>${name}</td><td>${qty}</td><td>${currency} ${unitPrice.toLocaleString()}</td><td>${currency} ${subtotal.toLocaleString()}</td></tr>`;
    })
    .join('');
}

/**
 * Send order confirmation & receipt email to the customer.
 * Called after payment verification for type === 'merchandise'.
 * Does not throw; logs errors.
 *
 * @param {object} payment - Payment row (with metadata, anonymous_donor_email, amount, currency, etc.)
 */
async function sendOrderConfirmationEmail(payment) {
  const email = payment.anonymous_donor_email || payment.email;
  if (!email || typeof email !== 'string' || !email.trim()) {
    console.warn('[OrderEmail] No customer email for payment', payment.payment_id);
    return;
  }

  const metadata = typeof payment.metadata === 'string' ? JSON.parse(payment.metadata || '{}') : (payment.metadata || {});
  const siteId = metadata.site_id;
  if (!siteId) {
    console.warn('[OrderEmail] No site_id in payment metadata', payment.payment_id);
    return;
  }

  let customization;
  try {
    customization = await CustomizationModel.getCustomization(siteId);
  } catch (e) {
    console.warn('[OrderEmail] Failed to load customization for site', siteId, e.message);
  }

  const rawEmailSettings = customization?.email_settings;
  const emailSettings = rawEmailSettings && typeof rawEmailSettings === 'string'
    ? JSON.parse(rawEmailSettings)
    : rawEmailSettings;

  if (!shouldSendOrderEmail(emailSettings)) {
    return;
  }

  let siteName = 'Store';
  try {
    const site = await SiteModel.getSiteById(siteId);
    if (site && site.name) siteName = site.name;
  } catch (e) {
    // use default
  }

  const items = metadata.items || [];
  const orderItemsHtml = buildOrderItemsHtml(items, payment.currency || 'NGN');
  const receiptRef = payment.transaction_ref || payment.payment_id || '—';
  const paidAt = payment.paid_at || payment.updated_at || new Date();
  const dateStr = new Date(paidAt).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const paymentMethod = (payment.payment_method || 'Card').toString();
  const amount = Number(payment.amount);
  const amountStr = (Number.isNaN(amount) ? 0 : amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const customerName = email.split('@')[0] || 'Customer';

  const placeholders = {
    store_name: siteName,
    customer_name: customerName,
    customer_email: email.trim(),
    order_items_html: orderItemsHtml,
    receipt_ref: receiptRef,
    date: dateStr,
    payment_method: paymentMethod,
    currency: payment.currency || 'NGN',
    amount: amountStr,
    year: new Date().getFullYear().toString(),
  };

  try {
    await sendEmail({
      to: email.trim(),
      subject: `Order confirmation & receipt – ${siteName}`,
      templateFile: 'order-confirmation-receipt.html',
      placeholders,
      fromEmail: DEFAULT_FROM,
    });
  } catch (err) {
    console.error('[OrderEmail] Failed to send order confirmation', { payment_id: payment.payment_id, error: err.message });
  }
}

module.exports = {
  sendOrderConfirmationEmail,
  shouldSendOrderEmail,
  buildOrderItemsHtml,
};
