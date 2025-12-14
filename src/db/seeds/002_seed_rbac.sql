-- Insert default system roles
INSERT INTO roles (name, display_name, description, is_system) VALUES
('user', 'User', 'Regular user who creates polls', true),
('customer', 'Customer', 'Regular customer who creates orders', true),
('shopper', 'Shopper', 'Service provider who fulfills orders', true),
('dispatcher', 'Dispatcher', 'Delivery personnel', true),
('admin', 'Administrator', 'Platform administrator', true),
('support', 'Support Agent', 'Customer support representative', true)
ON CONFLICT (name) DO NOTHING;

-- Insert base permissions
INSERT INTO permissions (name, resource, action, description) VALUES
-- Order permissions
('orders.create', 'orders', 'create', 'Create new orders'),
('orders.read', 'orders', 'read', 'View order details'),
('orders.update', 'orders', 'update', 'Update orders'),
('orders.delete', 'orders', 'delete', 'Cancel/delete orders'),
('orders.list', 'orders', 'list', 'List all orders'),
('orders.accept', 'orders', 'accept', 'Accept orders as shopper/dispatcher'),
('orders.complete', 'orders', 'complete', 'Mark orders as completed'),

-- User permissions
('users.read', 'users', 'read', 'View user profiles'),
('users.update', 'users', 'update', 'Update user profiles'),
('users.manage', 'users', 'manage', 'Manage users (admin)'),
('users.delete', 'users', 'delete', 'Delete users'),

-- Payment permissions
('payments.read', 'payments', 'read', 'View payment details'),
('payments.create', 'payments', 'create', 'Process payments'),
('payments.refund', 'payments', 'refund', 'Process refunds'),

-- Wallet permissions
('wallet.read', 'wallet', 'read', 'View wallet balance'),
('wallet.withdraw', 'wallet', 'withdraw', 'Withdraw from wallet'),
('wallet.topup', 'wallet', 'topup', 'Top up wallet'),

-- Support permissions
('support.tickets', 'support', 'tickets', 'Access support tickets'),
('support.respond', 'support', 'respond', 'Respond to support tickets'),

-- Admin permissions
('admin.dashboard', 'admin', 'dashboard', 'Access admin dashboard'),
('admin.reports', 'admin', 'reports', 'View system reports'),
('admin.settings', 'admin', 'settings', 'Manage system settings')
ON CONFLICT (resource, action) DO NOTHING;

-- Grant permissions to customer role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'customer' 
AND p.name IN (
  'orders.create', 'orders.read', 'orders.update', 'orders.delete',
  'users.read', 'users.update',
  'payments.read', 'payments.create',
  'wallet.read', 'wallet.topup',
  'support.tickets'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant permissions to shopper role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'shopper' 
AND p.name IN (
  'orders.read', 'orders.accept', 'orders.complete',
  'users.read', 'users.update',
  'payments.read',
  'wallet.read', 'wallet.withdraw',
  'support.tickets'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant permissions to dispatcher role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'dispatcher' 
AND p.name IN (
  'orders.read', 'orders.accept', 'orders.complete',
  'users.read', 'users.update',
  'payments.read',
  'wallet.read', 'wallet.withdraw',
  'support.tickets'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant permissions to support role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'support' 
AND p.name IN (
  'orders.read', 'orders.list',
  'users.read', 'users.manage',
  'payments.read', 'payments.refund',
  'support.tickets', 'support.respond'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant ALL permissions to admin role (super user)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Assign admin role to Super Admin user
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE r.name = 'admin'
AND u.email = 'admin@runcitygo.com'
ON CONFLICT (user_id, role_id) DO NOTHING;

