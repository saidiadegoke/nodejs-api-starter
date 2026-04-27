-- Dedicated JUPEB student test account (login: student@example.com / Student@12)
INSERT INTO users (email, phone, email_verified, phone_verified, password_hash, status) VALUES
('student@example.com', '+2348200000000', true, true, '$2a$10$blUvzJlgCbWl5uaKCWCMSOK.ECArvoly4FuRu5KeMrtw92raxgUbO', 'active')
ON CONFLICT (email) DO NOTHING;

INSERT INTO profiles (user_id, first_name, last_name, display_name)
SELECT u.id, 'Test', 'Student', 'Test Student'
FROM users u
WHERE u.email = 'student@example.com'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE u.email = 'student@example.com' AND r.name IN ('student', 'user')
ON CONFLICT (user_id, role_id) DO NOTHING;
