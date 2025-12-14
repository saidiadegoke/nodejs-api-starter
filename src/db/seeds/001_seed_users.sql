-- Create Super Admin User
-- Password: Admin@12 (bcrypt hash with cost 10)
-- Generate proper hash with: bcrypt.hash('Admin@123456', 10)
INSERT INTO users (email, phone, email_verified, phone_verified, password_hash, status) VALUES
('admin@example.com', '+2348100000000', true, true, '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'active')
ON CONFLICT (email) DO NOTHING;

-- Create profile for Super Admin
INSERT INTO profiles (user_id, first_name, last_name, display_name) 
SELECT 
  u.id, 
  'Super',
  'Admin',
  'Super Admin'
FROM users u
WHERE u.email = 'admin@example.com'
ON CONFLICT (user_id) DO NOTHING;
