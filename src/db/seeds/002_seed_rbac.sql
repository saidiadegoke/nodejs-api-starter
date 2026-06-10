-- RBAC Seeder
-- Creates default roles and generic permissions. Add/remove resources to match your app.

-- ==================== ROLES ====================

INSERT INTO roles (name, display_name, description, is_system) VALUES
('super_admin', 'Super Admin', 'Full system access and administration', true),
('admin', 'Administrator', 'Administrator with full management access', true),
('agent', 'Agent', 'Support agent with limited management access', true),
('user', 'User', 'Regular user with basic access', true),
('registrar', 'Registrar', 'JUPEB registrar operations (catalog, sessions, numbering)', true),
('program_director', 'Program Director', 'Institution program director (NIN verify, provisional registration)', true),
('institution_admin', 'Institution Admin', 'Institution-level administration', true),
('financial_admin', 'Financial Admin', 'JUPEB finance reporting and reconciliation', true),
('student', 'Student', 'JUPEB student participant (registration, finance, submissions)', true)
ON CONFLICT (name) DO NOTHING;

-- ==================== PERMISSIONS ====================

INSERT INTO permissions (name, resource, action, description) VALUES
-- System permissions
('system.admin', 'system', 'admin', 'Full system administration access'),
('system.config', 'system', 'config', 'Manage system configuration'),
('system.logs', 'system', 'logs', 'View system logs'),

-- Permission management (RBAC)
('permissions.view', 'permissions', 'view', 'View permissions'),
('permissions.remove', 'permissions', 'remove', 'Remove permissions from users'),

-- Role management
('roles.create', 'roles', 'create', 'Create new roles'),
('roles.update', 'roles', 'update', 'Edit roles'),
('roles.delete', 'roles', 'delete', 'Delete roles'),
('roles.view', 'roles', 'view', 'View role details'),

-- Session management
('sessions.create', 'sessions', 'create', 'Create new sessions'),
('sessions.update', 'sessions', 'update', 'Edit sessions'),
('sessions.delete', 'sessions', 'delete', 'Delete sessions'),
('sessions.view', 'sessions', 'view', 'View sessions'),

-- User management
('users.view', 'users', 'view', 'View user profiles'),
('users.create', 'users', 'create', 'Create new users'),
('users.update', 'users', 'update', 'Update user profiles'),
('users.delete', 'users', 'delete', 'Delete users'),

-- Institution management
('institutions.create', 'institutions', 'create', 'Create institutions'),
('institutions.update', 'institutions', 'update', 'Edit institutions'),
('institutions.delete', 'institutions', 'delete', 'Delete institutions'),
('institutions.view', 'institutions', 'view', 'View institutions'),

-- Subject management
('subject.create', 'subject', 'create', 'Create subjects'),
('subject.view', 'subject', 'view', 'View subject details'),
('subject.update', 'subject', 'update', 'Edit subjects'),
('subject.delete', 'subject', 'delete', 'Delete subjects'),

-- Subject combination management
('subject_combinations.create', 'subject_combinations', 'create', 'Create subject combinations'),
('subject_combinations.update', 'subject_combinations', 'update', 'Edit subject combinations'),
('subject_combinations.view', 'subject_combinations', 'view', 'View subject combinations'),
('subject_combinations.delete', 'subject_combinations', 'delete', 'Delete subject combinations'),

-- Payments & reporting
('payments.view', 'payments', 'view', 'View payments'),
('activity_logs.view', 'activity_logs', 'view', 'View activity log'),
('reports.view', 'reports', 'view', 'View reports'),
('reports.export', 'reports', 'export', 'Export reports'),

-- JUPEB
('jupeb.catalog.manage', 'jupeb', 'catalog', 'Manage JUPEB catalog (universities, subject combinations)'),
('jupeb.identity.verify', 'jupeb', 'identity_verify', 'Verify NIN and access identity proofs'),
('profiles.jupeb_university_id', 'profiles', 'jupeb_university_id', 'Owns profiles.jupeb_university_id — institution-scope binding for JUPEB actions')
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

-- registrar: JUPEB catalog management
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'registrar'
AND p.name = 'jupeb.catalog.manage'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- institution roles: NIN / identity verify
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name IN ('program_director', 'institution_admin', 'registrar')
AND p.name = 'jupeb.identity.verify'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- institution_admin owns its profiles.jupeb_university_id binding —
-- src/modules/jupeb/utils/institution-scope.js refuses every JUPEB action
-- for a member of this role whose profile has no jupeb_university_id set.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'institution_admin'
AND p.name = 'profiles.jupeb_university_id'
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
