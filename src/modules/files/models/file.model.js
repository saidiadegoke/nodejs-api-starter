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
      is_public = false,
      asset_group_id = null,
      tags = null,
      alt_text = null
    } = fileData;

    const result = await pool.query(
      `INSERT INTO files (provider, provider_path, file_url, file_type, file_size, uploaded_by, context, metadata, is_public, asset_group_id, tags, alt_text)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        provider, 
        provider_path, 
        file_url, 
        file_type, 
        file_size, 
        uploaded_by, 
        context, 
        JSON.stringify(metadata), 
        is_public,
        asset_group_id,
        tags || null,
        alt_text || null
      ]
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

    return false;
  }

  /**
   * Find user assets with filters and pagination
   * @param {string} userId - User ID
   * @param {Object} filters - Filter options
   * @param {number} page - Page number (default: 1)
   * @param {number} limit - Items per page (default: 50)
   * @returns {Promise<Object>} Paginated assets with total count
   */
  static async findUserAssets(userId, filters = {}, page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    const conditions = ['f.uploaded_by = $1', 'f.deleted_at IS NULL', "f.context = 'user_assets'"];
    const params = [userId];
    let paramCount = 2;

    // Filter by asset group
    if (filters.group_id) {
      conditions.push(`f.asset_group_id = $${paramCount++}`);
      params.push(filters.group_id);
    } else if (filters.group_id === null) {
      conditions.push('f.asset_group_id IS NULL');
    }

    // Filter by file type
    if (filters.type) {
      if (filters.type === 'image') {
        conditions.push(`f.file_type LIKE $${paramCount++}`);
        params.push('image/%');
      } else if (filters.type === 'video') {
        conditions.push(`f.file_type LIKE $${paramCount++}`);
        params.push('video/%');
      } else if (filters.type === 'document') {
        conditions.push(`f.file_type NOT LIKE 'image/%' AND f.file_type NOT LIKE 'video/%'`);
      }
    }

    // Filter by tags (array contains)
    if (filters.tags && Array.isArray(filters.tags) && filters.tags.length > 0) {
      conditions.push(`f.tags && $${paramCount++}`);
      params.push(filters.tags);
    }

    // Search in filename, alt_text, and tags
    if (filters.search) {
      conditions.push(`(
        (f.metadata->>'original_name') ILIKE $${paramCount} OR
        f.alt_text ILIKE $${paramCount} OR
        EXISTS (
          SELECT 1 FROM unnest(f.tags) AS tag 
          WHERE tag ILIKE $${paramCount}
        )
      )`);
      params.push(`%${filters.search}%`);
      paramCount++;
    }

    const whereClause = conditions.join(' AND ');

    // Get total count (use f alias for consistency)
    const countQuery = `SELECT COUNT(*) FROM files f WHERE ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Determine sort order (qualify with f. to avoid ambiguity with joined tables)
    let orderBy = 'f.created_at DESC';
    if (filters.sort) {
      const order = filters.order === 'asc' ? 'ASC' : 'DESC';
      switch (filters.sort) {
        case 'name':
          orderBy = `(f.metadata->>'original_name') ${order}`;
          break;
        case 'size':
          orderBy = `f.file_size ${order}`;
          break;
        case 'type':
          orderBy = `f.file_type ${order}`;
          break;
        case 'created_at':
        default:
          orderBy = `f.created_at ${order}`;
          break;
      }
    }

    // Get paginated data
    const dataQuery = `
      SELECT 
        f.*,
        ag.name as asset_group_name,
        ag.color as asset_group_color
      FROM files f
      LEFT JOIN asset_groups ag ON f.asset_group_id = ag.id AND ag.deleted_at IS NULL
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
    const dataResult = await pool.query(dataQuery, [...params, limit, offset]);

    return {
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get total storage used (bytes) for user_assets by user
   */
  static async getStorageUsedBytes(userId) {
    const result = await pool.query(
      `SELECT COALESCE(SUM(file_size), 0)::BIGINT AS storage_used_bytes
       FROM files
       WHERE context = 'user_assets' AND uploaded_by = $1 AND deleted_at IS NULL`,
      [userId]
    );
    return Number(result.rows[0]?.storage_used_bytes || 0);
  }

  /**
   * Update asset metadata
   */
  static async updateAsset(assetId, updates) {
    const {
      asset_group_id,
      tags,
      alt_text
    } = updates;

    const fields = [];
    const values = [];
    let paramCount = 1;

    if (asset_group_id !== undefined) {
      fields.push(`asset_group_id = $${paramCount++}`);
      values.push(asset_group_id);
    }
    if (tags !== undefined) {
      fields.push(`tags = $${paramCount++}`);
      values.push(tags);
    }
    if (alt_text !== undefined) {
      fields.push(`alt_text = $${paramCount++}`);
      values.push(alt_text);
    }

    if (fields.length === 0) {
      return await this.findById(assetId);
    }

    values.push(assetId);
    const query = `
      UPDATE files 
      SET ${fields.join(', ')}
      WHERE id = $${paramCount} AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Move multiple assets to a group
   */
  static async moveAssets(assetIds, targetGroupId, userId) {
    // Verify all assets belong to user
    const verifyQuery = `
      SELECT id FROM files 
      WHERE id = ANY($1::uuid[]) 
        AND uploaded_by = $2 
        AND deleted_at IS NULL
    `;
    const verifyResult = await pool.query(verifyQuery, [assetIds, userId]);
    
    if (verifyResult.rows.length !== assetIds.length) {
      throw new Error('Some assets not found or not owned by user');
    }

    // Update assets
    const updateQuery = `
      UPDATE files 
      SET asset_group_id = $1
      WHERE id = ANY($2::uuid[]) 
        AND uploaded_by = $3
        AND deleted_at IS NULL
      RETURNING *
    `;
    const result = await pool.query(updateQuery, [targetGroupId, assetIds, userId]);
    return result.rows;
  }

  /**
   * Batch update tags for multiple assets
   */
  static async batchUpdateTags(assetIds, tagsToAdd = [], tagsToRemove = [], userId) {
    // Verify ownership
    const verifyQuery = `
      SELECT id, tags FROM files 
      WHERE id = ANY($1::uuid[]) 
        AND uploaded_by = $2 
        AND deleted_at IS NULL
    `;
    const verifyResult = await pool.query(verifyQuery, [assetIds, userId]);
    
    if (verifyResult.rows.length !== assetIds.length) {
      throw new Error('Some assets not found or not owned by user');
    }

    // Update each asset's tags
    const updates = [];
    for (const asset of verifyResult.rows) {
      let currentTags = asset.tags || [];
      
      // Remove tags
      if (tagsToRemove.length > 0) {
        currentTags = currentTags.filter(tag => !tagsToRemove.includes(tag));
      }
      
      // Add tags (avoid duplicates)
      if (tagsToAdd.length > 0) {
        tagsToAdd.forEach(tag => {
          if (!currentTags.includes(tag)) {
            currentTags.push(tag);
          }
        });
      }

      const updateQuery = `
        UPDATE files 
        SET tags = $1
        WHERE id = $2
        RETURNING *
      `;
      const result = await pool.query(updateQuery, [currentTags, asset.id]);
      updates.push(result.rows[0]);
    }

    return updates;
  }
}

module.exports = FileModel;


