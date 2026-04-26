-- Create Super Admin User
-- Login: admin@example.com / Admin@12  (bcrypt cost 10; rotate after first login in production)
-- Regenerate: node -e "console.log(require('bcryptjs').hashSync('Admin@12',10))"
-- Legacy: older template seeds used the same bcrypt string for plaintext "password". If Admin@12 fails
-- on an old DB, log in with "password" once, change password, or run:
--   UPDATE users SET password_hash = '$2a$10$jhQRFJ1CV3akvRAY.3lc1uPxrNt68lmZm2YozRyX/NxfYDr.iw/HK' WHERE email = 'admin@example.com';
INSERT INTO users (email, phone, email_verified, phone_verified, password_hash, status) VALUES
('admin@example.com', '+2348100000000', true, true, '$2a$10$jhQRFJ1CV3akvRAY.3lc1uPxrNt68lmZm2YozRyX/NxfYDr.iw/HK', 'active')
ON CONFLICT DO NOTHING;

-- Create profile for Super Admin (idempotent)
INSERT INTO profiles (user_id, first_name, last_name, display_name)
SELECT u.id, 'Super', 'Admin', 'Super Admin'
FROM users u
WHERE u.email = 'admin@example.com'
ON CONFLICT (user_id) DO NOTHING;
