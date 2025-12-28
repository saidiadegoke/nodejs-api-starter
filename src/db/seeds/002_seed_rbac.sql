-- Opinion Polls RBAC Seeder
-- Creates roles and permissions for the opinion polling platform

-- ==================== ROLES ====================

-- Insert default system roles
INSERT INTO roles (name, display_name, description, is_system) VALUES
('user', 'User', 'Regular user with basic poll participation', true),
('premium_user', 'Premium User', 'Premium user with enhanced features', true),
('content_creator', 'Content Creator', 'Can create and manage polls and content', true),
('analyst', 'Analyst', 'Can view analytics and generate reports', true),
('moderator', 'Moderator', 'Can moderate content and users', true),
('admin', 'Administrator', 'Full system access and administration', true)
ON CONFLICT (name) DO NOTHING;

-- ==================== PERMISSIONS ====================

-- Insert permissions for the Opinion Polls platform
INSERT INTO permissions (name, resource, action, description) VALUES
-- System permissions
('system.admin', 'system', 'admin', 'Full system administration access'),
('system.config', 'system', 'config', 'Manage system configuration'),
('system.logs', 'system', 'logs', 'View system logs'),

-- User permissions
('users.view', 'users', 'view', 'View user profiles'),
('users.create', 'users', 'create', 'Create new users'),
('users.update', 'users', 'update', 'Update user profiles'),
('users.delete', 'users', 'delete', 'Delete users'),
('users.moderate', 'users', 'moderate', 'Moderate users and enforce policies'),

-- Poll permissions
('polls.view', 'polls', 'view', 'View polls'),
('polls.create', 'polls', 'create', 'Create new polls'),
('polls.update', 'polls', 'update', 'Update own polls'),
('polls.delete', 'polls', 'delete', 'Delete own polls'),
('polls.moderate', 'polls', 'moderate', 'Moderate any poll content'),
('polls.respond', 'polls', 'respond', 'Respond to polls (vote)'),

-- Comment permissions
('comments.view', 'comments', 'view', 'View comments'),
('comments.create', 'comments', 'create', 'Create comments'),
('comments.update', 'comments', 'update', 'Update own comments'),
('comments.delete', 'comments', 'delete', 'Delete own comments'),
('comments.moderate', 'comments', 'moderate', 'Moderate any comments'),

-- Context source permissions
('context_sources.view', 'context_sources', 'view', 'View context sources (stories)'),
('context_sources.create', 'context_sources', 'create', 'Create context sources'),
('context_sources.update', 'context_sources', 'update', 'Update own context sources'),
('context_sources.delete', 'context_sources', 'delete', 'Delete own context sources'),
('context_sources.moderate', 'context_sources', 'moderate', 'Moderate any context sources'),

-- Analytics permissions
('analytics.view', 'analytics', 'view', 'View platform analytics'),
('analytics.export', 'analytics', 'export', 'Export analytics data'),

-- Authoring permissions
('authoring.create', 'authoring', 'create', 'Use authoring wizards'),
('authoring.bulk_create', 'authoring', 'bulk_create', 'Bulk create polls and stories')
ON CONFLICT (resource, action) DO NOTHING;

-- ==================== ROLE PERMISSIONS ====================

-- Grant permissions to user role (basic participation)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'user'
AND p.name IN (
  'polls.view', 'polls.respond',
  'comments.view', 'comments.create', 'comments.update', 'comments.delete',
  'context_sources.view',
  'users.view', 'users.update'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant permissions to premium_user role (enhanced features)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'premium_user'
AND p.name IN (
  'polls.view', 'polls.create', 'polls.update', 'polls.delete', 'polls.respond',
  'comments.view', 'comments.create', 'comments.update', 'comments.delete',
  'context_sources.view', 'context_sources.create', 'context_sources.update', 'context_sources.delete',
  'users.view', 'users.update',
  'authoring.create'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant permissions to content_creator role (content management)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'content_creator'
AND p.name IN (
  'polls.view', 'polls.create', 'polls.update', 'polls.delete', 'polls.respond',
  'comments.view', 'comments.create', 'comments.update', 'comments.delete',
  'context_sources.view', 'context_sources.create', 'context_sources.update', 'context_sources.delete',
  'users.view', 'users.update',
  'authoring.create', 'authoring.bulk_create'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant permissions to analyst role (analytics access)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'analyst'
AND p.name IN (
  'polls.view', 'polls.respond',
  'comments.view',
  'context_sources.view',
  'users.view',
  'analytics.view', 'analytics.export'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant permissions to moderator role (content moderation)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'moderator'
AND p.name IN (
  'users.view', 'users.moderate',
  'polls.view', 'polls.moderate', 'polls.respond',
  'comments.view', 'comments.moderate',
  'context_sources.view', 'context_sources.moderate',
  'analytics.view'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant ALL permissions to admin role (super user)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ==================== DEFAULT ADMIN ASSIGNMENT ====================

-- Note: Admin user assignment should be done manually via RBAC CLI
-- Example: node scripts/rbac.js add-role-to-user admin@opinionpulse.org admin

-- You can uncomment and modify this if you want to automatically assign admin role
-- INSERT INTO user_roles (user_id, role_id)
-- SELECT u.id, r.id FROM users u, roles r
-- WHERE r.name = 'admin'
-- AND u.email = 'admin@opinionpulse.org'
-- ON CONFLICT (user_id, role_id) DO NOTHING;
