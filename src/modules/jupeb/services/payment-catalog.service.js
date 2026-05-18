const paymentItemModel = require('../../payments/models/paymentItem.model');
const paymentStructureModel = require('../../payments/models/paymentStructure.model');

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

const FEE_SOURCES = ['affiliation', 'examination', 'fixed'];

/**
 * Admin-managed catalog behind the "Make Payment" screens:
 *   payment_items      — what a payer pays for
 *   payment_structures — how they pay (full / partial)
 */
class PaymentCatalogService {
  // ── Payment items ─────────────────────────────────────────────────
  listItems() {
    return paymentItemModel.listActive();
  }

  listAllItems() {
    return paymentItemModel.findAll();
  }

  async createItem(body) {
    const { code, name, description, fee_source, fixed_amount, sort_order } = body || {};
    if (!code || !String(code).trim()) throw httpError(422, 'code is required');
    if (!name || !String(name).trim()) throw httpError(422, 'name is required');
    const src = fee_source || 'fixed';
    if (!FEE_SOURCES.includes(src)) {
      throw httpError(422, `fee_source must be one of: ${FEE_SOURCES.join(', ')}`);
    }
    if (src === 'fixed' && (fixed_amount == null || Number(fixed_amount) <= 0)) {
      throw httpError(422, 'fixed_amount (> 0) is required when fee_source is "fixed"');
    }
    if (await paymentItemModel.findByCode(code)) {
      throw httpError(409, 'A payment item with this code already exists');
    }
    return paymentItemModel.create({
      code,
      name,
      description: description || null,
      fee_source: src,
      fixed_amount: src === 'fixed' ? Number(fixed_amount) : null,
      sort_order: Number(sort_order) || 0,
    });
  }

  async updateItem(id, body) {
    if (!isUuid(id)) throw httpError(422, 'Invalid payment item id');
    const item = await paymentItemModel.findById(id);
    if (!item) throw httpError(404, 'Payment item not found');
    const fields = body || {};
    if (fields.fee_source !== undefined && !FEE_SOURCES.includes(fields.fee_source)) {
      throw httpError(422, `fee_source must be one of: ${FEE_SOURCES.join(', ')}`);
    }
    const effSource = fields.fee_source || item.fee_source;
    if (effSource === 'fixed') {
      const effAmount = fields.fixed_amount !== undefined ? fields.fixed_amount : item.fixed_amount;
      if (effAmount == null || Number(effAmount) <= 0) {
        throw httpError(422, 'fixed_amount (> 0) is required when fee_source is "fixed"');
      }
    }
    if (fields.code) {
      const dup = await paymentItemModel.findByCode(fields.code);
      if (dup && dup.id !== id) {
        throw httpError(409, 'A payment item with this code already exists');
      }
    }
    return paymentItemModel.update(id, fields);
  }

  async deleteItem(id) {
    if (!isUuid(id)) throw httpError(422, 'Invalid payment item id');
    const ok = await paymentItemModel.softDelete(id);
    if (!ok) throw httpError(404, 'Payment item not found');
    return { deleted: true };
  }

  // ── Payment structures ────────────────────────────────────────────
  listStructures() {
    return paymentStructureModel.listActive();
  }

  listAllStructures() {
    return paymentStructureModel.findAll();
  }

  async createStructure(body) {
    const { code, name, description, allows_partial, sort_order } = body || {};
    if (!code || !String(code).trim()) throw httpError(422, 'code is required');
    if (!name || !String(name).trim()) throw httpError(422, 'name is required');
    if (await paymentStructureModel.findByCode(code)) {
      throw httpError(409, 'A payment structure with this code already exists');
    }
    return paymentStructureModel.create({
      code,
      name,
      description: description || null,
      allows_partial: !!allows_partial,
      sort_order: Number(sort_order) || 0,
    });
  }

  async updateStructure(id, body) {
    if (!isUuid(id)) throw httpError(422, 'Invalid payment structure id');
    const structure = await paymentStructureModel.findById(id);
    if (!structure) throw httpError(404, 'Payment structure not found');
    const fields = body || {};
    if (fields.code) {
      const dup = await paymentStructureModel.findByCode(fields.code);
      if (dup && dup.id !== id) {
        throw httpError(409, 'A payment structure with this code already exists');
      }
    }
    return paymentStructureModel.update(id, fields);
  }

  async deleteStructure(id) {
    if (!isUuid(id)) throw httpError(422, 'Invalid payment structure id');
    const ok = await paymentStructureModel.softDelete(id);
    if (!ok) throw httpError(404, 'Payment structure not found');
    return { deleted: true };
  }
}

module.exports = new PaymentCatalogService();
