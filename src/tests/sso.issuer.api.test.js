const bcrypt = require('bcryptjs');
const request = require('supertest');
const { generateKeyPair, exportPKCS8, exportJWK, decodeJwt, decodeProtectedHeader } = require('jose');
const pool = require('../database/pool');
const { nextJupebTestPrefix } = require('./jupeb-session-test-helpers');
const { resetPrivateKeyCacheForTests } = require('../modules/auth/services/sso-token.service');
const { buildHandoffClaims } = require('../modules/auth/services/sso-token.service');

const SSO_ENV_KEYS = [
  'CRP_SSO_ISSUER',
  'CRP_SSO_CURRENT_KID',
  'CRP_SSO_PRIVATE_KEY_PEM',
  'CRP_SSO_JWKS_JSON',
  'CRMS_SSO_CALLBACK_URL',
  'ATTENDANCE_SSO_CALLBACK_URL',
];

describe('CRP SSO issuer', () => {
  let app;
  let originalEnv = {};
  let testKid = 'test-sso-key';
  let dbReady = false;

  const password = 'SsoTest@12';
  const passwordHash = bcrypt.hashSync(password, 10);

  beforeAll(async () => {
    SSO_ENV_KEYS.forEach((key) => {
      originalEnv[key] = process.env[key];
    });

    const { publicKey, privateKey } = await generateKeyPair('RS256', { modulusLength: 2048 });
    const privatePem = await exportPKCS8(privateKey);
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = testKid;
    publicJwk.use = 'sig';
    publicJwk.alg = 'RS256';

    process.env.CRP_SSO_ISSUER = 'https://crp.test.local';
    process.env.CRP_SSO_CURRENT_KID = testKid;
    process.env.CRP_SSO_PRIVATE_KEY_PEM = privatePem;
    process.env.CRP_SSO_JWKS_JSON = JSON.stringify({ keys: [publicJwk] });
    process.env.CRMS_SSO_CALLBACK_URL = 'https://crms.test.local/sso/callback';
    process.env.ATTENDANCE_SSO_CALLBACK_URL = 'https://attendance.test.local/sso/callback';

    resetPrivateKeyCacheForTests();
    jest.resetModules();
    app = require('../app');

    try {
      await pool.query('SELECT 1 FROM users LIMIT 1');
      dbReady = true;
    } catch {
      dbReady = false;
    }
  });

  afterAll(() => {
    SSO_ENV_KEYS.forEach((key) => {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    });
    resetPrivateKeyCacheForTests();
  });

  function uniquePhone() {
    const tail = String(process.hrtime.bigint()).slice(-9);
    return `+2347${tail}`;
  }

  async function createUniversity() {
    const suffix = Date.now().toString(36);
    const result = await pool.query(
      `INSERT INTO jupeb_universities (code, name, short_name, jupeb_prefix, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING id`,
      [`SSO_${suffix}`, `SSO Test University ${suffix}`, `SSO_${suffix}`, nextJupebTestPrefix()]
    );
    return result.rows[0].id;
  }

  async function createInstitutionUser(universityId) {
    const email = `sso_${Date.now()}@example.com`;
    const ins = await pool.query(
      `INSERT INTO users (email, phone, email_verified, phone_verified, password_hash, status)
       VALUES ($1, $2, true, true, $3, 'active') RETURNING id`,
      [email, uniquePhone(), passwordHash]
    );
    const userId = ins.rows[0].id;
    await pool.query(
      `INSERT INTO profiles (user_id, first_name, last_name, display_name, jupeb_university_id)
       VALUES ($1, 'SSO', 'Registrar', 'SSO Registrar', $2)`,
      [userId, universityId]
    );
    const roleRow = await pool.query(
      `SELECT id FROM roles
        WHERE name = 'institution_admin'
          AND owner_jupeb_university_id IS NULL
        ORDER BY is_system DESC
        LIMIT 1`
    );
    if (roleRow.rows[0]) {
      await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [
        userId,
        roleRow.rows[0].id,
      ]);
    }
    return { userId, email };
  }

  async function login(email) {
    const res = await request(app)
      .post('/auth/login')
      .send({ identifier: email, password });
    return res.body.data?.access_token || null;
  }

  describe('GET /.well-known/jwks.json', () => {
    it('returns active public keys', async () => {
      const response = await request(app).get('/.well-known/jwks.json').expect(200);

      expect(Array.isArray(response.body.keys)).toBe(true);
      expect(response.body.keys[0].kid).toBe(testKid);
      expect(response.body.keys[0].alg).toBe('RS256');
      expect(response.headers['cache-control']).toMatch(/max-age=3600/);
    });
  });

  describe('GET /sso/targets', () => {
    it('rejects unauthenticated requests', async () => {
      const response = await request(app).get('/sso/targets').expect(401);
      expect(response.body.success).toBe(false);
    });

    it('returns configured launch targets for authenticated users', async () => {
      if (!dbReady) {
        return;
      }

      const universityId = await createUniversity();
      const { email } = await createInstitutionUser(universityId);
      const token = await login(email);
      expect(token).toBeTruthy();

      const response = await request(app)
        .get('/sso/targets')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.enabled).toBe(true);
      expect(response.body.data.issuer).toBe('https://crp.test.local');
      expect(response.body.data.targets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ app: 'crms', launch_path: '/sso/launch/crms' }),
          expect.objectContaining({ app: 'attendance', launch_path: '/sso/launch/attendance' }),
        ])
      );
    });
  });

  describe('GET /sso/launch/:targetApp', () => {
    it('rejects unauthenticated requests', async () => {
      const response = await request(app).get('/sso/launch/crms').expect(401);
      expect(response.body.success).toBe(false);
    });

    it('rejects invalid target apps for authenticated users', async () => {
      if (!dbReady) {
        return;
      }

      const universityId = await createUniversity();
      const { email } = await createInstitutionUser(universityId);
      const token = await login(email);
      expect(token).toBeTruthy();

      const response = await request(app)
        .get('/sso/launch/unknown')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/invalid sso target/i);
    });

    it('redirects with audience-scoped token for authenticated registrar', async () => {
      if (!dbReady) {
        return;
      }

      const universityId = await createUniversity();
      const { email } = await createInstitutionUser(universityId);
      const token = await login(email);
      expect(token).toBeTruthy();

      const response = await request(app)
        .get('/sso/launch/crms')
        .set('Authorization', `Bearer ${token}`)
        .expect(302);

      expect(response.headers.location).toMatch(/^https:\/\/crms\.test\.local\/sso\/callback\?token=/);

      const issuedToken = decodeURIComponent(response.headers.location.split('token=')[1]);
      const header = decodeProtectedHeader(issuedToken);
      const payload = decodeJwt(issuedToken);

      expect(header.alg).toBe('RS256');
      expect(header.kid).toBe(testKid);
      expect(payload.aud).toBe('crms');
      expect(payload.iss).toBe('https://crp.test.local');
      expect(payload.institution_id).toBe(String(universityId));
      expect(payload.institution_code).toMatch(/^SSO_/);
      expect(payload.institution_short_code).toMatch(/^SSO_/);
      expect(payload.short_code).toMatch(/^SSO_/);
      expect(payload.email).toBe(email);
      expect(payload.jti).toBeTruthy();
    });

    it('accepts redirect_uri at launch time', async () => {
      if (!dbReady) {
        return;
      }

      const universityId = await createUniversity();
      const { email } = await createInstitutionUser(universityId);
      const token = await login(email);
      expect(token).toBeTruthy();

      const callback = 'https://crms-staging.test.local/sso/callback';
      const response = await request(app)
        .get('/sso/launch/crms')
        .query({ redirect_uri: callback })
        .set('Authorization', `Bearer ${token}`)
        .expect(302);

      expect(response.headers.location).toMatch(
        /^https:\/\/crms-staging\.test\.local\/sso\/callback\?token=/
      );
    });

    it('rejects launch when redirect_uri is missing and no env fallback exists', async () => {
      if (!dbReady) {
        return;
      }

      const previous = process.env.CRMS_SSO_CALLBACK_URL;
      delete process.env.CRMS_SSO_CALLBACK_URL;

      const universityId = await createUniversity();
      const { email } = await createInstitutionUser(universityId);
      const token = await login(email);
      expect(token).toBeTruthy();

      const response = await request(app)
        .get('/sso/launch/crms')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      expect(response.body.message).toMatch(/redirect_uri/i);

      if (previous === undefined) {
        delete process.env.CRMS_SSO_CALLBACK_URL;
      } else {
        process.env.CRMS_SSO_CALLBACK_URL = previous;
      }
    });

    it('rejects invalid redirect_uri values', async () => {
      if (!dbReady) {
        return;
      }

      const universityId = await createUniversity();
      const { email } = await createInstitutionUser(universityId);
      const token = await login(email);
      expect(token).toBeTruthy();

      const response = await request(app)
        .get('/sso/launch/crms')
        .query({ redirect_uri: 'javascript:alert(1)' })
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      expect(response.body.message).toMatch(/redirect_uri/i);
    });
  });

  describe('buildHandoffClaims', () => {
    it('requires user record and email', () => {
      expect(() => buildHandoffClaims(null)).toThrow(/user record/i);
      expect(() => buildHandoffClaims({ id: '123' })).toThrow(/email/i);
    });

    it('extracts institution_id, institution_code, and short_code claims', () => {
      const claims = buildHandoffClaims({
        id: 'user-1',
        email: 'user@example.com',
        roles: ['institution_admin'],
        jupeb_university_id: 'uni-1',
        jupeb_university_code: 'UNILAG',
        jupeb_university_short_name: 'UNILAG',
      });
      expect(claims).toEqual({
        sub: 'user-1',
        email: 'user@example.com',
        roles: ['institution_admin'],
        institution_id: 'uni-1',
        institution_code: 'UNILAG',
        institution_short_code: 'UNILAG',
      });
    });
  });
});
