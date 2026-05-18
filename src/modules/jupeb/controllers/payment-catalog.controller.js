const paymentCatalogService = require('../services/payment-catalog.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { CREATED, INTERNAL_SERVER_ERROR } = require('../../../shared/constants/statusCodes');

class PaymentCatalogController {
  // ── Payment items ─────────────────────────────────────────────────
  static async listItems(req, res) {
    try {
      const data = await paymentCatalogService.listItems();
      return sendSuccess(res, data, 'Payment items');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async listAllItems(req, res) {
    try {
      const data = await paymentCatalogService.listAllItems();
      return sendSuccess(res, data, 'Payment items');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async createItem(req, res) {
    try {
      const data = await paymentCatalogService.createItem(req.body);
      return sendSuccess(res, data, 'Payment item created', CREATED);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async updateItem(req, res) {
    try {
      const data = await paymentCatalogService.updateItem(req.params.id, req.body);
      return sendSuccess(res, data, 'Payment item updated');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async deleteItem(req, res) {
    try {
      const data = await paymentCatalogService.deleteItem(req.params.id);
      return sendSuccess(res, data, 'Payment item deleted');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  // ── Payment structures ────────────────────────────────────────────
  static async listStructures(req, res) {
    try {
      const data = await paymentCatalogService.listStructures();
      return sendSuccess(res, data, 'Payment structures');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async listAllStructures(req, res) {
    try {
      const data = await paymentCatalogService.listAllStructures();
      return sendSuccess(res, data, 'Payment structures');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async createStructure(req, res) {
    try {
      const data = await paymentCatalogService.createStructure(req.body);
      return sendSuccess(res, data, 'Payment structure created', CREATED);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async updateStructure(req, res) {
    try {
      const data = await paymentCatalogService.updateStructure(req.params.id, req.body);
      return sendSuccess(res, data, 'Payment structure updated');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async deleteStructure(req, res) {
    try {
      const data = await paymentCatalogService.deleteStructure(req.params.id);
      return sendSuccess(res, data, 'Payment structure deleted');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }
}

module.exports = PaymentCatalogController;
