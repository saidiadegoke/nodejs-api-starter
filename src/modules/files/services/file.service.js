const FileModel = require('../models/file.model');
const { v4: uuidv4 } = require('uuid');
const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { s3Client, s3BucketName, s3BucketBaseUrl } = require('../../../shared/config/s3.config');
const path = require('path');

class FileService {
  /**
   * Upload file to S3
   *
   * @param {Object} file - Multer file object (with buffer)
   * @param {string} uploadedBy - User UUID
   * @param {string} context - File context (profile_photo, poll_image, etc.)
   * @returns {Promise<Object>} Uploaded file record
   */
  static async uploadFile(file, uploadedBy, context = 'general') {
    const fileId = uuidv4();
    const fileExtension = path.extname(file.originalname);
    const fileName = `${fileId}${fileExtension}`;
    // For user_assets context, include user ID in path: user_assets/{userId}/{fileName}
    const s3Key = context === 'user_assets' 
      ? `${context}/${uploadedBy}/${fileName}`
      : `${context}/${fileName}`;

    try {
      // Upload to S3
      const uploadParams = {
        Bucket: s3BucketName,
        Key: s3Key,
        Body: file.buffer,
        ContentType: file.mimetype,
        // Make files public by default for easier access
        ACL: 'public-read',
      };

      const command = new PutObjectCommand(uploadParams);
      await s3Client.send(command);

      // Construct S3 URL using base URL if provided, otherwise use default format
      const file_url = s3BucketBaseUrl 
        ? `${s3BucketBaseUrl.replace(/\/$/, '')}/${s3Key}`
        : `https://${s3BucketName}.s3.amazonaws.com/${s3Key}`;

      // Save file record to database
      const fileData = {
        provider: 's3',
        provider_path: s3Key,
        file_url: file_url,
        file_type: file.mimetype,
        file_size: file.size,
        uploaded_by: uploadedBy,
        context: context,
        metadata: {
          original_name: file.originalname,
          uploaded_at: new Date().toISOString(),
          s3_bucket: s3BucketName,
          s3_key: s3Key
        },
        is_public: true
      };

      const uploadedFile = await FileModel.create(fileData);
      return uploadedFile;
    } catch (error) {
      console.error('S3 upload error:', error);
      throw new Error(`Failed to upload file to S3: ${error.message}`);
    }
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

    // Generate signed URL for private files
    if (!file.is_public && file.provider === 's3') {
      try {
        const signedUrl = await this.getSignedUrl(file.provider_path);
        file.file_url = signedUrl;
      } catch (error) {
        console.error('Failed to generate signed URL:', error);
      }
    }

    return file;
  }

  /**
   * Get signed URL for private S3 file
   *
   * @param {string} s3Key - S3 object key
   * @param {number} expiresIn - URL expiration in seconds (default: 1 hour)
   * @returns {Promise<string>} Signed URL
   */
  static async getSignedUrl(s3Key, expiresIn = 3600) {
    try {
      const command = new GetObjectCommand({
        Bucket: s3BucketName,
        Key: s3Key,
      });

      const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
      return signedUrl;
    } catch (error) {
      console.error('Failed to generate signed URL:', error);
      throw new Error('Failed to generate file access URL');
    }
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
   * Get user's uploaded files with filtering and pagination
   */
  static async getUserFiles(userId, filters = {}, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    
    let whereClause = 'uploaded_by = $1 AND deleted_at IS NULL';
    let params = [userId];
    
    if (filters.context) {
      whereClause += ` AND context = $${params.length + 1}`;
      params.push(filters.context);
    }
    
    if (filters.file_type) {
      whereClause += ` AND file_type LIKE $${params.length + 1}`;
      params.push(`${filters.file_type}/%`);
    }
    
    const files = await FileModel.findWithPagination(whereClause, params, offset, limit);
    return files;
  }

  /**
   * Update user's profile photo reference
   */
  static async updateUserProfilePhoto(userId, fileId) {
    const pool = require('../../../db/pool');
    
    try {
      // Update the profiles table with the new profile photo file ID
      const result = await pool.query(
        `UPDATE profiles 
         SET profile_photo_id = $1, updated_at = NOW() 
         WHERE user_id = $2 
         RETURNING id`,
        [fileId, userId]
      );
      
      // If no profile exists, create one
      if (result.rows.length === 0) {
        await pool.query(
          `INSERT INTO profiles (user_id, profile_photo_id) 
           VALUES ($1, $2)`,
          [userId, fileId]
        );
      }
      
      return true;
    } catch (error) {
      console.error('Error updating user profile photo:', error);
      throw new Error('Failed to update profile photo');
    }
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

