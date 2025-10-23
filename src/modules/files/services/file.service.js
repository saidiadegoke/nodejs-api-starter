const FileModel = require('../models/file.model');
const { v4: uuidv4 } = require('uuid');

class FileService {
  /**
   * Upload file (mock implementation)
   * In production, this would upload to S3/R2/Cloudinary
   */
  static async uploadFile(file, uploadedBy, context = 'general') {
    // Mock file upload - in production, upload to actual storage provider
    const fileId = uuidv4();
    const provider = process.env.DEFAULT_FILE_PROVIDER || 'mock';
    
    // Mock file data
    const fileData = {
      provider: provider,
      provider_path: `/uploads/${context}/${fileId}`,
      file_url: `https://cdn.runcitygo.com/uploads/${context}/${fileId}`,
      file_type: file.mimetype || 'application/octet-stream',
      file_size: file.size || 0,
      uploaded_by: uploadedBy,
      context: context,
      metadata: {
        original_name: file.originalname || file.name || 'file',
        uploaded_at: new Date().toISOString()
      },
      is_public: context === 'profile_photo' // Public for profile photos
    };

    const uploadedFile = await FileModel.create(fileData);
    return uploadedFile;
  }

  /**
   * Upload file from base64
   */
  static async uploadFromBase64(base64Data, uploadedBy, context = 'general', fileName = 'file') {
    // Mock implementation
    const fileId = uuidv4();
    const provider = process.env.DEFAULT_FILE_PROVIDER || 'mock';
    
    // Extract file type from base64 if present
    const matches = base64Data.match(/^data:(.+);base64,/);
    const mimeType = matches ? matches[1] : 'application/octet-stream';
    
    // Estimate size (base64 is ~33% larger than binary)
    const base64Length = base64Data.replace(/^data:.+;base64,/, '').length;
    const fileSize = Math.floor((base64Length * 3) / 4);

    const fileData = {
      provider: provider,
      provider_path: `/uploads/${context}/${fileId}`,
      file_url: `https://cdn.runcitygo.com/uploads/${context}/${fileId}`,
      file_type: mimeType,
      file_size: fileSize,
      uploaded_by: uploadedBy,
      context: context,
      metadata: {
        original_name: fileName,
        uploaded_at: new Date().toISOString(),
        upload_method: 'base64'
      },
      is_public: context === 'profile_photo'
    };

    const uploadedFile = await FileModel.create(fileData);
    return uploadedFile;
  }

  /**
   * Get file by ID
   */
  static async getFile(fileId, userId) {
    const file = await FileModel.findById(fileId);
    
    if (!file) {
      throw new Error('File not found');
    }

    // Check access permissions
    if (!file.is_public && file.uploaded_by !== userId) {
      // In production, check if user has access to the order/resource that references this file
      // For now, allow access
    }

    return file;
  }

  /**
   * Delete file
   */
  static async deleteFile(fileId, userId) {
    const file = await FileModel.findById(fileId);
    
    if (!file) {
      throw new Error('File not found');
    }

    // Check ownership
    if (file.uploaded_by !== userId) {
      throw new Error('Not authorized to delete this file');
    }

    // Check if file is in use
    const inUse = await FileModel.isInUse(fileId);
    if (inUse) {
      throw new Error('File is in use and cannot be deleted');
    }

    // Soft delete
    await FileModel.softDelete(fileId);
    
    // In production, also delete from storage provider
    return true;
  }

  /**
   * Get files by context
   */
  static async getFilesByContext(context, userId) {
    const files = await FileModel.findByContext(context, userId);
    return files;
  }

  /**
   * Create file records from metadata (for testing/mock uploads)
   */
  static async createFilesFromMetadata(filesMetadata, uploadedBy) {
    const createdFiles = [];

    for (const fileData of filesMetadata) {
      const file = await FileModel.create({
        provider: fileData.provider || 'mock',
        provider_path: fileData.provider_path || `/mock/${uuidv4()}`,
        file_url: fileData.file_url || `https://mock-cdn.com/${uuidv4()}`,
        file_type: fileData.file_type || 'application/octet-stream',
        file_size: fileData.file_size || 0,
        uploaded_by: uploadedBy,
        context: fileData.context || 'general',
        metadata: fileData.metadata || {},
        is_public: fileData.is_public || false
      });

      createdFiles.push({
        file_id: file.id,
        file_url: file.file_url,
        file_type: file.file_type,
        file_size: file.file_size,
        uploaded_at: file.created_at
      });
    }

    return createdFiles;
  }
}

module.exports = FileService;

