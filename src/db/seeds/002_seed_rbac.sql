-- SmartStore RBAC Seeder
-- Creates roles and permissions for the SmartStore e-commerce platform.
-- Ensures all roles have permissions needed to access their respective API routes and pages.

-- ==================== ROLES ====================

-- Insert default system roles
INSERT INTO roles (name, display_name, description, is_system) VALUES
('super_admin', 'Super Admin', 'Full system access and administration', true),
('admin', 'Administrator', 'Administrator with full access', true),
('school_admin', 'School Admin', 'School-level administration', true),
('teacher', 'Teacher', 'Teacher with authoring and content access', true),
('student', 'Student', 'Student with view access', true),
('parent', 'Parent', 'Parent with view access to linked accounts', true)
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

-- Grant dashboard permissions to school_admin (sites, templates, products, orders, referrals, settings)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'school_admin'
AND p.name IN (
  'users.view', 'users.update', 'users.create',
  'sites.view', 'sites.create', 'sites.update', 'sites.delete',
  'templates.view', 'templates.create', 'templates.update', 'templates.delete',
  'products.view', 'products.create', 'products.update', 'products.delete',
  'orders.view', 'orders.create', 'orders.update', 'orders.delete', 'orders.accept',
  'customers.view', 'customers.create', 'customers.update',
  'deployments.view', 'deployments.create',
  'analytics.view',
  'authoring.create', 'authoring.bulk_create'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant teacher: view + authoring (content creation)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'teacher'
AND p.name IN (
  'users.view', 'users.update',
  'sites.view', 'sites.update',
  'templates.view', 'templates.create', 'templates.update',
  'products.view', 'products.create', 'products.update',
  'orders.view', 'orders.create', 'orders.update', 'orders.accept',
  'customers.view', 'customers.update',
  'deployments.view',
  'analytics.view',
  'authoring.create', 'authoring.bulk_create'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant student: view + place/manage own orders (orders.create, orders.update for confirm/cancel)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'student'
AND p.name IN (
  'sites.view', 'templates.view', 'products.view', 'orders.view', 'orders.create', 'orders.update',
  'customers.view',
  'deployments.view', 'analytics.view'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant parent: view + place/manage own orders
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'parent'
AND p.name IN (
  'sites.view', 'products.view', 'orders.view', 'orders.create', 'orders.update', 'customers.view',
  'deployments.view', 'analytics.view'
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
