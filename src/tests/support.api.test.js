const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../app');
const pool = require('../database/pool');
const AuthService = require('../modules/auth/services/auth.service');

describe('Support API Module', () => {
  let server;
  let adminToken;
  let studentToken;
  let otherStudentToken;
  let institutionToken;
  let uniAId;
  let uniBId;
  let studentId;
  let otherStudentId;
  let institutionUserId;
  let regAId;
  let otherUniTicketId;

  beforeAll(async () => {
    // Bind server on loopback to avoid sandbox 0.0.0.0 permission errors
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });

    // 1. Ensure support tables exist
    const migrationSql = fs.readFileSync(
      path.join(__dirname, '../db/migrations/032_support_tickets_schema.sql'),
      'utf8'
    );
    await pool.query(migrationSql);

    // 2. Obtain admin token
    const adminLogin = await request(server)
      .post('/auth/login')
      .send({ identifier: 'admin@example.com', password: 'Admin@12' });
    adminToken = adminLogin.body.data?.access_token || null;

    // 3. Ensure two test universities exist
    const existingUnis = await pool.query(
      `SELECT id FROM jupeb_universities WHERE deleted_at IS NULL AND status = 'active' LIMIT 2`
    );
    if (existingUnis.rows.length >= 2) {
      uniAId = existingUnis.rows[0].id;
      uniBId = existingUnis.rows[1].id;
    } else {
      const randP = Math.floor(Math.random() * 800 + 100);
      const uniARes = await pool.query(
        `INSERT INTO jupeb_universities (name, code, jupeb_prefix, status)
         VALUES ('Support Test Uni A', 'STUA_' || $1, $1, 'active')
         RETURNING id`,
        [String(randP).padStart(3, '0')]
      );
      uniAId = uniARes.rows[0].id;
      const uniBRes = await pool.query(
        `INSERT INTO jupeb_universities (name, code, jupeb_prefix, status)
         VALUES ('Support Test Uni B', 'STUB_' || $1, $1, 'active')
         RETURNING id`,
        [String(randP + 1).padStart(3, '0')]
      );
      uniBId = uniBRes.rows[0].id;
    }

    const studentRole = await pool.query("SELECT id FROM roles WHERE name = 'student' LIMIT 1");

    // 4. Create a student user for Uni A
    const stuEmail = `student-support-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
    const stuRes = await pool.query(
      `INSERT INTO users (email, phone, status) VALUES ($1, $2, 'active') RETURNING id`,
      [stuEmail, `+234${Math.floor(8000000000 + Math.random() * 1000000000)}`]
    );
    studentId = stuRes.rows[0].id;
    await pool.query(
      `INSERT INTO profiles (user_id, first_name, last_name, jupeb_university_id) VALUES ($1, 'Support', 'Student', $2)`,
      [studentId, uniAId]
    );
    if (studentRole.rows[0]) {
      await pool.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [studentId, studentRole.rows[0].id]
      );
    }
    studentToken = AuthService.generateAccessToken(studentId, ['student']);

    // Link student to Uni A via jupeb_registrations
    const sessRow = await pool.query('SELECT id FROM jupeb_registration_sessions LIMIT 1');
    const sessionId = sessRow.rows[0]?.id;
    if (sessionId && studentId) {
      const regIns = await pool.query(
        `INSERT INTO jupeb_registrations (session_id, university_id, user_id, status, created_by, provisional_serial)
         VALUES ($1, $2, $3, 'claimed', $3, $4)
         RETURNING id`,
        [sessionId, uniAId, studentId, Math.floor(Math.random() * 9000 + 1000)]
      );
      regAId = regIns.rows[0].id;
    }

    // 5. Create another student for Uni B
    const otherStuEmail = `other-student-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
    const otherStuRes = await pool.query(
      `INSERT INTO users (email, phone, status) VALUES ($1, $2, 'active') RETURNING id`,
      [otherStuEmail, `+234${Math.floor(8000000000 + Math.random() * 1000000000)}`]
    );
    otherStudentId = otherStuRes.rows[0].id;
    await pool.query(
      `INSERT INTO profiles (user_id, first_name, last_name, jupeb_university_id) VALUES ($1, 'Other', 'Student', $2)`,
      [otherStudentId, uniBId]
    );
    if (studentRole.rows[0]) {
      await pool.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [otherStudentId, studentRole.rows[0].id]
      );
    }
    otherStudentToken = AuthService.generateAccessToken(otherStudentId, ['student']);

    if (sessionId && otherStudentId) {
      await pool.query(
        `INSERT INTO jupeb_registrations (session_id, university_id, user_id, status, created_by, provisional_serial)
         VALUES ($1, $2, $3, 'claimed', $3, $4)
         RETURNING id`,
        [sessionId, uniBId, otherStudentId, Math.floor(Math.random() * 9000 + 1000)]
      );
    }

    // 6. Create institution staff user for Uni A
    const instEmail = `inst-staff-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`;
    const instRes = await pool.query(
      `INSERT INTO users (email, phone, status) VALUES ($1, $2, 'active') RETURNING id`,
      [instEmail, `+234${Math.floor(8000000000 + Math.random() * 1000000000)}`]
    );
    institutionUserId = instRes.rows[0].id;
    await pool.query(
      `INSERT INTO profiles (user_id, first_name, last_name, jupeb_university_id) VALUES ($1, 'Institution', 'Staff', $2)`,
      [institutionUserId, uniAId]
    );
    const instRole = await pool.query(`SELECT id FROM roles WHERE name = 'institution_admin' LIMIT 1`);
    if (instRole.rows[0]) {
      await pool.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [institutionUserId, instRole.rows[0].id]
      );
    }
    institutionToken = AuthService.generateAccessToken(institutionUserId, ['institution_admin']);

    // Pre-create ticket for student in Uni B
    const otherRes = await request(server)
      .post('/support/tickets')
      .set('Authorization', `Bearer ${otherStudentToken}`)
      .send({
        category: 'Attendance issue',
        subject: 'Biometric device failed in Uni B',
        message: 'Device offline during 9am session.',
      });
    otherUniTicketId = otherRes.body.data?.id;
  });

  afterAll(async () => {
    try {
      if (studentId) {
        await pool.query(`DELETE FROM support_tickets WHERE user_id = $1`, [studentId]);
        await pool.query(`DELETE FROM jupeb_registrations WHERE user_id = $1`, [studentId]);
        await pool.query(`DELETE FROM profiles WHERE user_id = $1`, [studentId]);
        await pool.query(`DELETE FROM users WHERE id = $1`, [studentId]);
      }
      if (otherStudentId) {
        await pool.query(`DELETE FROM support_tickets WHERE user_id = $1`, [otherStudentId]);
        await pool.query(`DELETE FROM jupeb_registrations WHERE user_id = $1`, [otherStudentId]);
        await pool.query(`DELETE FROM profiles WHERE user_id = $1`, [otherStudentId]);
        await pool.query(`DELETE FROM users WHERE id = $1`, [otherStudentId]);
      }
      if (institutionUserId) {
        await pool.query(`DELETE FROM user_roles WHERE user_id = $1`, [institutionUserId]);
        await pool.query(`DELETE FROM profiles WHERE user_id = $1`, [institutionUserId]);
        await pool.query(`DELETE FROM users WHERE id = $1`, [institutionUserId]);
      }
    } catch (_) {}

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // ==========================================
  // 1. Categories
  // ==========================================
  describe('GET /support/categories', () => {
    it('returns the list of allowed support categories matching Figma spec', async () => {
      const res = await request(server).get('/support/categories');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toContain('Registration');
      expect(res.body.data).toContain('Account & Profile');
      expect(res.body.data).toContain('Email Address');
      expect(res.body.data).toContain('Subject combinations');
      expect(res.body.data).toContain('Result issue');
      expect(res.body.data).toContain('Attendance issue');
      expect(res.body.data).toContain('Something else');
    });
  });

  // ==========================================
  // 2. Student Ticket Submission
  // ==========================================
  let createdTicketId;
  let createdTicketNumber;

  describe('POST /support/tickets', () => {
    it('rejects without auth with 401', async () => {
      const res = await request(server)
        .post('/support/tickets')
        .send({
          category: 'Registration',
          subject: 'Need help with registration',
          message: 'I cannot submit my documents',
        });
      expect(res.status).toBe(401);
    });

    it('rejects missing required fields with 422', async () => {
      const res = await request(server)
        .post('/support/tickets')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          category: 'Registration',
          // missing subject and message
        });
      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('rejects invalid category with 422', async () => {
      const res = await request(server)
        .post('/support/tickets')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          category: 'Invalid Category Name',
          subject: 'Test Subject',
          message: 'Test Message',
        });
      expect(res.status).toBe(422);
      expect(res.body.message).toContain('Invalid category');
    });

    it('submits a ticket successfully and auto-links university_id and registration_id', async () => {
      const res = await request(server)
        .post('/support/tickets')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          category: 'Subject combinations',
          subject: 'Issue changing chemistry to biology',
          message: 'My university told me to request subject combination change here.',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const ticket = res.body.data;
      expect(ticket.id).toBeDefined();
      expect(ticket.ticket_number).toMatch(/^TKT-\d{6}-[A-F0-9]{6}$/);
      expect(ticket.category).toBe('Subject combinations');
      expect(ticket.subject).toBe('Issue changing chemistry to biology');
      expect(ticket.status).toBe('open');
      expect(ticket.priority).toBe('normal');
      expect(ticket.user_id).toBe(studentId);
      expect(ticket.university_id).toBe(uniAId);
      if (regAId) {
        expect(ticket.registration_id).toBe(regAId);
      }

      createdTicketId = ticket.id;
      createdTicketNumber = ticket.ticket_number;
    });
  });

  // ==========================================
  // 3. Student List & View Own Tickets
  // ==========================================
  describe('GET /support/my-tickets & GET /support/tickets/:id', () => {
    it('returns student paginated list of tickets', async () => {
      const res = await request(server)
        .get('/support/my-tickets')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      const item = res.body.data.find((t) => t.id === createdTicketId);
      expect(item).toBeDefined();
      expect(item.ticket_number).toBe(createdTicketNumber);
      expect(res.body.pagination).toBeDefined();
    });

    it('returns ticket detail with conversation messages thread', async () => {
      const res = await request(server)
        .get(`/support/tickets/${createdTicketId}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(createdTicketId);
      expect(Array.isArray(res.body.data.messages)).toBe(true);
      expect(res.body.data.messages.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.messages[0].sender_role).toBe('student');
      expect(res.body.data.messages[0].message).toContain('My university told me to request');
    });

    it('denies other student from accessing another user ticket with 404', async () => {
      const res = await request(server)
        .get(`/support/tickets/${createdTicketId}`)
        .set('Authorization', `Bearer ${otherStudentToken}`);

      expect(res.status).toBe(404);
    });
  });

  // ==========================================
  // 4. Student Reply
  // ==========================================
  describe('POST /support/tickets/:id/messages', () => {
    it('allows student to add a reply to their ticket thread', async () => {
      const res = await request(server)
        .post(`/support/tickets/${createdTicketId}/messages`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          message: 'Following up on this, my admission office needs this urgently.',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sender_role).toBe('student');
      expect(res.body.data.message).toContain('Following up on this');

      // Verify message is now in thread
      const detail = await request(server)
        .get(`/support/tickets/${createdTicketId}`)
        .set('Authorization', `Bearer ${studentToken}`);
      expect(detail.body.data.messages.length).toBe(2);
    });
  });

  // ==========================================
  // 5. Institution Scoped Tickets
  // ==========================================
  describe('Institution Staff Endpoints', () => {
    it('institution staff lists tickets only for their university (Uni A)', async () => {
      const res = await request(server)
        .get('/support/institution/tickets')
        .set('Authorization', `Bearer ${institutionToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      // Must include Uni A student ticket
      const hasUniA = res.body.data.some((t) => t.id === createdTicketId);
      expect(hasUniA).toBe(true);

      // Must NOT leak Uni B student ticket
      const hasUniB = res.body.data.some((t) => t.id === otherUniTicketId);
      expect(hasUniB).toBe(false);
    });

    it('institution staff gets ticket detail with candidate info', async () => {
      const res = await request(server)
        .get(`/support/institution/tickets/${createdTicketId}`)
        .set('Authorization', `Bearer ${institutionToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(createdTicketId);
      expect(res.body.data.user_email).toBeDefined();
      expect(Array.isArray(res.body.data.messages)).toBe(true);
    });

    it('institution staff gets 403 when attempting to access Uni B ticket', async () => {
      const res = await request(server)
        .get(`/support/institution/tickets/${otherUniTicketId}`)
        .set('Authorization', `Bearer ${institutionToken}`);

      expect(res.status).toBe(403);
    });

    it('institution staff replies to student ticket and marks status in_progress', async () => {
      const res = await request(server)
        .post(`/support/institution/tickets/${createdTicketId}/reply`)
        .set('Authorization', `Bearer ${institutionToken}`)
        .send({
          message: 'Hello, we have forwarded your subject combination change request to the coordinator.',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sender_role).toBe('institution');

      // Verify status changed to in_progress
      const updated = await request(server)
        .get(`/support/institution/tickets/${createdTicketId}`)
        .set('Authorization', `Bearer ${institutionToken}`);
      expect(updated.body.data.status).toBe('in_progress');
    });

    it('institution staff updates ticket status to resolved', async () => {
      const res = await request(server)
        .patch(`/support/institution/tickets/${createdTicketId}/status`)
        .set('Authorization', `Bearer ${institutionToken}`)
        .send({
          status: 'resolved',
          resolution_notes: 'Subject combination has been updated in the portal.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('resolved');
      expect(res.body.data.resolution_notes).toBe('Subject combination has been updated in the portal.');
      expect(res.body.data.resolved_at).toBeDefined();
    });

    it('institution staff gets overview stats', async () => {
      const res = await request(server)
        .get('/support/institution/stats')
        .set('Authorization', `Bearer ${institutionToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('resolved');
      expect(res.body.data.resolved).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(res.body.data.by_category)).toBe(true);
    });
  });

  // ==========================================
  // 6. Admin Global Management
  // ==========================================
  describe('Admin Endpoints', () => {
    it('admin lists all tickets across institutions', async () => {
      const res = await request(server)
        .get('/support/admin/tickets')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('admin filters tickets by university_id', async () => {
      const res = await request(server)
        .get(`/support/admin/tickets?university_id=${uniAId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.every((t) => t.university_id === uniAId)).toBe(true);
    });

    it('admin views ticket detail and replies as admin', async () => {
      const res = await request(server)
        .post(`/support/admin/tickets/${createdTicketId}/reply`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          message: 'National secretariat confirmed change.',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sender_role).toBe('admin');
    });

    it('admin updates ticket priority and status', async () => {
      const res = await request(server)
        .patch(`/support/admin/tickets/${createdTicketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          priority: 'urgent',
          status: 'closed',
          resolution_notes: 'Closed by admin after verification.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('closed');
    });

    it('admin gets global system stats', async () => {
      const res = await request(server)
        .get('/support/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data.total).toBeGreaterThanOrEqual(2);
      expect(Array.isArray(res.body.data.by_university)).toBe(true);
      expect(Array.isArray(res.body.data.by_category)).toBe(true);
    });
  });
});
