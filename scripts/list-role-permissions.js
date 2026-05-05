#!/usr/bin/env node

/**
 * CLI Script: List Role Permissions
 * Usage: node scripts/list-role-permissions.js <role_name>
 * Example: node scripts/list-role-permissions.js admin
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function listRolePermissions(roleName) {
  const client = await pool.connect();
  
  try {
    // First check if role exists
    const roleResult = await client.query(
      'SELECT id, name, display_name, description, is_system, created_at FROM roles WHERE name = $1',
      [roleName]
    );
    
    if (roleResult.rows.length === 0) {
      console.log(`❌ Role '${roleName}' not found`);
      return;
    }
    
    const role = roleResult.rows[0];
    
    // Get role permissions
    const permissionsResult = await client.query(`
      SELECT 
        p.name as permission_name,
        p.resource,
        p.action,
        p.description,
        rp.granted_at,
        p.created_at as permission_created_at
      FROM role_permissions rp
      JOIN permissions p ON rp.permission_id = p.id
      WHERE rp.role_id = $1
      ORDER BY p.resource, p.action
    `, [role.id]);
    
    // Get user count for this role
    const userCountResult = await client.query(
      'SELECT COUNT(*) as user_count FROM user_roles WHERE role_id = $1',
      [role.id]
    );
    
    const userCount = userCountResult.rows[0].user_count;
    const systemBadge = role.is_system ? ' [SYSTEM]' : '';
    
    console.log(`\n📋 Role: ${role.display_name} (${role.name})${systemBadge}`);
    console.log('=====================================');
    
    if (role.description) {
      console.log(`Description: ${role.description}`);
    }
    
    console.log(`Created: ${role.created_at.toDateString()}`);
    console.log(`Users with this role: ${userCount}`);
    console.log(`Permissions: ${permissionsResult.rows.length}`);
    console.log('');
    
    if (permissionsResult.rows.length === 0) {
      console.log('❌ This role has no permissions assigned');
      return;
    }
    
    // Group permissions by resource
    const permissionsByResource = {};
    permissionsResult.rows.forEach(perm => {
      if (!permissionsByResource[perm.resource]) {
        permissionsByResource[perm.resource] = [];
      }
      permissionsByResource[perm.resource].push(perm);
    });
    
    console.log('🔐 Assigned Permissions:');
    console.log('========================');
    
    Object.keys(permissionsByResource).sort().forEach(resource => {
      console.log(`\n📁 ${resource.toUpperCase()}:`);
      
      permissionsByResource[resource].forEach(perm => {
        console.log(`  ✅ ${perm.permission_name}`);
        if (perm.description) {
          console.log(`     ${perm.description}`);
        }
        console.log(`     Granted: ${perm.granted_at.toDateString()}`);
      });
    });
    
    // Summary by resource
    console.log('\n📊 Summary by Resource:');
    console.log('=======================');
    Object.keys(permissionsByResource).sort().forEach(resource => {
      const count = permissionsByResource[resource].length;
      const actions = permissionsByResource[resource].map(p => p.action).sort().join(', ');
      console.log(`• ${resource}: ${count} permission(s) (${actions})`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

async function listAllRolesWithPermissions() {
  const client = await pool.connect();
  
  try {
    const result = await client.query(`
      SELECT 
        r.name,
        r.display_name,
        r.description,
        r.is_system,
        r.created_at,
        COUNT(rp.permission_id) as permission_count,
        COUNT(ur.user_id) as user_count,
        ARRAY_AGG(
          DISTINCT p.resource 
          ORDER BY p.resource
        ) FILTER (WHERE p.resource IS NOT NULL) as resources
      FROM roles r
      LEFT JOIN role_permissions rp ON r.id = rp.role_id
      LEFT JOIN permissions p ON rp.permission_id = p.id
      LEFT JOIN user_roles ur ON r.id = ur.role_id
      GROUP BY r.id, r.name, r.display_name, r.description, r.is_system, r.created_at
      ORDER BY r.name
    `);
    
    console.log('\n📋 All Roles with Permission Summary:');
    console.log('=====================================');
    
    if (result.rows.length === 0) {
      console.log('No roles found.');
      return;
    }
    
    result.rows.forEach((role, index) => {
      const systemBadge = role.is_system ? ' [SYSTEM]' : '';
      const resources = role.resources || [];
      
      console.log(`${index + 1}. ${role.display_name} (${role.name})${systemBadge}`);
      
      if (role.description) {
        console.log(`   Description: ${role.description}`);
      }
      
      console.log(`   Created: ${role.created_at.toDateString()}`);
      console.log(`   Users: ${role.user_count} | Permissions: ${role.permission_count}`);
      
      if (resources.length > 0) {
        console.log(`   Resources: ${resources.join(', ')}`);
      } else {
        console.log(`   Resources: None`);
      }
      
      console.log('');
    });
    
  } finally {
    client.release();
  }
}

async function compareRoles(role1Name, role2Name) {
  const client = await pool.connect();
  
  try {
    // Get permissions for both roles
    const role1Perms = await client.query(`
      SELECT p.name, p.resource, p.action, p.description
      FROM role_permissions rp
      JOIN permissions p ON rp.permission_id = p.id
      JOIN roles r ON rp.role_id = r.id
      WHERE r.name = $1
      ORDER BY p.resource, p.action
    `, [role1Name]);
    
    const role2Perms = await client.query(`
      SELECT p.name, p.resource, p.action, p.description
      FROM role_permissions rp
      JOIN permissions p ON rp.permission_id = p.id
      JOIN roles r ON rp.role_id = r.id
      WHERE r.name = $2
      ORDER BY p.resource, p.action
    `, [role2Name]);
    
    if (role1Perms.rows.length === 0) {
      console.log(`❌ Role '${role1Name}' not found or has no permissions`);
      return;
    }
    
    if (role2Perms.rows.length === 0) {
      console.log(`❌ Role '${role2Name}' not found or has no permissions`);
      return;
    }
    
    const role1PermSet = new Set(role1Perms.rows.map(p => p.name));
    const role2PermSet = new Set(role2Perms.rows.map(p => p.name));
    
    const commonPerms = [...role1PermSet].filter(p => role2PermSet.has(p));
    const role1OnlyPerms = [...role1PermSet].filter(p => !role2PermSet.has(p));
    const role2OnlyPerms = [...role2PermSet].filter(p => !role1PermSet.has(p));
    
    console.log(`\n🔍 Comparing Roles: ${role1Name} vs ${role2Name}`);
    console.log('===============================================');
    
    console.log(`\n✅ Common Permissions (${commonPerms.length}):`);
    commonPerms.sort().forEach(perm => {
      console.log(`  • ${perm}`);
    });
    
    console.log(`\n🔵 Only in '${role1Name}' (${role1OnlyPerms.length}):`);
    role1OnlyPerms.sort().forEach(perm => {
      console.log(`  • ${perm}`);
    });
    
    console.log(`\n🟡 Only in '${role2Name}' (${role2OnlyPerms.length}):`);
    role2OnlyPerms.sort().forEach(perm => {
      console.log(`  • ${perm}`);
    });
    
    console.log(`\n📊 Summary:`);
    console.log(`  ${role1Name}: ${role1PermSet.size} permissions`);
    console.log(`  ${role2Name}: ${role2PermSet.size} permissions`);
    console.log(`  Common: ${commonPerms.length} permissions`);
    console.log(`  Differences: ${role1OnlyPerms.length + role2OnlyPerms.length} permissions`);
    
  } finally {
    client.release();
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
🔧 List Role Permissions Script
===============================

Usage:
  node scripts/list-role-permissions.js <role_name>
  node scripts/list-role-permissions.js --all
  node scripts/list-role-permissions.js --compare <role1> <role2>

Examples:
  node scripts/list-role-permissions.js admin
  node scripts/list-role-permissions.js moderator
  node scripts/list-role-permissions.js --compare admin moderator

Options:
  --all                    List all roles with permission summary
  --compare <role1> <role2> Compare permissions between two roles
  -h, --help              Show this help message

Description:
  Shows detailed information about permissions assigned to a role including:
  - Role details (name, description, user count)
  - All assigned permissions grouped by resource
  - Permission descriptions and grant dates
  - Summary statistics
`);
    process.exit(0);
  }
  
  if (args[0] === '--all') {
    await listAllRolesWithPermissions();
    process.exit(0);
  }
  
  if (args[0] === '--compare') {
    if (args.length !== 3) {
      console.error('❌ Error: Please provide two role names to compare');
      console.error('Usage: node scripts/list-role-permissions.js --compare <role1> <role2>');
      process.exit(1);
    }
    await compareRoles(args[1], args[2]);
    process.exit(0);
  }
  
  if (args.length !== 1) {
    console.error('❌ Error: Please provide a role name');
    console.error('Usage: node scripts/list-role-permissions.js <role_name>');
    process.exit(1);
  }
  
  const roleName = args[0];
  await listRolePermissions(roleName);
  
  await pool.end();
}

main().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});