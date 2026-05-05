#!/usr/bin/env node

/**
 * CLI Script: Add Permission to Role
 * Usage: node scripts/add-permission-to-role.js <role_name> <permission_name>
 * Example: node scripts/add-permission-to-role.js admin analytics.view
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

async function addPermissionToRole(roleName, permissionName) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Find role
    const roleResult = await client.query(
      'SELECT id, name FROM roles WHERE name = $1',
      [roleName]
    );
    
    if (roleResult.rows.length === 0) {
      throw new Error(`Role '${roleName}' not found`);
    }
    
    const role = roleResult.rows[0];
    
    // Find permission
    const permissionResult = await client.query(
      'SELECT id, name FROM permissions WHERE name = $1',
      [permissionName]
    );
    
    if (permissionResult.rows.length === 0) {
      throw new Error(`Permission '${permissionName}' not found`);
    }
    
    const permission = permissionResult.rows[0];
    
    // Check if already exists
    const existingResult = await client.query(
      'SELECT id FROM role_permissions WHERE role_id = $1 AND permission_id = $2',
      [role.id, permission.id]
    );
    
    if (existingResult.rows.length > 0) {
      console.log(`✅ Permission '${permissionName}' already assigned to role '${roleName}'`);
      await client.query('COMMIT');
      return;
    }
    
    // Add permission to role
    await client.query(
      'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)',
      [role.id, permission.id]
    );
    
    await client.query('COMMIT');
    console.log(`✅ Successfully added permission '${permissionName}' to role '${roleName}'`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

async function listRoles() {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT name, display_name, description FROM roles ORDER BY name'
    );
    
    console.log('\n📋 Available Roles:');
    console.log('==================');
    result.rows.forEach(role => {
      console.log(`• ${role.name} - ${role.display_name}`);
      if (role.description) {
        console.log(`  ${role.description}`);
      }
    });
    console.log('');
  } finally {
    client.release();
  }
}

async function listPermissions() {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT name, resource, action, description FROM permissions ORDER BY resource, action'
    );
    
    console.log('\n🔐 Available Permissions:');
    console.log('=========================');
    result.rows.forEach(perm => {
      console.log(`• ${perm.name} (${perm.resource}.${perm.action})`);
      if (perm.description) {
        console.log(`  ${perm.description}`);
      }
    });
    console.log('');
  } finally {
    client.release();
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
🔧 Add Permission to Role Script
================================

Usage:
  node scripts/add-permission-to-role.js <role_name> <permission_name>
  node scripts/add-permission-to-role.js --list-roles
  node scripts/add-permission-to-role.js --list-permissions

Examples:
  node scripts/add-permission-to-role.js admin system.admin
  node scripts/add-permission-to-role.js agent users.update
  node scripts/add-permission-to-role.js editor users.view

Options:
  --list-roles        List all available roles
  --list-permissions  List all available permissions
  -h, --help         Show this help message
`);
    process.exit(0);
  }
  
  if (args[0] === '--list-roles') {
    await listRoles();
    process.exit(0);
  }
  
  if (args[0] === '--list-permissions') {
    await listPermissions();
    process.exit(0);
  }
  
  if (args.length !== 2) {
    console.error('❌ Error: Please provide both role name and permission name');
    console.error('Usage: node scripts/add-permission-to-role.js <role_name> <permission_name>');
    process.exit(1);
  }
  
  const [roleName, permissionName] = args;
  await addPermissionToRole(roleName, permissionName);
  
  await pool.end();
}

main().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});