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
   * Find files with pagination
   */
  static async findWithPagination(whereClause, params, offset, limit) {
    // Get total count
    const countQuery = `SELECT COUNT(*) FROM files WHERE ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Get paginated data
    const dataQuery = `
      SELECT * FROM files 
      WHERE ${whereClause} 
      ORDER BY created_at DESC 
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const dataResult = await pool.query(dataQuery, [...params, limit, offset]);

    return {
      data: dataResult.rows,
      total
    };
  }

  /**
   * Check if file is in use (referenced by other tables)
   */
  static async isInUse(fileId) {
    // Check if used as profile photo
    const profilePhotos = await pool.query(
      'SELECT 1 FROM users WHERE profile_photo_id = $1 LIMIT 1',
      [fileId]
    );
    
    if (profilePhotos.rows.length > 0) return true;

    // Check if used in polls
    const pollImages = await pool.query(
      'SELECT 1 FROM poll_images WHERE file_id = $1 LIMIT 1',
      [fileId]
    );
    
    if (pollImages.rows.length > 0) return true;

    return false;
  }
}

module.exports = FileModel;


