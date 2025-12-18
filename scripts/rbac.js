#!/usr/bin/env node

/**
 * RBAC Management CLI
 * Master script for managing roles, permissions, and user assignments
 */

const { spawn } = require('child_process');
const path = require('path');

function runScript(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, scriptName);
    const child = spawn('node', [scriptPath, ...args], {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script exited with code ${code}`));
      }
    });
    
    child.on('error', reject);
  });
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
🔧 RBAC Management CLI
======================

Usage:
  node scripts/rbac.js <command> [options]

Commands:
  create-role <name> <display_name> [description]
    Create a new role
    Example: node scripts/rbac.js create-role admin "Administrator" "Full access"

  create-permission <resource> <action> [description]
    Create a new permission
    Example: node scripts/rbac.js create-permission polls create "Create polls"

  add-permission-to-role <role_name> <permission_name>
    Add a permission to a role
    Example: node scripts/rbac.js add-permission-to-role admin polls.create

  add-role-to-user <user_email> <role_name> [expires_in_days]
    Add a role to a user
    Example: node scripts/rbac.js add-role-to-user user@example.com admin 30

  list-roles
    List all roles

  list-permissions
    List all permissions

  list-users
    List recent users

  show-user-roles <user_email>
    Show roles for a specific user

  list-role-permissions <role_name>
    Show permissions assigned to a specific role

  compare-roles <role1> <role2>
    Compare permissions between two roles

  setup-common
    Create common roles and permissions for the system

  -h, --help
    Show this help message

Examples:
  # Setup basic RBAC structure
  node scripts/rbac.js setup-common
  
  # Create a custom role
  node scripts/rbac.js create-role content_creator "Content Creator" "Can create content"
  
  # Add permissions to role
  node scripts/rbac.js add-permission-to-role content_creator polls.create
  node scripts/rbac.js add-permission-to-role content_creator authoring.create
  
  # Assign role to user
  node scripts/rbac.js add-role-to-user user@example.com content_creator
  
  # View user's roles
  node scripts/rbac.js show-user-roles user@example.com
  
  # View role's permissions
  node scripts/rbac.js list-role-permissions admin
  
  # Compare two roles
  node scripts/rbac.js compare-roles admin moderator
`);
    process.exit(0);
  }
  
  const command = args[0];
  const commandArgs = args.slice(1);
  
  try {
    switch (command) {
      case 'create-role':
        await runScript('create-role.js', commandArgs);
        break;
        
      case 'create-permission':
        await runScript('create-permission.js', commandArgs);
        break;
        
      case 'add-permission-to-role':
        await runScript('add-permission-to-role.js', commandArgs);
        break;
        
      case 'add-role-to-user':
        await runScript('add-role-to-user.js', commandArgs);
        break;
        
      case 'list-roles':
        await runScript('create-role.js', ['--list']);
        break;
        
      case 'list-permissions':
        await runScript('create-permission.js', ['--list']);
        break;
        
      case 'list-users':
        await runScript('add-role-to-user.js', ['--list-users']);
        break;
        
      case 'show-user-roles':
        if (commandArgs.length !== 1) {
          console.error('❌ Error: Please provide user email');
          process.exit(1);
        }
        await runScript('list-user-roles.js', [commandArgs[0]]);
        break;
        
      case 'list-role-permissions':
        if (commandArgs.length !== 1) {
          console.error('❌ Error: Please provide role name');
          process.exit(1);
        }
        await runScript('list-role-permissions.js', [commandArgs[0]]);
        break;
        
      case 'compare-roles':
        if (commandArgs.length !== 2) {
          console.error('❌ Error: Please provide two role names');
          process.exit(1);
        }
        await runScript('list-role-permissions.js', ['--compare', commandArgs[0], commandArgs[1]]);
        break;
        
      case 'setup-common':
        await setupCommon();
        break;
        
      default:
        console.error(`❌ Unknown command: ${command}`);
        console.error('Run "node scripts/rbac.js --help" for usage information');
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

async function setupCommon() {
  console.log('🚀 Setting up common RBAC structure...\n');
  
  try {
    // Create common permissions
    console.log('📝 Creating common permissions...');
    await runScript('create-permission.js', ['--create-common']);
    
    console.log('\n📋 Creating common roles...');
    
    // Create admin role
    await runScript('create-role.js', ['admin', 'Administrator', 'Full system access and administration']);
    
    // Create moderator role
    await runScript('create-role.js', ['moderator', 'Moderator', 'Can moderate content and users']);
    
    // Create content creator role
    await runScript('create-role.js', ['content_creator', 'Content Creator', 'Can create and manage content']);
    
    // Create premium user role
    await runScript('create-role.js', ['premium_user', 'Premium User', 'Premium features access']);
    
    // Create analyst role
    await runScript('create-role.js', ['analyst', 'Analyst', 'Can view analytics and generate reports']);
    
    console.log('\n🔗 Assigning permissions to roles...');
    
    // Admin gets everything
    const adminPermissions = [
      'system.admin', 'system.config', 'system.logs',
      'users.view', 'users.create', 'users.update', 'users.delete', 'users.moderate',
      'polls.view', 'polls.create', 'polls.update', 'polls.delete', 'polls.moderate', 'polls.respond',
      'comments.view', 'comments.create', 'comments.update', 'comments.delete', 'comments.moderate',
      'context_sources.view', 'context_sources.create', 'context_sources.update', 'context_sources.delete', 'context_sources.moderate',
      'analytics.view', 'analytics.export',
      'authoring.create', 'authoring.bulk_create'
    ];
    
    for (const permission of adminPermissions) {
      await runScript('add-permission-to-role.js', ['admin', permission]);
    }
    
    // Moderator permissions
    const moderatorPermissions = [
      'users.view', 'users.moderate',
      'polls.view', 'polls.moderate', 'polls.respond',
      'comments.view', 'comments.moderate',
      'context_sources.view', 'context_sources.moderate',
      'analytics.view'
    ];
    
    for (const permission of moderatorPermissions) {
      await runScript('add-permission-to-role.js', ['moderator', permission]);
    }
    
    // Content creator permissions
    const creatorPermissions = [
      'polls.view', 'polls.create', 'polls.update', 'polls.delete', 'polls.respond',
      'comments.view', 'comments.create', 'comments.update', 'comments.delete',
      'context_sources.view', 'context_sources.create', 'context_sources.update', 'context_sources.delete',
      'authoring.create', 'authoring.bulk_create'
    ];
    
    for (const permission of creatorPermissions) {
      await runScript('add-permission-to-role.js', ['content_creator', permission]);
    }
    
    // Premium user permissions
    const premiumPermissions = [
      'polls.view', 'polls.create', 'polls.update', 'polls.delete', 'polls.respond',
      'comments.view', 'comments.create', 'comments.update', 'comments.delete',
      'context_sources.view', 'context_sources.create', 'context_sources.update', 'context_sources.delete',
      'authoring.create'
    ];
    
    for (const permission of premiumPermissions) {
      await runScript('add-permission-to-role.js', ['premium_user', permission]);
    }
    
    // Analyst permissions
    const analystPermissions = [
      'polls.view', 'polls.respond',
      'comments.view',
      'context_sources.view',
      'analytics.view', 'analytics.export'
    ];
    
    for (const permission of analystPermissions) {
      await runScript('add-permission-to-role.js', ['analyst', permission]);
    }
    
    console.log('\n✅ Common RBAC structure setup complete!');
    console.log('\n📋 Created roles:');
    console.log('  • admin - Full system access');
    console.log('  • moderator - Content and user moderation');
    console.log('  • content_creator - Content creation and management');
    console.log('  • premium_user - Premium features');
    console.log('  • analyst - Analytics and reporting');
    
    console.log('\n🔗 Next steps:');
    console.log('  1. Assign roles to users: node scripts/rbac.js add-role-to-user user@example.com admin');
    console.log('  2. List all roles: node scripts/rbac.js list-roles');
    console.log('  3. List all permissions: node scripts/rbac.js list-permissions');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});