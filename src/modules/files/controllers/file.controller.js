const FileService = require('../services/file.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, CREATED, NOT_FOUND, FORBIDDEN, BAD_REQUEST } = require('../../../shared/constants/statusCodes');

class FileController {
  /**
   * Upload file
   * Expects multer middleware to have processed the file
   */
  static async uploadFile(req, res) {
    try {
      const userId = req.user.user_id;
      const { context = 'general' } = req.body;

      // Check if file was uploaded
      if (!req.file) {
        return sendError(res, 'No file uploaded', BAD_REQUEST);
      }

      const file = await FileService.uploadFile(req.file, userId, context);

      sendSuccess(res, {
        id: file.id,
        file_id: file.id,
        url: file.file_url,
        file_url: file.file_url,
        file_type: file.file_type,
        file_size: file.file_size,
        provider: file.provider,
        metadata: file.metadata,
        uploaded_at: file.created_at
      }, 'File uploaded successfully', CREATED);
    } catch (error) {
      console.error('Upload file error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Upload file from base64
   */
  static async uploadBase64(req, res) {
    try {
      const userId = req.user.user_id;
      const { file_data, context, file_name } = req.body;
      
      if (!file_data) {
        return sendError(res, 'File data is required', BAD_REQUEST);
      }

      const file = await FileService.uploadFromBase64(file_data, userId, context, file_name);
      
      sendSuccess(res, {
        file_id: file.id,
        file_url: file.file_url,
        file_type: file.file_type,
        file_size: file.file_size,
        uploaded_at: file.created_at
      }, 'File uploaded successfully', CREATED);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get file details
   */
  static async getFile(req, res) {
    try {
      const userId = req.user.user_id;
      const { file_id } = req.params;
      
      const file = await FileService.getFile(file_id, userId);
      
      sendSuccess(res, {
        file_id: file.id,
        file_url: file.file_url,
        file_type: file.file_type,
        file_size: file.file_size,
        provider: file.provider,
        uploaded_by: file.uploaded_by,
        metadata: file.metadata,
        uploaded_at: file.created_at
      }, 'File retrieved successfully', OK);
    } catch (error) {
      if (error.message === 'File not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Delete file
   */
  static async deleteFile(req, res) {
    try {
      const userId = req.user.user_id;
      const { file_id } = req.params;
      
      await FileService.deleteFile(file_id, userId);
      
      sendSuccess(res, null, 'File deleted successfully', OK);
    } catch (error) {
      if (error.message === 'File not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      if (error.message.includes('Not authorized')) {
        return sendError(res, error.message, FORBIDDEN);
      }
      if (error.message.includes('in use')) {
        return sendError(res, error.message, 409); // Conflict
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Upload multiple files (batch)
   * Expects multer middleware to have processed the files
   */
  static async uploadBatch(req, res) {
    try {
      const userId = req.user.user_id;
      const { context = 'general' } = req.body;

      // Check if files were uploaded (multer puts them in req.files)
      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        return sendError(res, 'No files uploaded', BAD_REQUEST);
      }

      const uploadedFiles = [];
      const errors = [];

      for (const file of req.files) {
        try {
          const uploadedFile = await FileService.uploadFile(file, userId, context);
          uploadedFiles.push({
            file_id: uploadedFile.id,
            file_url: uploadedFile.file_url,
            file_type: uploadedFile.file_type,
            file_size: uploadedFile.file_size,
            uploaded_at: uploadedFile.created_at
          });
        } catch (error) {
          errors.push({
            file_name: file.originalname || 'unknown',
            error: error.message
          });
        }
      }

      sendSuccess(res, {
        files: uploadedFiles,
        uploaded_count: uploadedFiles.length,
        failed_count: errors.length,
        errors: errors.length > 0 ? errors : undefined
      }, 'Batch upload completed', CREATED);
    } catch (error) {
      console.error('Batch upload error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Upload profile photo (convenience endpoint)
   */
  static async uploadProfilePhoto(req, res) {
    try {
      const userId = req.user.user_id;

      // Check if file was uploaded
      if (!req.file) {
        return sendError(res, 'No profile photo uploaded', BAD_REQUEST);
      }

      const file = await FileService.uploadFile(req.file, userId, 'profile_photo');

      // Update user's profile photo reference
      await FileService.updateUserProfilePhoto(userId, file.id);

      sendSuccess(res, {
        file_id: file.id,
        file_url: file.file_url,
        file_type: file.file_type,
        file_size: file.file_size,
        uploaded_at: file.created_at
      }, 'Profile photo uploaded successfully', CREATED);
    } catch (error) {
      console.error('Upload profile photo error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get user's uploaded files with filtering
   */
  static async getUserFiles(req, res) {
    try {
      const userId = req.user.user_id;
      const { context, file_type, page = 1, limit = 20 } = req.query;

      const files = await FileService.getUserFiles(userId, { context, file_type }, page, limit);

      sendSuccess(res, {
        files: files.data,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: files.total,
          pages: Math.ceil(files.total / limit)
        }
      }, 'Files retrieved successfully', OK);
    } catch (error) {
      console.error('Get user files error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Create file records from metadata (for testing/mock uploads)
   */
  static async createFromMetadata(req, res) {
    try {
      const userId = req.user.user_id;
      const { files } = req.body;
      
      if (!files || !Array.isArray(files)) {
        return sendError(res, 'Files array is required', BAD_REQUEST);
      }

      const createdFiles = await FileService.createFilesFromMetadata(files, userId);
      
      sendSuccess(res, {
        files: createdFiles,
        uploaded_count: createdFiles.length
      }, 'Files created successfully', CREATED);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = FileController;

