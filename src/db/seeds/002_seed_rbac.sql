-- SmartStore RBAC Seeder
-- Creates roles and permissions for the SmartStore e-commerce platform

-- ==================== ROLES ====================

-- Insert default system roles
INSERT INTO roles (name, display_name, description, is_system) VALUES
('user', 'User', 'Regular user with basic site management', true),
('admin', 'Administrator', 'Full system access and administration', true)
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
('analytics.export', 'analytics', 'export', 'Export analytics data')
ON CONFLICT (resource, action) DO NOTHING;

-- ==================== ROLE PERMISSIONS ====================

-- Grant permissions to user role (basic site management)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'user'
AND p.name IN (
  'users.view', 'users.update',
  'sites.view', 'sites.create', 'sites.update', 'sites.delete',
  'templates.view', 'templates.create', 'templates.update', 'templates.delete',
  'products.view', 'products.create', 'products.update', 'products.delete',
  'orders.view', 'orders.create', 'orders.update', 'orders.delete',
  'customers.view', 'customers.create', 'customers.update',
  'deployments.view', 'deployments.create',
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
-- Example: node scripts/rbac.js add-role-to-user admin@smartstore.ng admin

-- You can uncomment and modify this if you want to automatically assign admin role
-- INSERT INTO user_roles (user_id, role_id)
-- SELECT u.id, r.id FROM users u, roles r
-- WHERE r.name = 'admin'
-- AND u.email = 'admin@smartstore.ng'
-- ON CONFLICT (user_id, role_id) DO NOTHING;
