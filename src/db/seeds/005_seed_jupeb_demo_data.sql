-- Demo dataset for the JUPEB student-registration portal.
--
-- Creates 2 sessions (one closed, one open), 12 universities (federal /
-- state / private mix from the figma `Candidates.jpg` bar chart), 4 subject
-- combinations, and ~30 students at varying registration stages with full
-- bio data, next-of-kin records, NIN verifications, and biometric markers
-- so dashboards / candidate lists have data to render against.
--
-- Idempotent: every block uses NOT EXISTS / ON CONFLICT so re-running this
-- seed on an existing DB is safe.
--
-- Demo login: each demo student uses the same password as 003_seed_jupeb_student_user.sql:
--   password: Student@12   (bcrypt cost 10)
--
-- See docs-impl/016-student-registration-end-to-end.md.

-- ============================================================================
-- 1. Sessions
-- ============================================================================
INSERT INTO jupeb_registration_sessions (
  academic_year, year_short, status, opens_at, closes_at,
  affiliation_fee_existing, affiliation_fee_new, exam_fee_per_candidate, max_ca_score
)
SELECT v.academic_year, v.year_short, v.status,
       v.opens_at::timestamp, v.closes_at::timestamp,
       v.aff_existing, v.aff_new, v.exam_fee, v.max_ca
FROM (VALUES
  ('2024/2025', '25', 'closed',
   '2024-09-01 00:00:00', '2025-08-31 23:59:59',
   250000, 350000, 45000, 30),
  ('2025/2026', '26', 'open',
   '2025-09-01 00:00:00', '2026-08-31 23:59:59',
   250000, 350000, 45000, 30)
) AS v(academic_year, year_short, status, opens_at, closes_at,
        aff_existing, aff_new, exam_fee, max_ca)
WHERE NOT EXISTS (
  SELECT 1 FROM jupeb_registration_sessions s
  WHERE s.academic_year = v.academic_year
);

-- ============================================================================
-- 2. Universities (12 institutions for the dashboard bar chart)
-- ============================================================================
INSERT INTO jupeb_universities (
  code, name, short_name, jupeb_prefix, status, university_type,
  email, phone, address, expected_candidate_count, description
)
SELECT v.code, v.name, v.short_name, v.jupeb_prefix, 'active', v.type,
       v.email, v.phone, v.address, v.expected, v.description
FROM (VALUES
  ('UNILAG', 'University of Lagos', 'UNILAG', '101', 'federal',
   'jupeb@unilag.edu.ng', '+2348012345001',
   'Akoka, Yaba, Lagos', 1200, 'Federal university located in Lagos'),
  ('OAU', 'Obafemi Awolowo University', 'OAU', '102', 'federal',
   'jupeb@oauife.edu.ng', '+2348012345002',
   'Ile-Ife, Osun State', 1100, 'Federal university in Osun State'),
  ('UI', 'University of Ibadan', 'UI', '103', 'federal',
   'jupeb@ui.edu.ng', '+2348012345003',
   'Ibadan, Oyo State', 1050, 'First Nigerian university'),
  ('FUTMINNA', 'Federal University of Technology, Minna', 'FUTMINNA', '104', 'federal',
   'jupeb@futminna.edu.ng', '+2348012345004',
   'Bosso, Minna, Niger State', 800, 'Federal technology university'),
  ('FUTA', 'Federal University of Technology, Akure', 'FUTA', '105', 'federal',
   'jupeb@futa.edu.ng', '+2348012345005',
   'Akure, Ondo State', 900, 'Federal technology university'),
  ('UNILORIN', 'University of Ilorin', 'UNILORIN', '106', 'federal',
   'jupeb@unilorin.edu.ng', '+2348012345006',
   'Ilorin, Kwara State', 1000, 'Federal university in Kwara'),
  ('OOU', 'Olabisi Onabanjo University', 'OOU', '201', 'state',
   'jupeb@oouagoiwoye.edu.ng', '+2348012345007',
   'Ago-Iwoye, Ogun State', 700, 'Ogun State university'),
  ('CU', 'Covenant University', 'CU', '301', 'private',
   'jupeb@covenantuniversity.edu.ng', '+2348012345008',
   'Ota, Ogun State', 600, 'Private university operated by Living Faith'),
  ('FUNAAB', 'Federal University of Agriculture, Abeokuta', 'FUNAAB', '107', 'federal',
   'jupeb@funaab.edu.ng', '+2348012345009',
   'Abeokuta, Ogun State', 750, 'Federal agricultural university'),
  ('ABU', 'Ahmadu Bello University', 'ABU', '108', 'federal',
   'jupeb@abu.edu.ng', '+2348012345010',
   'Zaria, Kaduna State', 1300, 'Largest university in Nigeria'),
  ('UNN', 'University of Nigeria, Nsukka', 'UNN', '109', 'federal',
   'jupeb@unn.edu.ng', '+2348012345011',
   'Nsukka, Enugu State', 1150, 'Federal university in Enugu'),
  ('UNIZIK', 'Nnamdi Azikiwe University', 'UNIZIK', '110', 'federal',
   'jupeb@unizik.edu.ng', '+2348012345012',
   'Awka, Anambra State', 950, 'Federal university in Anambra')
) AS v(code, name, short_name, jupeb_prefix, type, email, phone, address, expected, description)
WHERE NOT EXISTS (
  -- Skip when either the code or the prefix is already taken.
  -- `jupeb_prefix` has a partial unique index, and ad-hoc test runs can
  -- consume prefix values before the demo seed runs; this guard keeps
  -- the seed idempotent on a polluted DB.
  SELECT 1 FROM jupeb_universities u
   WHERE u.deleted_at IS NULL
     AND (LOWER(u.code) = LOWER(v.code) OR u.jupeb_prefix = v.jupeb_prefix)
);

-- ============================================================================
-- 3. Subject combinations (mirrors figma "JUPEB SC-001..004")
-- ----------------------------------------------------------------------------
-- The `subjects` column was historically a JSONB on this table and has
-- since been refactored into a separate `jupeb_subject_combination_items`
-- join table on some environments. Detect which shape the live DB uses
-- so this seed stays idempotent across both.
-- ============================================================================
DO $$
DECLARE
  has_subjects_jsonb BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'jupeb_subject_combinations' AND column_name = 'subjects'
  ) INTO has_subjects_jsonb;

  IF has_subjects_jsonb THEN
    INSERT INTO jupeb_subject_combinations (code, title, subjects, status, is_global)
    SELECT v.code, v.title, v.subjects::jsonb, 'active', true
    FROM (VALUES
      ('JUPEB SC-001', 'CRS/ISS, Government, Literature',
       '["CRS","Government","Literature in English"]'),
      ('JUPEB SC-002', 'Mathematics, Physics, Chemistry',
       '["Mathematics","Physics","Chemistry"]'),
      ('JUPEB SC-003', 'Biology, Chemistry, Physics',
       '["Biology","Chemistry","Physics"]'),
      ('JUPEB SC-004', 'Economics, Government, Mathematics',
       '["Economics","Government","Mathematics"]')
    ) AS v(code, title, subjects)
    WHERE NOT EXISTS (
      SELECT 1 FROM jupeb_subject_combinations sc WHERE LOWER(sc.code) = LOWER(v.code)
    );
  ELSE
    -- New schema: subjects normalized into jupeb_subject_combination_items.
    -- Seed only the header rows here; populating items requires
    -- subject IDs which live in a separate table that may not be present
    -- on this environment.
    INSERT INTO jupeb_subject_combinations (code, title, status, is_global)
    SELECT v.code, v.title, 'active', true
    FROM (VALUES
      ('JUPEB SC-001', 'CRS/ISS, Government, Literature'),
      ('JUPEB SC-002', 'Mathematics, Physics, Chemistry'),
      ('JUPEB SC-003', 'Biology, Chemistry, Physics'),
      ('JUPEB SC-004', 'Economics, Government, Mathematics')
    ) AS v(code, title)
    WHERE NOT EXISTS (
      SELECT 1 FROM jupeb_subject_combinations sc WHERE LOWER(sc.code) = LOWER(v.code)
    );
  END IF;
END$$;

-- ============================================================================
-- 4. Demo students — 30 users with full profiles
--    Bcrypt('Student@12', 10) — same hash used by 003_seed_jupeb_student_user.sql
-- ============================================================================
INSERT INTO users (email, phone, email_verified, phone_verified, password_hash, status)
SELECT v.email, v.phone, true, true,
       '$2a$10$blUvzJlgCbWl5uaKCWCMSOK.ECArvoly4FuRu5KeMrtw92raxgUbO', 'active'
FROM (VALUES
  ('demo.adebayo.salami@example.com',     '+2348100000001'),
  ('demo.chinedu.okafor@example.com',     '+2348100000002'),
  ('demo.funmilayo.ojo@example.com',      '+2348100000003'),
  ('demo.ibrahim.musa@example.com',       '+2348100000004'),
  ('demo.ngozi.eze@example.com',          '+2348100000005'),
  ('demo.bisi.adewale@example.com',       '+2348100000006'),
  ('demo.tunde.bakare@example.com',       '+2348100000007'),
  ('demo.amina.yusuf@example.com',        '+2348100000008'),
  ('demo.kelechi.nwosu@example.com',      '+2348100000009'),
  ('demo.abdulrahman.bello@example.com',  '+2348100000010'),
  ('demo.chiamaka.onyema@example.com',    '+2348100000011'),
  ('demo.olusegun.adekunle@example.com',  '+2348100000012'),
  ('demo.zainab.ibrahim@example.com',     '+2348100000013'),
  ('demo.efe.osagie@example.com',         '+2348100000014'),
  ('demo.taiwo.ogunleye@example.com',     '+2348100000015'),
  ('demo.kehinde.ogunleye@example.com',   '+2348100000016'),
  ('demo.aishat.lawal@example.com',       '+2348100000017'),
  ('demo.uchechi.ibe@example.com',        '+2348100000018'),
  ('demo.gbenga.olamide@example.com',     '+2348100000019'),
  ('demo.fatima.umar@example.com',        '+2348100000020'),
  ('demo.dayo.afolayan@example.com',      '+2348100000021'),
  ('demo.adaeze.iwu@example.com',         '+2348100000022'),
  ('demo.musa.aliyu@example.com',         '+2348100000023'),
  ('demo.shola.babatunde@example.com',    '+2348100000024'),
  ('demo.kemi.balogun@example.com',       '+2348100000025'),
  ('demo.suleiman.danjuma@example.com',   '+2348100000026'),
  ('demo.peace.uche@example.com',         '+2348100000027'),
  ('demo.victor.akpan@example.com',       '+2348100000028'),
  ('demo.maryam.usman@example.com',       '+2348100000029'),
  ('demo.tomiwa.ajayi@example.com',       '+2348100000030')
) AS v(email, phone)
ON CONFLICT (email) DO NOTHING;

-- Profiles with rich bio data
INSERT INTO profiles (
  user_id, first_name, last_name, display_name, date_of_birth, gender,
  residential_address, state_of_origin, lga, place_of_birth,
  state_province
)
SELECT u.id, v.first_name, v.last_name,
       v.first_name || ' ' || v.last_name,
       v.dob::date, v.gender,
       v.residential_address, v.state_of_origin, v.lga, v.place_of_birth,
       v.state_of_origin
FROM (VALUES
  ('demo.adebayo.salami@example.com',     'Adebayo',      'Salami',       '2003-03-12', 'male',   '23 Surulere Avenue, Lagos',         'Lagos',     'Surulere',           'Lagos'),
  ('demo.chinedu.okafor@example.com',     'Chinedu',      'Okafor',       '2002-06-18', 'male',   '15 Awka Road, Onitsha, Anambra',   'Anambra',   'Onitsha North',      'Onitsha'),
  ('demo.funmilayo.ojo@example.com',      'Funmilayo',    'Ojo',          '2003-11-04', 'female', '5 Bodija Crescent, Ibadan',         'Oyo',       'Ibadan North',       'Ibadan'),
  ('demo.ibrahim.musa@example.com',       'Ibrahim',      'Musa',         '2002-01-22', 'male',   '12 Garki Road, Abuja',              'Niger',     'Suleja',             'Minna'),
  ('demo.ngozi.eze@example.com',          'Ngozi',        'Eze',          '2003-07-30', 'female', '7 New Haven, Enugu',                'Enugu',     'Enugu North',        'Enugu'),
  ('demo.bisi.adewale@example.com',       'Bisi',         'Adewale',      '2002-09-09', 'female', '34 OAU Road, Ile-Ife',              'Osun',      'Ife Central',        'Ile-Ife'),
  ('demo.tunde.bakare@example.com',       'Tunde',        'Bakare',       '2003-02-14', 'male',   '17 GRA, Akure',                     'Ondo',      'Akure South',        'Akure'),
  ('demo.amina.yusuf@example.com',        'Amina',        'Yusuf',        '2003-05-21', 'female', '8 Tudun Wada, Kano',                'Kano',      'Kano Municipal',     'Kano'),
  ('demo.kelechi.nwosu@example.com',      'Kelechi',      'Nwosu',        '2002-12-03', 'male',   '21 Owerri Road, Aba',               'Imo',       'Owerri Municipal',   'Owerri'),
  ('demo.abdulrahman.bello@example.com',  'Abdulrahman',  'Bello',        '2003-04-19', 'male',   '3 Ahmadu Bello Way, Kaduna',        'Kaduna',    'Zaria',              'Zaria'),
  ('demo.chiamaka.onyema@example.com',    'Chiamaka',     'Onyema',       '2003-08-25', 'female', '40 Independence Layout, Enugu',     'Anambra',   'Awka South',         'Awka'),
  ('demo.olusegun.adekunle@example.com',  'Olusegun',     'Adekunle',     '2002-10-11', 'male',   '6 Bode Thomas, Lagos',              'Lagos',     'Surulere',           'Lagos'),
  ('demo.zainab.ibrahim@example.com',     'Zainab',       'Ibrahim',      '2003-01-07', 'female', '9 Maiduguri Road, Bauchi',          'Bauchi',    'Bauchi',             'Bauchi'),
  ('demo.efe.osagie@example.com',         'Efe',          'Osagie',       '2002-06-29', 'male',   '2 Ugbowo Road, Benin',              'Edo',       'Egor',               'Benin City'),
  ('demo.taiwo.ogunleye@example.com',     'Taiwo',        'Ogunleye',     '2003-03-15', 'male',   '11 Abeokuta Street, Sagamu',        'Ogun',      'Sagamu',             'Sagamu'),
  ('demo.kehinde.ogunleye@example.com',   'Kehinde',      'Ogunleye',     '2003-03-15', 'female', '11 Abeokuta Street, Sagamu',        'Ogun',      'Sagamu',             'Sagamu'),
  ('demo.aishat.lawal@example.com',       'Aishat',       'Lawal',        '2003-09-02', 'female', '14 Marina, Lagos Island',           'Lagos',     'Lagos Island',       'Lagos'),
  ('demo.uchechi.ibe@example.com',        'Uchechi',      'Ibe',          '2002-04-18', 'female', '1 Aba Road, Port Harcourt',         'Abia',      'Aba South',          'Aba'),
  ('demo.gbenga.olamide@example.com',     'Gbenga',       'Olamide',      '2003-11-26', 'male',   '13 Bashorun, Ibadan',               'Oyo',       'Ibadan North-East',  'Ibadan'),
  ('demo.fatima.umar@example.com',        'Fatima',       'Umar',         '2002-08-08', 'female', '17 Zaria Road, Kano',               'Kano',      'Fagge',              'Kano'),
  ('demo.dayo.afolayan@example.com',      'Dayo',         'Afolayan',     '2003-05-05', 'male',   '4 OAU Quarters, Ife',               'Osun',      'Ife East',           'Ile-Ife'),
  ('demo.adaeze.iwu@example.com',         'Adaeze',       'Iwu',          '2003-07-17', 'female', '20 Owerri Road, Owerri',            'Imo',       'Owerri North',       'Owerri'),
  ('demo.musa.aliyu@example.com',         'Musa',         'Aliyu',        '2002-02-23', 'male',   '8 Bida Road, Minna',                'Niger',     'Minna',              'Minna'),
  ('demo.shola.babatunde@example.com',    'Shola',        'Babatunde',    '2003-12-12', 'male',   '5 Allen Avenue, Ikeja, Lagos',      'Ekiti',     'Ado-Ekiti',          'Ado-Ekiti'),
  ('demo.kemi.balogun@example.com',       'Kemi',         'Balogun',      '2003-06-06', 'female', '22 Ojuelegba, Lagos',               'Lagos',     'Mushin',             'Lagos'),
  ('demo.suleiman.danjuma@example.com',   'Suleiman',     'Danjuma',      '2002-10-30', 'male',   '15 Wuse, Abuja',                    'Plateau',   'Jos North',          'Jos'),
  ('demo.peace.uche@example.com',         'Peace',        'Uche',         '2003-04-01', 'female', '9 New Owerri Layout',               'Imo',       'Owerri West',        'Owerri'),
  ('demo.victor.akpan@example.com',       'Victor',       'Akpan',        '2002-07-13', 'male',   '6 Calabar Road, Uyo',               'Akwa Ibom', 'Uyo',                'Uyo'),
  ('demo.maryam.usman@example.com',       'Maryam',       'Usman',        '2003-09-19', 'female', '3 Sokoto Road, Sokoto',             'Sokoto',    'Sokoto North',       'Sokoto'),
  ('demo.tomiwa.ajayi@example.com',       'Tomiwa',       'Ajayi',        '2003-02-28', 'male',   '7 Bashorun Road, Ibadan',           'Oyo',       'Ibadan South-West',  'Ibadan')
) AS v(email, first_name, last_name, dob, gender,
        residential_address, state_of_origin, lga, place_of_birth)
JOIN users u ON u.email = v.email
ON CONFLICT (user_id) DO UPDATE
  SET first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      display_name = EXCLUDED.display_name,
      date_of_birth = EXCLUDED.date_of_birth,
      gender = EXCLUDED.gender,
      residential_address = EXCLUDED.residential_address,
      state_of_origin = EXCLUDED.state_of_origin,
      lga = EXCLUDED.lga,
      place_of_birth = EXCLUDED.place_of_birth;

-- Phone updates (separate from profiles since phone lives on users)
UPDATE users SET phone = sub.phone
FROM (VALUES
  ('demo.adebayo.salami@example.com',     '+2348100000001'),
  ('demo.chinedu.okafor@example.com',     '+2348100000002'),
  ('demo.funmilayo.ojo@example.com',      '+2348100000003'),
  ('demo.ibrahim.musa@example.com',       '+2348100000004'),
  ('demo.ngozi.eze@example.com',          '+2348100000005'),
  ('demo.bisi.adewale@example.com',       '+2348100000006'),
  ('demo.tunde.bakare@example.com',       '+2348100000007'),
  ('demo.amina.yusuf@example.com',        '+2348100000008'),
  ('demo.kelechi.nwosu@example.com',      '+2348100000009'),
  ('demo.abdulrahman.bello@example.com',  '+2348100000010'),
  ('demo.chiamaka.onyema@example.com',    '+2348100000011'),
  ('demo.olusegun.adekunle@example.com',  '+2348100000012'),
  ('demo.zainab.ibrahim@example.com',     '+2348100000013'),
  ('demo.efe.osagie@example.com',         '+2348100000014'),
  ('demo.taiwo.ogunleye@example.com',     '+2348100000015'),
  ('demo.kehinde.ogunleye@example.com',   '+2348100000016'),
  ('demo.aishat.lawal@example.com',       '+2348100000017'),
  ('demo.uchechi.ibe@example.com',        '+2348100000018'),
  ('demo.gbenga.olamide@example.com',     '+2348100000019'),
  ('demo.fatima.umar@example.com',        '+2348100000020'),
  ('demo.dayo.afolayan@example.com',      '+2348100000021'),
  ('demo.adaeze.iwu@example.com',         '+2348100000022'),
  ('demo.musa.aliyu@example.com',         '+2348100000023'),
  ('demo.shola.babatunde@example.com',    '+2348100000024'),
  ('demo.kemi.balogun@example.com',       '+2348100000025'),
  ('demo.suleiman.danjuma@example.com',   '+2348100000026'),
  ('demo.peace.uche@example.com',         '+2348100000027'),
  ('demo.victor.akpan@example.com',       '+2348100000028'),
  ('demo.maryam.usman@example.com',       '+2348100000029'),
  ('demo.tomiwa.ajayi@example.com',       '+2348100000030')
) AS sub(email, phone)
WHERE users.email = sub.email AND (users.phone IS NULL OR users.phone = '');

-- Assign student + user roles to all demo users
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u, roles r
WHERE u.email LIKE 'demo.%@example.com'
  AND r.name IN ('student', 'user')
ON CONFLICT (user_id, role_id) DO NOTHING;

-- ============================================================================
-- 5. NIN verifications — one per demo student, all 'verified' so dashboards
--    show fully-populated rows. nin_hash uses SHA-256 of a synthetic NIN.
-- ============================================================================
-- Use MD5 (built-in, no extension needed) padded to 64 chars for the
-- nin_hash CHAR(64) column. The seed is demo data — no real PII.
INSERT INTO jupeb_nin_verifications (
  nin_hash, nin_last4, provider, status, response_payload, verified_at, requested_by
)
SELECT
  RPAD(MD5('DEMO-NIN-' || u.email), 64, '0'),
  SUBSTRING(MD5(u.email) FROM 1 FOR 4),
  'mock',
  'verified',
  jsonb_build_object(
    'first_name', p.first_name,
    'last_name', p.last_name,
    'name', p.display_name,
    'date_of_birth', p.date_of_birth,
    'gender', p.gender,
    'phone', u.phone,
    'address', p.residential_address,
    'state_of_origin', p.state_of_origin,
    'lga', p.lga,
    'place_of_birth', p.place_of_birth,
    'photo_url', NULL
  ),
  NOW() - INTERVAL '5 days',
  (SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1)
FROM users u
JOIN profiles p ON p.user_id = u.id
WHERE u.email LIKE 'demo.%@example.com'
  AND NOT EXISTS (
    SELECT 1 FROM jupeb_nin_verifications nv
    WHERE nv.nin_hash = RPAD(MD5('DEMO-NIN-' || u.email), 64, '0')
  );

-- ============================================================================
-- 6. Registrations — distribute across all 12 universities, mix of statuses
--    Use deterministic institution_issued_code (DEMO000001..030) so the seed
--    is idempotent and re-runnable.
-- ============================================================================
WITH email_slots AS (
  -- Explicit (email, slot) mapping. Slot drives the (university, status,
  -- sittings, code) assignment in the next CTE.
  SELECT * FROM (VALUES
    ('demo.adebayo.salami@example.com',     '000001'),
    ('demo.chinedu.okafor@example.com',     '000002'),
    ('demo.funmilayo.ojo@example.com',      '000003'),
    ('demo.ibrahim.musa@example.com',       '000004'),
    ('demo.ngozi.eze@example.com',          '000005'),
    ('demo.bisi.adewale@example.com',       '000006'),
    ('demo.tunde.bakare@example.com',       '000007'),
    ('demo.amina.yusuf@example.com',        '000008'),
    ('demo.kelechi.nwosu@example.com',      '000009'),
    ('demo.abdulrahman.bello@example.com',  '000010'),
    ('demo.chiamaka.onyema@example.com',    '000011'),
    ('demo.olusegun.adekunle@example.com',  '000012'),
    ('demo.zainab.ibrahim@example.com',     '000013'),
    ('demo.efe.osagie@example.com',         '000014'),
    ('demo.taiwo.ogunleye@example.com',     '000015'),
    ('demo.kehinde.ogunleye@example.com',   '000016'),
    ('demo.aishat.lawal@example.com',       '000017'),
    ('demo.uchechi.ibe@example.com',        '000018'),
    ('demo.gbenga.olamide@example.com',     '000019'),
    ('demo.fatima.umar@example.com',        '000020'),
    ('demo.dayo.afolayan@example.com',      '000021'),
    ('demo.adaeze.iwu@example.com',         '000022'),
    ('demo.musa.aliyu@example.com',         '000023'),
    ('demo.shola.babatunde@example.com',    '000024'),
    ('demo.kemi.balogun@example.com',       '000025'),
    ('demo.suleiman.danjuma@example.com',   '000026'),
    ('demo.peace.uche@example.com',         '000027'),
    ('demo.victor.akpan@example.com',       '000028'),
    ('demo.maryam.usman@example.com',       '000029'),
    ('demo.tomiwa.ajayi@example.com',       '000030')
  ) AS es(email, slot)
),
demo_data AS (
  SELECT
    u.id AS user_id,
    u.email,
    p.first_name,
    p.last_name,
    nv.id AS nin_verification_id,
    es.slot
  FROM email_slots es
  JOIN users u ON u.email = es.email
  JOIN profiles p ON p.user_id = u.id
  LEFT JOIN jupeb_nin_verifications nv
         ON nv.nin_hash = RPAD(MD5('DEMO-NIN-' || u.email), 64, '0')
),
slots AS (
  -- Map each slot to a (university, status, sittings, code) tuple.
  -- Values handpicked to spread across the 12 universities and produce
  -- varied counts on the dashboard bar chart.
  SELECT * FROM (VALUES
    -- slot, uni_code,  status,                          sittings, code
    ('000001', 'UNILAG',   'approved',                       1, 'DEMO000001'),
    ('000002', 'UNILAG',   'pending_institution_review',     2, 'DEMO000002'),
    ('000003', 'UNILAG',   'pending_documents',              1, 'DEMO000003'),
    ('000004', 'OAU',      'approved',                       1, 'DEMO000004'),
    ('000005', 'OAU',      'approved',                       2, 'DEMO000005'),
    ('000006', 'OAU',      'pending_institution_review',     1, 'DEMO000006'),
    ('000007', 'UI',       'approved',                       1, 'DEMO000007'),
    ('000008', 'UI',       'rejected',                       1, 'DEMO000008'),
    ('000009', 'FUTMINNA', 'pending_documents',              2, 'DEMO000009'),
    ('000010', 'FUTMINNA', 'approved',                       1, 'DEMO000010'),
    ('000011', 'FUTA',     'approved',                       1, 'DEMO000011'),
    ('000012', 'FUTA',     'pending_institution_review',     2, 'DEMO000012'),
    ('000013', 'UNILORIN', 'approved',                       1, 'DEMO000013'),
    ('000014', 'UNILORIN', 'pending_student_confirm',        1, 'DEMO000014'),
    ('000015', 'OOU',      'approved',                       1, 'DEMO000015'),
    ('000016', 'OOU',      'rejected',                       2, 'DEMO000016'),
    ('000017', 'CU',       'approved',                       1, 'DEMO000017'),
    ('000018', 'CU',       'pending_institution_review',     1, 'DEMO000018'),
    ('000019', 'FUNAAB',   'approved',                       1, 'DEMO000019'),
    ('000020', 'FUNAAB',   'pending_documents',              1, 'DEMO000020'),
    ('000021', 'ABU',      'approved',                       2, 'DEMO000021'),
    ('000022', 'ABU',      'approved',                       1, 'DEMO000022'),
    ('000023', 'ABU',      'pending_institution_review',     1, 'DEMO000023'),
    ('000024', 'ABU',      'rejected',                       1, 'DEMO000024'),
    ('000025', 'UNN',      'approved',                       1, 'DEMO000025'),
    ('000026', 'UNN',      'pending_documents',              2, 'DEMO000026'),
    ('000027', 'UNN',      'approved',                       1, 'DEMO000027'),
    ('000028', 'UNIZIK',   'approved',                       1, 'DEMO000028'),
    ('000029', 'UNIZIK',   'pending_institution_review',     1, 'DEMO000029'),
    ('000030', 'UNIZIK',   'pending_student_confirm',        2, 'DEMO000030')
  ) AS s(slot, uni_code, status, sittings, code)
)
INSERT INTO jupeb_registrations (
  session_id, university_id, user_id, subject_combination_id, nin_verification_id,
  institution_issued_code, provisional_serial, provisional_candidate_code,
  jupeb_candidate_number, sittings_count, result_types,
  status, claimed_at, submitted_at, approved_at,
  approved_by, created_by, institution_code_expires_at
)
SELECT
  sess.id,
  uni.id,
  d.user_id,
  -- Rotate across the four subject combinations to vary the data
  (SELECT id FROM jupeb_subject_combinations
    WHERE code = 'JUPEB SC-00' || ((CAST(s.slot AS INT) % 4) + 1)
    LIMIT 1),
  d.nin_verification_id,
  s.code,
  CAST(s.slot AS INT),
  -- provisional code: yearShort (2) + uniPrefix (3) + last-4-of-slot (4) = 9 digits
  -- Matches `jupeb_reg_final_number_format` regex `^[0-9]{2}[0-9]{3}[0-9]{4,}$`.
  sess.year_short || uni.jupeb_prefix || RIGHT(s.slot, 4),
  CASE WHEN s.status = 'approved'
    THEN sess.year_short || uni.jupeb_prefix || RIGHT(s.slot, 4)
    ELSE NULL END,
  s.sittings,
  CASE WHEN s.sittings = 2
    THEN '["waec","neco"]'::jsonb
    ELSE '["waec"]'::jsonb END,
  s.status,
  CASE WHEN s.status IN ('claimed', 'pending_student_confirm', 'pending_documents',
                         'pending_institution_review', 'approved', 'rejected')
    THEN NOW() - INTERVAL '20 days' ELSE NULL END,
  CASE WHEN s.status IN ('pending_institution_review', 'approved', 'rejected')
    THEN NOW() - INTERVAL '10 days' ELSE NULL END,
  CASE WHEN s.status = 'approved' THEN NOW() - INTERVAL '5 days' ELSE NULL END,
  CASE WHEN s.status = 'approved'
    THEN (SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1)
    ELSE NULL END,
  (SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1),
  NOW() + INTERVAL '90 days'
FROM slots s
JOIN demo_data d ON d.slot = s.slot
JOIN jupeb_universities uni ON uni.code = s.uni_code
JOIN jupeb_registration_sessions sess ON sess.academic_year = '2025/2026'
WHERE NOT EXISTS (
  SELECT 1 FROM jupeb_registrations r WHERE r.institution_issued_code = s.code
);

-- Status history rows for the demo registrations (single 'created' entry each)
INSERT INTO jupeb_registration_status_history (registration_id, from_status, to_status, reason, changed_by)
SELECT r.id, NULL, 'code_issued', 'demo seed', r.created_by
FROM jupeb_registrations r
WHERE r.institution_issued_code LIKE 'DEMO%'
  AND NOT EXISTS (
    SELECT 1 FROM jupeb_registration_status_history h
    WHERE h.registration_id = r.id
  );

-- ============================================================================
-- 7. Next-of-kin records for every demo registration
-- ============================================================================
INSERT INTO jupeb_next_of_kin (registration_id, name, relationship, phone, email, address, source, created_by)
SELECT r.id,
       v.nok_name, v.relationship, v.nok_phone, v.nok_email,
       p.residential_address, 'student', r.user_id
FROM jupeb_registrations r
JOIN users u ON u.id = r.user_id
JOIN profiles p ON p.user_id = u.id
JOIN (VALUES
  ('demo.adebayo.salami@example.com',     'Bola Salami',       'mother',  '+2348200000001', 'bola.salami@example.com'),
  ('demo.chinedu.okafor@example.com',     'Ifeoma Okafor',     'mother',  '+2348200000002', NULL),
  ('demo.funmilayo.ojo@example.com',      'Yemi Ojo',          'father',  '+2348200000003', NULL),
  ('demo.ibrahim.musa@example.com',       'Hadiza Musa',       'mother',  '+2348200000004', NULL),
  ('demo.ngozi.eze@example.com',          'Chuka Eze',         'father',  '+2348200000005', NULL),
  ('demo.bisi.adewale@example.com',       'Tola Adewale',      'sibling', '+2348200000006', NULL),
  ('demo.tunde.bakare@example.com',       'Funke Bakare',      'mother',  '+2348200000007', NULL),
  ('demo.amina.yusuf@example.com',        'Hassan Yusuf',      'father',  '+2348200000008', NULL),
  ('demo.kelechi.nwosu@example.com',      'Ada Nwosu',         'sibling', '+2348200000009', NULL),
  ('demo.abdulrahman.bello@example.com',  'Aisha Bello',       'mother',  '+2348200000010', NULL),
  ('demo.chiamaka.onyema@example.com',    'Emeka Onyema',      'father',  '+2348200000011', NULL),
  ('demo.olusegun.adekunle@example.com',  'Kemi Adekunle',     'mother',  '+2348200000012', NULL),
  ('demo.zainab.ibrahim@example.com',     'Sadiq Ibrahim',     'father',  '+2348200000013', NULL),
  ('demo.efe.osagie@example.com',         'Mary Osagie',       'mother',  '+2348200000014', NULL),
  ('demo.taiwo.ogunleye@example.com',     'Mrs. Ogunleye',     'mother',  '+2348200000015', NULL),
  ('demo.kehinde.ogunleye@example.com',   'Mrs. Ogunleye',     'mother',  '+2348200000015', NULL),
  ('demo.aishat.lawal@example.com',       'Wahab Lawal',       'father',  '+2348200000017', NULL),
  ('demo.uchechi.ibe@example.com',        'Chika Ibe',         'mother',  '+2348200000018', NULL),
  ('demo.gbenga.olamide@example.com',     'Tola Olamide',      'sibling', '+2348200000019', NULL),
  ('demo.fatima.umar@example.com',        'Bashir Umar',       'father',  '+2348200000020', NULL),
  ('demo.dayo.afolayan@example.com',      'Bola Afolayan',     'mother',  '+2348200000021', NULL),
  ('demo.adaeze.iwu@example.com',         'Chidi Iwu',         'father',  '+2348200000022', NULL),
  ('demo.musa.aliyu@example.com',         'Sani Aliyu',        'father',  '+2348200000023', NULL),
  ('demo.shola.babatunde@example.com',    'Adunni Babatunde',  'mother',  '+2348200000024', NULL),
  ('demo.kemi.balogun@example.com',       'Tunde Balogun',     'father',  '+2348200000025', NULL),
  ('demo.suleiman.danjuma@example.com',   'Maryam Danjuma',    'mother',  '+2348200000026', NULL),
  ('demo.peace.uche@example.com',         'Chinwe Uche',       'mother',  '+2348200000027', NULL),
  ('demo.victor.akpan@example.com',       'Idongesit Akpan',   'mother',  '+2348200000028', NULL),
  ('demo.maryam.usman@example.com',       'Aliyu Usman',       'father',  '+2348200000029', NULL),
  ('demo.tomiwa.ajayi@example.com',       'Femi Ajayi',        'father',  '+2348200000030', NULL)
) AS v(email, nok_name, relationship, nok_phone, nok_email)
  ON v.email = u.email
WHERE r.institution_issued_code LIKE 'DEMO%'
  AND NOT EXISTS (
    SELECT 1 FROM jupeb_next_of_kin n
    WHERE n.registration_id = r.id AND n.deleted_at IS NULL
  );

-- ============================================================================
-- 8. Biometric capture markers — half the candidates are "biometrics-complete"
--    Use external_reference (instead of file_id) so we don't need real files.
-- ============================================================================
INSERT INTO jupeb_biometric_captures (
  registration_id, capture_type, external_reference, quality_score,
  device_metadata, captured_at
)
SELECT r.id, 'face',
       'demo://face/' || r.institution_issued_code,
       0.92,
       jsonb_build_object('source', 'demo_seed', 'device', 'mobile'),
       NOW() - INTERVAL '6 days'
FROM jupeb_registrations r
WHERE r.institution_issued_code LIKE 'DEMO%'
  AND r.status IN ('approved', 'pending_institution_review')
  AND NOT EXISTS (
    SELECT 1 FROM jupeb_biometric_captures b
    WHERE b.registration_id = r.id AND b.capture_type = 'face'
  );

INSERT INTO jupeb_biometric_captures (
  registration_id, capture_type, external_reference, quality_score,
  device_metadata, captured_at
)
SELECT r.id, 'fingerprint',
       'demo://fingerprint/' || r.institution_issued_code,
       0.88,
       jsonb_build_object('source', 'demo_seed', 'device', 'mobile'),
       NOW() - INTERVAL '6 days'
FROM jupeb_registrations r
WHERE r.institution_issued_code LIKE 'DEMO%'
  AND r.status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM jupeb_biometric_captures b
    WHERE b.registration_id = r.id AND b.capture_type = 'fingerprint'
  );
