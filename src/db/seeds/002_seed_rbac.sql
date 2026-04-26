-- RBAC Seeder
-- Creates default roles and generic permissions. Add/remove resources to match your app.

-- ==================== ROLES ====================

INSERT INTO roles (name, display_name, description, is_system) VALUES
('super_admin', 'Super Admin', 'Full system access and administration', true),
('admin', 'Administrator', 'Administrator with full management access', true),
('agent', 'Agent', 'Support agent with limited management access', true),
('user', 'User', 'Regular user with basic access', true)
ON CONFLICT (name) DO NOTHING;

-- ==================== PERMISSIONS ====================

INSERT INTO permissions (name, resource, action, description) VALUES
-- System permissions
('system.admin', 'system', 'admin', 'Full system administration access'),
('system.config', 'system', 'config', 'Manage system configuration'),
('system.logs', 'system', 'logs', 'View system logs'),

-- User permissions
('users.view', 'users', 'view', 'View user profiles'),
('users.create', 'users', 'create', 'Create new users'),
('users.update', 'users', 'update', 'Update user profiles'),
('users.delete', 'users', 'delete', 'Delete users')
ON CONFLICT (resource, action) DO NOTHING;

-- ==================== ROLE PERMISSIONS ====================

-- super_admin gets everything
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- admin gets everything
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- agent gets view + update on users
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'agent'
AND p.name IN ('users.view', 'users.update')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- user has no resource permissions by default; add as needed

-- ==================== DEFAULT ADMIN ASSIGNMENT ====================

-- Assign super_admin and admin roles to admin@example.com (from 001_seed_users.sql)
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE u.email = 'admin@example.com' AND r.name IN ('super_admin', 'admin')
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Role assignment can also be done via CLI, e.g.:
--   node scripts/rbac.js add-role-to-user admin@example.com super_admin
