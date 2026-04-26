const AdminErrorLogModel = require('../models/adminErrorLog.model');

class AdminErrorLogService {
  static async getStats() {
    return await AdminErrorLogModel.getStats();
  }

  static async list(filters) {
    return await AdminErrorLogModel.list(filters);
  }

  static async getById(id) {
    return await AdminErrorLogModel.getById(id);
  }
}

module.exports = AdminErrorLogService;
