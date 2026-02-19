-- SmartStore RBAC Seeder
-- Creates roles and permissions for the SmartStore e-commerce platform.
-- Ensures all roles have permissions needed to access their respective API routes and pages.

-- ==================== ROLES ====================

-- Insert default system roles
INSERT INTO roles (name, display_name, description, is_system) VALUES
('super_admin', 'Super Admin', 'Full system access and administration', true),
('admin', 'Administrator', 'Administrator with full access to manage stores', true),
('agent', 'Agent', 'Support agent with limited management access', true),
('user', 'User', 'Regular user with basic access', true)
ON CONFLICT (name) DO NOTHING;

-- ==================== PERMISSIONS ====================

-- Insert permissions for the SmartStore platform
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

-- Site permissions
('sites.view', 'sites', 'view', 'View sites'),
('sites.create', 'sites', 'create', 'Create new sites'),
('sites.update', 'sites', 'update', 'Update own sites'),
('sites.delete', 'sites', 'delete', 'Delete own sites'),
('sites.manage', 'sites', 'manage', 'Manage any site'),

-- Template permissions
('templates.view', 'templates', 'view', 'View templates'),
('templates.create', 'templates', 'create', 'Create new templates'),
('templates.update', 'templates', 'update', 'Update own templates'),
('templates.delete', 'templates', 'delete', 'Delete own templates'),
('templates.manage', 'templates', 'manage', 'Manage any template'),

-- Product permissions
('products.view', 'products', 'view', 'View products'),
('products.create', 'products', 'create', 'Create new products'),
('products.update', 'products', 'update', 'Update own products'),
('products.delete', 'products', 'delete', 'Delete own products'),
('products.manage', 'products', 'manage', 'Manage any product'),

-- Order permissions
('orders.view', 'orders', 'view', 'View orders'),
('orders.create', 'orders', 'create', 'Create new orders'),
('orders.update', 'orders', 'update', 'Update own orders'),
('orders.delete', 'orders', 'delete', 'Delete own orders'),
('orders.manage', 'orders', 'manage', 'Manage any order'),

-- Customer permissions
('customers.view', 'customers', 'view', 'View customers'),
('customers.create', 'customers', 'create', 'Create new customers'),
('customers.update', 'customers', 'update', 'Update customer profiles'),
('customers.delete', 'customers', 'delete', 'Delete customers'),

-- SSL/Certificate permissions (admin only)
('certificates.view', 'certificates', 'view', 'View SSL certificates'),
('certificates.create', 'certificates', 'create', 'Create SSL certificates'),
('certificates.manage', 'certificates', 'manage', 'Manage SSL certificates'),

-- Deployment permissions
('deployments.view', 'deployments', 'view', 'View deployments'),
('deployments.create', 'deployments', 'create', 'Create deployments'),
('deployments.manage', 'deployments', 'manage', 'Manage deployments'),

-- Analytics permissions
('analytics.view', 'analytics', 'view', 'View platform analytics'),
('analytics.export', 'analytics', 'export', 'Export analytics data'),

-- Authoring permissions (wizard, bulk create)
('authoring.create', 'authoring', 'create', 'Create content via authoring wizard'),
('authoring.bulk_create', 'authoring', 'bulk_create', 'Bulk create content (polls, stories, templates)'),

-- Order workflow (used by orders module)
('orders.accept', 'orders', 'accept', 'Accept orders')
ON CONFLICT (resource, action) DO NOTHING;

-- ==================== ROLE PERMISSIONS ====================

-- Grant ALL permissions to super_admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant ALL permissions to admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant agent: support-focused permissions (view, limited update, no delete)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'agent'
AND p.name IN (
  'users.view', 'users.update',
  'sites.view', 'sites.update',
  'templates.view',
  'products.view', 'products.update',
  'orders.view', 'orders.update', 'orders.accept',
  'customers.view', 'customers.update',
  'certificates.view',
  'deployments.view',
  'analytics.view'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant user: basic view permissions and ability to manage own orders
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'user'
AND p.name IN (
  'sites.view',
  'templates.view',
  'products.view',
  'orders.view', 'orders.create', 'orders.update',
  'customers.view',
  'deployments.view',
  'analytics.view'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ==================== DEFAULT ADMIN ASSIGNMENT ====================

-- Assign super_admin and admin roles to the super admin user (admin@example.com from 001_seed_users.sql)
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE u.email = 'admin@example.com' AND r.name IN ('super_admin', 'admin')
ON CONFLICT (user_id, role_id) DO NOTHING;

-- ==================== DEFAULT ADMIN ASSIGNMENT ====================

-- Note: Role assignment should be done via RBAC CLI, e.g.:
-- node scripts/rbac.js add-role-to-user admin@example.com super_admin
-- node scripts/rbac.js add-role-to-user admin@example.com admin
