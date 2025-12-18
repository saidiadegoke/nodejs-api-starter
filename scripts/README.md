# RBAC Management Scripts

This directory contains CLI scripts for managing the Role-Based Access Control (RBAC) system in OpinionPulse.

## Quick Start

### 1. Setup Common RBAC Structure
```bash
npm run rbac:setup
# or
node scripts/rbac.js setup-common
```

This creates:
- **Common permissions** for all resources (users, polls, comments, etc.)
- **Standard roles**: admin, moderator, content_creator, premium_user, analyst
- **Permission assignments** for each role

### 2. Assign Roles to Users
```bash
npm run rbac add-role-to-user user@example.com admin
# or
node scripts/rbac.js add-role-to-user user@example.com admin
```

## Available Scripts

### Master Script
- `npm run rbac` - Main RBAC management CLI with all commands

### Individual Scripts
- `npm run rbac:create-role` - Create new roles
- `npm run rbac:create-permission` - Create new permissions  
- `npm run rbac:add-permission-to-role` - Assign permissions to roles
- `npm run rbac:add-role-to-user` - Assign roles to users
- `npm run rbac:list-user-roles` - List roles assigned to a user
- `npm run rbac:list-role-permissions` - List permissions assigned to a role

## Commands Reference

### Create Role
```bash
node scripts/rbac.js create-role <name> <display_name> [description]

# Examples
node scripts/rbac.js create-role admin "Administrator" "Full system access"
node scripts/rbac.js create-role content_creator "Content Creator" "Can create content"
```

### Create Permission
```bash
node scripts/rbac.js create-permission <resource> <action> [description]

# Examples
node scripts/rbac.js create-permission polls create "Create new polls"
node scripts/rbac.js create-permission users moderate "Moderate user accounts"
```

### Add Permission to Role
```bash
node scripts/rbac.js add-permission-to-role <role_name> <permission_name>

# Examples
node scripts/rbac.js add-permission-to-role admin system.admin
node scripts/rbac.js add-permission-to-role moderator polls.moderate
```

### Add Role to User
```bash
node scripts/rbac.js add-role-to-user <user_email> <role_name> [expires_in_days]

# Examples
node scripts/rbac.js add-role-to-user user@example.com admin
node scripts/rbac.js add-role-to-user user@example.com moderator 30  # expires in 30 days
```

### List Commands
```bash
node scripts/rbac.js list-roles           # List all roles
node scripts/rbac.js list-permissions     # List all permissions
node scripts/rbac.js list-users          # List recent users
node scripts/rbac.js show-user-roles user@example.com  # Show user's roles
node scripts/rbac.js list-role-permissions admin       # Show role's permissions
node scripts/rbac.js compare-roles admin moderator     # Compare two roles
```

## Default Roles & Permissions

### Admin Role
- **Full system access** including:
  - System administration (config, logs)
  - User management (create, update, delete, moderate)
  - Content moderation (polls, comments, context sources)
  - Analytics access and export
  - Bulk authoring capabilities

### Moderator Role
- **Content and user moderation**:
  - View and moderate users
  - Moderate polls, comments, and context sources
  - View analytics
  - Respond to polls

### Content Creator Role
- **Content creation and management**:
  - Create, update, delete own polls and context sources
  - Comment on content
  - Use authoring tools (including bulk creation)
  - Respond to polls

### Premium User Role
- **Enhanced user capabilities**:
  - Create, update, delete own content
  - Comment on content
  - Basic authoring tools
  - Respond to polls

### Analyst Role
- **Analytics and reporting**:
  - View and export analytics
  - View content (polls, comments, context sources)
  - Respond to polls

## Permission Structure

Permissions follow the format: `resource.action`

### Resources
- `system` - System administration
- `users` - User management
- `polls` - Poll management
- `comments` - Comment management
- `context_sources` - Story/context source management
- `analytics` - Analytics and reporting
- `authoring` - Content creation tools

### Actions
- `view` - Read access
- `create` - Create new items
- `update` - Update own items
- `delete` - Delete own items
- `moderate` - Moderate any items
- `admin` - Administrative access
- `export` - Export data

## Examples

### Setup for New Project
```bash
# 1. Setup basic structure
npm run rbac:setup

# 2. Create your first admin user
npm run rbac add-role-to-user admin@yourcompany.com admin

# 3. Create content creators
npm run rbac add-role-to-user creator@yourcompany.com content_creator

# 4. Create moderators
npm run rbac add-role-to-user mod@yourcompany.com moderator
```

### Custom Role Creation
```bash
# Create a custom role
npm run rbac create-role beta_tester "Beta Tester" "Access to beta features"

# Add specific permissions
npm run rbac add-permission-to-role beta_tester polls.create
npm run rbac add-permission-to-role beta_tester polls.respond
npm run rbac add-permission-to-role beta_tester comments.create

# Assign to users
npm run rbac add-role-to-user tester@example.com beta_tester 90  # 90 day access
```

### Temporary Access
```bash
# Give someone temporary admin access for 7 days
npm run rbac add-role-to-user temp-admin@example.com admin 7

# Give analyst access for 30 days
npm run rbac add-role-to-user analyst@example.com analyst 30
```

## Environment Variables

Make sure your `.env` file contains the database connection details:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=opinionpulse
DB_USER=your_db_user
DB_PASSWORD=your_db_password
```

## Troubleshooting

### Common Issues

1. **"Role not found"** - Use `npm run rbac list-roles` to see available roles
2. **"Permission not found"** - Use `npm run rbac list-permissions` to see available permissions
3. **"User not found"** - Make sure the user exists in the database first
4. **Database connection errors** - Check your `.env` file and database status

### Detailed Analysis Commands

```bash
# Show detailed user role information
npm run rbac:list-user-roles user@example.com
# Shows: role status, expiry dates, who assigned roles, days remaining

# Show detailed role permission information  
npm run rbac:list-role-permissions admin
# Shows: all permissions grouped by resource, descriptions, grant dates

# Compare permissions between roles
node scripts/rbac.js compare-roles admin moderator
# Shows: common permissions, unique permissions for each role

# List all users with roles
node scripts/rbac.js show-user-roles --all
# Shows: all users who have roles assigned with summary

# List all roles with permission counts
node scripts/rbac.js list-role-permissions --all
# Shows: all roles with permission and user counts
```

### Getting Help

```bash
# Get help for any command
node scripts/rbac.js --help
node scripts/rbac.js create-role --help
node scripts/rbac.js add-role-to-user --help
node scripts/list-user-roles.js --help
node scripts/list-role-permissions.js --help
```