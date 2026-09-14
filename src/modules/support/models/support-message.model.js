const pool = require('../../../db/pool');

class SupportMessageModel {
  static async create(data) {
    const {
      ticket_id,
      sender_id,
      sender_role,
      message,
      attachments = [],
    } = data;

    const query = `
      INSERT INTO support_ticket_messages (
        ticket_id,
        sender_id,
        sender_role,
        message,
        attachments
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const result = await pool.query(query, [
      ticket_id,
      sender_id,
      sender_role,
      message,
      JSON.stringify(attachments),
    ]);

    return result.rows[0];
  }

  static async findByTicketId(ticketId) {
    const query = `
      SELECT m.*,
             u.email AS sender_email,
             p.first_name AS sender_first_name,
             p.last_name AS sender_last_name,
             p.display_name AS sender_display_name,
             p.profile_photo_url AS sender_photo_url
        FROM support_ticket_messages m
        JOIN users u ON u.id = m.sender_id
        LEFT JOIN profiles p ON p.user_id = m.sender_id
       WHERE m.ticket_id = $1
       ORDER BY m.created_at ASC
    `;
    const result = await pool.query(query, [ticketId]);
    return result.rows;
  }
}

module.exports = SupportMessageModel;
