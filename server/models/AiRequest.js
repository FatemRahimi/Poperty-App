const pool = require('./db');

class AiRequest {
  static async create({
    userId,
    requestType,
    inputData,
    outputData,
    creditsUsed = 1,
    modelUsed = null,
    tokensUsed = 0,
    status = 'completed',
    errorMessage = null,
    title = null,
  }) {
    const result = await pool.query(
      `INSERT INTO ai_requests
        (user_id, request_type, status, input_data, output_data, credits_used, model_used, tokens_used, error_message, title)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        userId,
        requestType,
        status,
        inputData || {},
        outputData || {},
        creditsUsed,
        modelUsed,
        tokensUsed,
        errorMessage,
        title,
      ]
    );
    return result.rows[0];
  }

  static async findById(id, userId = null) {
    const params = [id];
    let sql = 'SELECT * FROM ai_requests WHERE id = $1';
    if (userId) {
      sql += ' AND user_id = $2';
      params.push(userId);
    }
    const result = await pool.query(sql, params);
    return result.rows[0] || null;
  }

  static async findByUser(userId, { type = null, limit = 50, offset = 0 } = {}) {
    const params = [userId];
    let sql = 'SELECT * FROM ai_requests WHERE user_id = $1';

    if (type) {
      params.push(type);
      sql += ` AND request_type = $${params.length}`;
    }

    params.push(limit);
    params.push(offset);
    sql += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await pool.query(sql, params);
    return result.rows;
  }

  static async countByUser(userId, type = null) {
    const params = [userId];
    let sql = 'SELECT COUNT(*)::int AS count FROM ai_requests WHERE user_id = $1';
    if (type) {
      params.push(type);
      sql += ` AND request_type = $${params.length}`;
    }
    const result = await pool.query(sql, params);
    return result.rows[0].count;
  }

  static async delete(id, userId) {
    const result = await pool.query(
      'DELETE FROM ai_requests WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return result.rows[0] || null;
  }
}

module.exports = AiRequest;
