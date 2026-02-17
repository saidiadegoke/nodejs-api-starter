const Campaign = require('../models/campaign.model');
const Payment = require('../models/payment.model');
const { generateUniqueCampaignSlug } = require('../utils/helpers');

class CampaignController {
  constructor() {
    this.campaignModel = Campaign;
    this.paymentModel = Payment;
  }

  // Get all public campaigns (public)
  async getActiveCampaigns(req, res) {
    try {
      const { page = 1, limit = 20, type, status } = req.query;
      const offset = (page - 1) * limit;

      const options = {
        limit: parseInt(limit),
        offset: parseInt(offset),
        type,
        status, // Allow filtering by status (active, ended, etc.) but default to all
        is_public: true // Only show public campaigns
      };

      const result = await this.campaignModel.findAll(options);

      res.json({
        success: true,
        data: result.campaigns,
        pagination: {
          currentPage: result.page,
          totalPages: result.totalPages,
          totalItems: result.total,
          itemsPerPage: result.limit,
          hasNextPage: result.page < result.totalPages,
          hasPreviousPage: result.page > 1
        },
        message: `Retrieved ${result.campaigns.length} campaigns successfully`
      });
    } catch (error) {
      console.error('Get campaigns error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error retrieving campaigns'
      });
    }
  }

  // Get campaign by slug
  async getCampaign(req, res) {
    try {
      const { slug } = req.params;
      const campaign = await this.campaignModel.findBySlug(slug);

      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found'
        });
      }

      // Check if campaign is public
      const isAdmin = req.user && (req.user.role === 'admin' || req.user.role === 'super_admin');
      if (!campaign.is_public && (!req.user || !isAdmin)) {
        return res.status(403).json({
          success: false,
          message: 'Campaign not accessible'
        });
      }

      res.json({
        success: true,
        data: campaign
      });
    } catch (error) {
      console.error('Get campaign error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error retrieving campaign'
      });
    }
  }

  // Get campaign statistics
  async getCampaignStats(req, res) {
    try {
      const { id } = req.params;
      const stats = await this.campaignModel.getStats(id);

      if (!stats) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found'
        });
      }

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Get campaign stats error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error retrieving campaign statistics'
      });
    }
  }

  // Create campaign (admin only)
  async createCampaign(req, res) {
    try {
      const campaignData = {
        ...req.body,
        created_by: req.user.id
      };

      // Generate slug if not provided
      if (!campaignData.slug) {
        console.log(`Generating slug for campaign: "${campaignData.name}"`);
        campaignData.slug = await generateUniqueCampaignSlug(
          campaignData.name, 
          (slug) => this.campaignModel.slugExists(slug)
        );
        console.log(`Generated unique slug: "${campaignData.slug}"`);
      } else {
        // Ensure provided slug is unique
        console.log(`Ensuring provided slug is unique: "${campaignData.slug}"`);
        const originalSlug = campaignData.slug;
        campaignData.slug = await generateUniqueCampaignSlug(
          campaignData.slug, 
          (slug) => this.campaignModel.slugExists(slug)
        );
        if (originalSlug !== campaignData.slug) {
          console.log(`Slug modified from "${originalSlug}" to "${campaignData.slug}" to ensure uniqueness`);
        }
      }

      const campaign = await this.campaignModel.create(campaignData);

      res.status(201).json({
        success: true,
        message: 'Campaign created successfully',
        data: campaign
      });
    } catch (error) {
      console.error('Create campaign error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error creating campaign'
      });
    }
  }

  // Update campaign (admin only)
  async updateCampaign(req, res) {
    try {
            const { id } = req.params;
      const updateData = req.body;

      const campaign = await this.campaignModel.findById(id);
      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found'
        });
      }

      const updatedCampaign = await this.campaignModel.update(id, updateData);

      res.json({
        success: true,
        message: 'Campaign updated successfully',
        data: updatedCampaign
      });
    } catch (error) {
      console.error('Update campaign error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error updating campaign'
      });
    }
  }

  // Soft delete campaign (admin only)
  async deleteCampaign(req, res) {
    try {
      const { id } = req.params;

      const campaign = await this.campaignModel.findById(id);
      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found'
        });
      }

      // Soft delete the campaign (no need to check for payments)
      await this.campaignModel.delete(id);

      res.json({
        success: true,
        message: 'Campaign deleted successfully'
      });
    } catch (error) {
      console.error('Delete campaign error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error deleting campaign'
      });
    }
  }

  // Restore soft-deleted campaign (admin only)
  async restoreCampaign(req, res) {
    try {
      const { id } = req.params;

      const campaign = await this.campaignModel.findById(id);
      if (campaign) {
        return res.status(400).json({
          success: false,
          message: 'Campaign is not deleted'
        });
      }

      // Check if campaign exists in deleted state
      const deletedCampaign = await this.campaignModel.getDeletedCampaigns({ limit: 1, offset: 0 });
      const exists = deletedCampaign.campaigns.find(c => c.id === id);
      
      if (!exists) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found'
        });
      }

      // Restore the campaign
      await this.campaignModel.restore(id);

      res.json({
        success: true,
        message: 'Campaign restored successfully'
      });
    } catch (error) {
      console.error('Restore campaign error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error restoring campaign'
      });
    }
  }

  // Get all campaigns (admin only)
  async getAllCampaigns(req, res) {
    try {
      const { page = 1, limit = 50, status, type, is_public } = req.query;
      const offset = (page - 1) * limit;

      const options = {
        limit: parseInt(limit),
        offset: parseInt(offset),
        status,
        type,
        is_public: is_public === 'true' ? true : is_public === 'false' ? false : undefined
      };

      const result = await this.campaignModel.findAll(options);

      res.json({
        success: true,
        data: result.campaigns,
        pagination: {
          currentPage: result.page,
          totalPages: result.totalPages,
          totalItems: result.total,
          itemsPerPage: result.limit,
          hasNextPage: result.page < result.totalPages,
          hasPreviousPage: result.page > 1
        },
        message: `Retrieved ${result.campaigns.length} campaigns successfully`
      });
    } catch (error) {
      console.error('Get all campaigns error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error retrieving campaigns'
      });
    }
  }

  // Get campaign by ID (admin only)
  async getCampaignById(req, res) {
    try {
      const { id } = req.params;
      const campaign = await this.campaignModel.findById(id);

      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found'
        });
      }

      res.json({
        success: true,
        data: campaign
      });
    } catch (error) {
      console.error('Get campaign by ID error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error retrieving campaign'
      });
    }
  }

  // Get campaign analytics (admin only)
  async getCampaignAnalytics(req, res) {
    try {
            const { id } = req.params;
      const { timeframe = '30d' } = req.query;

      const analytics = await this.campaignModel.getAnalytics(id, timeframe);

      res.json({
        success: true,
        data: analytics
      });
    } catch (error) {
      console.error('Get campaign analytics error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error retrieving campaign analytics'
      });
    }
  }

  // Get campaign summary statistics (admin only)
  async getCampaignSummaryStats(req, res) {
    try {
            const stats = await this.campaignModel.getSummaryStats();

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Get campaign summary stats error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error retrieving campaign summary statistics'
      });
    }
  }

  // Toggle campaign status (admin only)
  async toggleCampaignStatus(req, res) {
    try {
            const { id } = req.params;
      const { status } = req.body;

      if (!['active', 'paused', 'completed', 'cancelled'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status'
        });
      }

      const campaign = await this.campaignModel.findById(id);
      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found'
        });
      }

      const updatedCampaign = await this.campaignModel.update(id, { status });

      res.json({
        success: true,
        message: 'Campaign status updated successfully',
        data: updatedCampaign
      });
    } catch (error) {
      console.error('Toggle campaign status error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error updating campaign status'
      });
    }
  }

  // Get campaign donors (admin only)
  async getCampaignDonors(req, res) {
    try {
            const { id } = req.params;
      const { page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;

      const query = `
        SELECT DISTINCT 
          COALESCE(u.first_name, p.anonymous_donor_first_name) as first_name,
          COALESCE(u.last_name, p.anonymous_donor_last_name) as last_name,
          COALESCE(u.email, p.anonymous_donor_email) as email,
          COUNT(*) as donation_count,
          SUM(p.amount) as total_donated,
          MAX(p.created_at) as last_donation_date
        FROM payments p
        LEFT JOIN users u ON p.donor_id = u.id
        WHERE p.campaign_id = $1 AND p.status = 'completed'
        GROUP BY u.first_name, u.last_name, u.email, p.anonymous_donor_first_name, p.anonymous_donor_last_name, p.anonymous_donor_email
        ORDER BY total_donated DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await this.campaignModel.pool.query(query, [id, limit, offset]);

      res.json({
        success: true,
        data: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: result.rows.length
        }
      });
    } catch (error) {
      console.error('Get campaign donors error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error retrieving campaign donors'
      });
    }
  }

  // Get campaign payment configuration
  async getCampaignPaymentConfig(req, res) {
    try {
      const { id } = req.params;

      const CampaignPaymentMethod = require('../models/campaign-payment-method.model');
      const CampaignBankAccount = require('../models/campaign-bank-account.model');
      const PaymentMethod = require('../models/paymentMethod.model');
      const BankAccount = require('../models/bankAccount.model');

      // Get current campaign payment methods
      const campaignPaymentMethods = await CampaignPaymentMethod.getByCampaignId(id, true);
      
      // Get current campaign bank accounts
      const campaignBankAccounts = await CampaignBankAccount.getByCampaignId(id, true);
      
      // Get all available payment methods
      const allPaymentMethods = await PaymentMethod.getActiveMethods();
      
      // Get all available bank accounts
      const allBankAccounts = await BankAccount.getAll({ is_active: true });

      res.json({
        success: true,
        data: {
          campaignPaymentMethods,
          campaignBankAccounts,
          availablePaymentMethods: allPaymentMethods.accounts || allPaymentMethods,
          availableBankAccounts: allBankAccounts.accounts || allBankAccounts
        }
      });
    } catch (error) {
      console.error('Get campaign payment config error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error retrieving campaign payment configuration'
      });
    }
  }

  // Update campaign payment methods
  async updateCampaignPaymentMethods(req, res) {
    try {
      const { id } = req.params;
      const { paymentMethods } = req.body;

      if (!Array.isArray(paymentMethods)) {
        return res.status(400).json({
          success: false,
          message: 'Payment methods must be an array'
        });
      }

      const CampaignPaymentMethod = require('../models/campaign-payment-method.model');
      
      // Clear existing payment methods for this campaign
      const existingMethods = await CampaignPaymentMethod.getByCampaignId(id, true);
      for (const method of existingMethods) {
        await CampaignPaymentMethod.delete(method.id);
      }

      // Create new payment method associations
      const createdMethods = [];
      for (const methodData of paymentMethods) {
        const method = await CampaignPaymentMethod.create({
          campaign_id: id,
          payment_method_id: methodData.payment_method_id,
          is_active: methodData.is_active !== false,
          processing_fee_override: methodData.processing_fee_override,
          processing_fee_type_override: methodData.processing_fee_type_override
        });
        createdMethods.push(method);
      }

      res.json({
        success: true,
        message: 'Campaign payment methods updated successfully',
        data: createdMethods
      });
    } catch (error) {
      console.error('Update campaign payment methods error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error updating campaign payment methods'
      });
    }
  }

  // Update campaign bank accounts
  async updateCampaignBankAccounts(req, res) {
    try {
      const { id } = req.params;
      const { bankAccounts } = req.body;

      if (!Array.isArray(bankAccounts)) {
        return res.status(400).json({
          success: false,
          message: 'Bank accounts must be an array'
        });
      }

      const CampaignBankAccount = require('../models/campaign-bank-account.model');
      
      // Clear existing bank accounts for this campaign
      const existingAccounts = await CampaignBankAccount.getByCampaignId(id, true);
      for (const existingAccount of existingAccounts) {
        await CampaignBankAccount.delete(existingAccount.id);
      }

      // Create new bank account associations
      const createdAccounts = [];
      for (const accountData of bankAccounts) {
        const account = await CampaignBankAccount.create({
          campaign_id: id,
          bank_account_id: accountData.bank_account_id,
          is_primary: accountData.is_primary || false,
          is_active: accountData.is_active !== false
        });
        createdAccounts.push(account);
      }

      res.json({
        success: true,
        message: 'Campaign bank accounts updated successfully',
        data: createdAccounts
      });
    } catch (error) {
      console.error('Update campaign bank accounts error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error updating campaign bank accounts'
      });
    }
  }

  // Upload expense breakdown document for campaign
  async uploadExpenseBreakdown(req, res) {
    try {
      const campaignId = req.params.id;
      const fileId = req.body.fileId;

      if (!fileId) {
        return res.status(400).json({
          success: false,
          message: 'File ID is required'
        });
      }

      // Check if campaign exists
      const campaign = await this.campaignModel.findById(campaignId);
      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found'
        });
      }

      // Update campaign with expense breakdown document
      const updatedCampaign = await this.campaignModel.update(campaignId, {
        expense_breakdown_document: fileId
      });

      res.json({
        success: true,
        message: 'Expense breakdown document uploaded successfully',
        data: {
          campaignId: updatedCampaign.id,
          expenseBreakdownDocument: updatedCampaign.expense_breakdown_document
        }
      });
    } catch (error) {
      console.error('Upload expense breakdown error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error uploading expense breakdown document'
      });
    }
  }

  // Remove expense breakdown document from campaign
  async removeExpenseBreakdown(req, res) {
    try {
      const campaignId = req.params.id;

      // Check if campaign exists
      const campaign = await this.campaignModel.findById(campaignId);
      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found'
        });
      }

      // Update campaign to remove expense breakdown document
      await this.campaignModel.update(campaignId, {
        expense_breakdown_document: null
      });

      res.json({
        success: true,
        message: 'Expense breakdown document removed successfully'
      });
    } catch (error) {
      console.error('Remove expense breakdown error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error removing expense breakdown document'
      });
    }
  }
}

module.exports = new CampaignController(); 