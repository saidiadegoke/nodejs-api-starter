const pool = require('../../../db/pool');

class FileModel {
  /**
   * Create file record
   */
  static async create(fileData) {
    const {
      provider,
      provider_path,
      file_url,
      file_type,
      file_size,
      uploaded_by,
      context,
      metadata = {},
      is_public = false
    } = fileData;

    const result = await pool.query(
      `INSERT INTO files (provider, provider_path, file_url, file_type, file_size, uploaded_by, context, metadata, is_public)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [provider, provider_path, file_url, file_type, file_size, uploaded_by, context, JSON.stringify(metadata), is_public]
    );

    return result.rows[0];
  }

  /**
   * Find file by ID
   */
  static async findById(fileId) {
    const result = await pool.query(
      'SELECT * FROM files WHERE id = $1 AND deleted_at IS NULL',
      [fileId]
    );
    return result.rows[0];
  }

  /**
   * Find files by context and user
   */
  static async findByContext(context, userId) {
    const result = await pool.query(
      'SELECT * FROM files WHERE context = $1 AND uploaded_by = $2 AND deleted_at IS NULL ORDER BY created_at DESC',
      [context, userId]
    );
    return result.rows;
  }

  /**
   * Soft delete file
   */
  static async softDelete(fileId) {
    const result = await pool.query(
      'UPDATE files SET deleted_at = NOW() WHERE id = $1 RETURNING id',
      [fileId]
    );
    return result.rows[0];
  }

  /**
   * Check if file is in use (referenced by other tables)
   */
  static async isInUse(fileId) {
    // Check order reference photos
    const refPhotos = await pool.query(
      'SELECT 1 FROM order_reference_photos WHERE file_id = $1 LIMIT 1',
      [fileId]
    );
    
    if (refPhotos.rows.length > 0) return true;

    // Check order progress photos
    const progressPhotos = await pool.query(
      'SELECT 1 FROM order_progress_photos WHERE file_id = $1 LIMIT 1',
      [fileId]
    );
    
    if (progressPhotos.rows.length > 0) return true;

    // Check profile photos
    const profilePhotos = await pool.query(
      'SELECT 1 FROM profiles WHERE profile_photo_url = $1 LIMIT 1',
      [fileId]
    );
    
    return profilePhotos.rows.length > 0;
  }
}

module.exports = FileModel;

