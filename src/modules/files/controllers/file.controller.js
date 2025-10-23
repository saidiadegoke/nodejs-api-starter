const FileService = require('../services/file.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, CREATED, NOT_FOUND, FORBIDDEN, BAD_REQUEST } = require('../../../shared/constants/statusCodes');

class FileController {
  /**
   * Upload file
   */
  static async uploadFile(req, res) {
    try {
      const userId = req.user.user_id;
      const { context } = req.body;
      
      // In production, get file from req.file (multer)
      // For now, mock file object
      const mockFile = {
        originalname: 'test-file.jpg',
        mimetype: 'image/jpeg',
        size: 1024,
        buffer: Buffer.from('mock-data')
      };

      const file = await FileService.uploadFile(mockFile, userId, context);
      
      sendSuccess(res, {
        file_id: file.id,
        file_url: file.file_url,
        file_type: file.file_type,
        file_size: file.file_size,
        provider: file.provider,
        metadata: file.metadata,
        uploaded_at: file.created_at
      }, 'File uploaded successfully', CREATED);
    } catch (error) {
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
   */
  static async uploadBatch(req, res) {
    try {
      const userId = req.user.user_id;
      const { files, context } = req.body;
      
      if (!files || !Array.isArray(files)) {
        return sendError(res, 'Files array is required', BAD_REQUEST);
      }

      const uploadedFiles = [];
      const errors = [];

      for (const fileData of files) {
        try {
          const file = await FileService.uploadFromBase64(fileData, userId, context);
          uploadedFiles.push({
            file_id: file.id,
            file_url: file.file_url,
            file_type: file.file_type,
            file_size: file.file_size,
            uploaded_at: file.created_at
          });
        } catch (error) {
          errors.push({
            file_name: fileData.name || 'unknown',
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

