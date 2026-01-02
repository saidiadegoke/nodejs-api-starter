-- =====================================================
-- ADD VIEW RESPONSES PERMISSION
-- Adds permission to view individual poll/collection responses
-- =====================================================

-- Add new permission for viewing poll responses
INSERT INTO permissions (name, resource, action, description) VALUES
('polls.view_responses', 'polls', 'view_responses', 'View individual user responses for polls'),
('collections.view_responses', 'collections', 'view_responses', 'View individual user responses for collections')
ON CONFLICT (resource, action) DO NOTHING;

-- Grant view_responses permission to analyst role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'analyst'
AND p.name IN ('polls.view_responses', 'collections.view_responses')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant view_responses permission to content_creator role (can see responses to their own content)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'content_creator'
AND p.name IN ('polls.view_responses', 'collections.view_responses')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant view_responses permission to moderator role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'moderator'
AND p.name IN ('polls.view_responses', 'collections.view_responses')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Admin already has all permissions via the seed

-- Comments
COMMENT ON COLUMN permissions.name IS 'Permission name in format: resource.action';
