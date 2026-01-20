const earlyAdopterService = require('../services/earlyAdopter.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, CREATED, BAD_REQUEST, NOT_FOUND } = require('../../../shared/constants/statusCodes');

class EarlyAdopterController {
  /**
   * Register new early adopter (public)
   */
  static async register(req, res) {
    try {
      const { name, email, business_name } = req.body;

      // Validation
      if (!name || !name.trim()) {
        return sendError(res, 'Name is required', BAD_REQUEST);
      }

      if (!email || !email.trim()) {
        return sendError(res, 'Email is required', BAD_REQUEST);
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return sendError(res, 'Invalid email address', BAD_REQUEST);
      }

      if (!business_name || !business_name.trim()) {
        return sendError(res, 'Business name is required', BAD_REQUEST);
      }

      // Create early adopter record
      const earlyAdopter = await earlyAdopterService.createEarlyAdopter({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        business_name: business_name.trim(),
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
      });

      // Send notification email to admin
      try {
        await earlyAdopterService.sendNotificationEmail({
          name: earlyAdopter.name,
          email: earlyAdopter.email,
          business_name: earlyAdopter.business_name,
        });
      } catch (emailError) {
        // Log error but don't fail the request
        console.error('Failed to send notification email:', emailError);
      }

      // Send welcome email to early adopter
      try {
        await earlyAdopterService.sendWelcomeEmail({
          name: earlyAdopter.name,
          email: earlyAdopter.email,
        });
      } catch (emailError) {
        // Log error but don't fail the request
        console.error('Failed to send welcome email:', emailError);
      }

      sendSuccess(res, earlyAdopter, 'Early adopter application submitted successfully', CREATED);
    } catch (error) {
      console.error('Early adopter registration error:', error);
      
      // Check for duplicate email
      if (error.code === '23505' || error.message.includes('already exists')) {
        return sendError(res, 'This email has already been registered as an early adopter', BAD_REQUEST);
      }

      sendError(res, error.message || 'Failed to submit early adopter application', BAD_REQUEST);
    }
  }

  /**
   * Get all early adopters (admin only)
   */
  static async getAll(req, res) {
    try {
      const { status, search, page = 1, limit = 50 } = req.query;

      const filters = {
        status: status || null,
        search: search || null,
        page: parseInt(page),
        limit: parseInt(limit),
      };

      const result = await earlyAdopterService.getAllEarlyAdopters(filters);
      sendSuccess(res, result, 'Early adopters retrieved successfully', OK);
    } catch (error) {
      console.error('Error getting early adopters:', error);
      sendError(res, error.message || 'Failed to retrieve early adopters', BAD_REQUEST);
    }
  }

  /**
   * Get single early adopter by ID (admin only)
   */
  static async getById(req, res) {
    try {
      const { id } = req.params;
      const earlyAdopter = await earlyAdopterService.getEarlyAdopterById(parseInt(id));

      if (!earlyAdopter) {
        return sendError(res, 'Early adopter not found', NOT_FOUND);
      }

      sendSuccess(res, earlyAdopter, 'Early adopter retrieved successfully', OK);
    } catch (error) {
      console.error('Error getting early adopter:', error);
      sendError(res, error.message || 'Failed to retrieve early adopter', BAD_REQUEST);
    }
  }

  /**
   * Update early adopter (admin only)
   */
  static async update(req, res) {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;

      // Validate status if provided
      const validStatuses = ['pending', 'contacted', 'approved', 'rejected'];
      if (status && !validStatuses.includes(status)) {
        return sendError(res, `Invalid status. Must be one of: ${validStatuses.join(', ')}`, BAD_REQUEST);
      }

      const updateData = {};
      if (status) updateData.status = status;
      if (notes !== undefined) updateData.notes = notes;

      // If marking as contacted, set contacted_at
      if (status === 'contacted') {
        updateData.contacted_at = new Date();
      }

      const earlyAdopter = await earlyAdopterService.updateEarlyAdopter(parseInt(id), updateData);

      if (!earlyAdopter) {
        return sendError(res, 'Early adopter not found', NOT_FOUND);
      }

      sendSuccess(res, earlyAdopter, 'Early adopter updated successfully', OK);
    } catch (error) {
      console.error('Error updating early adopter:', error);
      sendError(res, error.message || 'Failed to update early adopter', BAD_REQUEST);
    }
  }
}

module.exports = EarlyAdopterController;

