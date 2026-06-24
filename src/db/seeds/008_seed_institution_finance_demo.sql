-- Demo institution admin + payment history for UNILAG (institution portal Payment UI).
-- Login: unilag-admin@example.com / Admin@12
-- Idempotent — safe to re-run.

-- ============================================================================
-- 1. UNILAG institution admin
-- ============================================================================
INSERT INTO users (email, phone, email_verified, phone_verified, password_hash, status)
SELECT 'unilag-admin@example.com', '+2348100000999', true, true,
       '$2a$10$jhQRFJ1CV3akvRAY.3lc1uPxrNt68lmZm2YozRyX/NxfYDr.iw/HK', 'active'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'unilag-admin@example.com');

INSERT INTO profiles (user_id, first_name, last_name, display_name, jupeb_university_id)
SELECT u.id, 'UNILAG', 'Admin', 'UNILAG Admin', uni.id
FROM users u
CROSS JOIN jupeb_universities uni
WHERE u.email = 'unilag-admin@example.com'
  AND uni.code = 'UNILAG'
ON CONFLICT (user_id) DO UPDATE SET
  jupeb_university_id = EXCLUDED.jupeb_university_id,
  display_name = EXCLUDED.display_name,
  updated_at = NOW();

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
CROSS JOIN roles r
WHERE u.email = 'unilag-admin@example.com'
  AND r.name = 'institution_admin'
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO user_universities (user_id, university_id, role, is_primary, created_by)
SELECT u.id, uni.id, 'institution_admin', true, admin.id
FROM users u
CROSS JOIN jupeb_universities uni
LEFT JOIN users admin ON admin.email = 'admin@example.com'
WHERE u.email = 'unilag-admin@example.com'
  AND uni.code = 'UNILAG'
  AND NOT EXISTS (
    SELECT 1 FROM user_universities uu
    WHERE uu.user_id = u.id AND uu.university_id = uni.id
  );

-- ============================================================================
-- 2. Sample institution-scoped payments (open session + UNILAG)
-- ============================================================================
INSERT INTO payments (
  payment_id, amount, currency, type, payment_type, status, payment_method,
  user_id, purpose, payment_item_id, payment_structure_id,
  jupeb_university_id, jupeb_session_id, paid_at, created_at
)
SELECT v.payment_id, v.amount, 'NGN', 'other', 'checkout', v.status, v.payment_method,
       u.id, v.purpose, pi.id, ps.id, uni.id, sess.id, v.paid_at, v.created_at
FROM (VALUES
  ('PAY_DEMO_AFF_001', 50000.00, 'completed', 'direct_transfer',
   'Q1 2026 Payment', 'affiliation_fee', 'partial',
   '2026-03-01 14:32:15+00'::timestamptz, '2026-03-01 14:30:00+00'::timestamptz),
  ('PAY_DEMO_AFF_002', 50000.00, 'completed', 'direct_transfer',
   'Q1 2026 Payment', 'affiliation_fee', 'partial',
   '2026-03-02 10:15:00+00'::timestamptz, '2026-03-02 10:00:00+00'::timestamptz),
  ('PAY_DEMO_AFF_003', 50000.00, 'pending', 'direct_transfer',
   'Q2 2026 Payment', 'affiliation_fee', 'partial',
   NULL, '2026-03-10 09:00:00+00'::timestamptz),
  ('PAY_DEMO_EXM_001', 50000.00, 'completed', 'direct_transfer',
   'Q1 2026 Payment', 'examination_fee', 'partial',
   '2026-03-01 16:00:00+00'::timestamptz, '2026-03-01 15:45:00+00'::timestamptz),
  ('PAY_DEMO_EXM_002', 50000.00, 'completed', 'remita',
   'Q1 2026 Payment', 'examination_fee', 'partial',
   '2026-03-03 11:20:00+00'::timestamptz, '2026-03-03 11:00:00+00'::timestamptz),
  ('PAY_DEMO_EXM_003', 50000.00, 'completed', 'paystack',
   'Examination batch', 'examination_fee', 'full',
   '2026-03-05 08:30:00+00'::timestamptz, '2026-03-05 08:00:00+00'::timestamptz)
) AS v(payment_id, amount, status, payment_method, purpose, item_code, structure_code, paid_at, created_at)
CROSS JOIN users u
CROSS JOIN jupeb_universities uni
CROSS JOIN jupeb_registration_sessions sess
JOIN payment_items pi ON LOWER(pi.code) = v.item_code AND pi.deleted_at IS NULL
JOIN payment_structures ps ON LOWER(ps.code) = v.structure_code AND ps.deleted_at IS NULL
WHERE u.email = 'unilag-admin@example.com'
  AND uni.code = 'UNILAG'
  AND sess.academic_year = '2025/2026'
  AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.payment_id = v.payment_id);
