#!/usr/bin/env node

/**
 * CLI Script: Create Role
 * Usage: node scripts/create-role.js <role_name> <display_name> [description]
 * Example: node scripts/create-role.js content_creator "Content Creator" "Can create and manage content"
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

async function createRole(name, displayName, description = null) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Check if role already exists
    const existingResult = await client.query(
      'SELECT id, name FROM roles WHERE name = $1',
      [name]
    );
    
    if (existingResult.rows.length > 0) {
      console.log(`✅ Role '${name}' already exists`);
      await client.query('COMMIT');
      return;
    }
    
    // Create role
    const result = await client.query(
      'INSERT INTO roles (name, display_name, description) VALUES ($1, $2, $3) RETURNING id',
      [name, displayName, description]
    );
    
    await client.query('COMMIT');
    console.log(`✅ Successfully created role '${name}' (${displayName})`);
    if (description) {
      console.log(`   Description: ${description}`);
    }
    
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
    const result = await client.query(`
      SELECT 
        r.name,
        r.display_name,
        r.description,
        r.is_system,
        r.created_at,
        COUNT(ur.user_id) as user_count,
        COUNT(rp.permission_id) as permission_count
      FROM roles r
      LEFT JOIN user_roles ur ON r.id = ur.role_id
      LEFT JOIN role_permissions rp ON r.id = rp.role_id
      GROUP BY r.id, r.name, r.display_name, r.description, r.is_system, r.created_at
      ORDER BY r.name
    `);
    
    console.log('\n📋 All Roles:');
    console.log('=============');
    result.rows.forEach(role => {
      const systemBadge = role.is_system ? ' [SYSTEM]' : '';
      console.log(`• ${role.name} - ${role.display_name}${systemBadge}`);
      console.log(`  Users: ${role.user_count} | Permissions: ${role.permission_count}`);
      console.log(`  Created: ${role.created_at.toDateString()}`);
      if (role.description) {
        console.log(`  Description: ${role.description}`);
      }
      console.log('');
    });
  } finally {
    client.release();
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
🔧 Create Role Script
=====================

Usage:
  node scripts/create-role.js <role_name> <display_name> [description]
  node scripts/create-role.js --list

Examples:
  node scripts/create-role.js admin "Administrator" "Full system access"
  node scripts/create-role.js moderator "Moderator" "Can moderate content and users"
  node scripts/create-role.js content_creator "Content Creator" "Can create and manage content"
  node scripts/create-role.js premium_user "Premium User"

Options:
  --list             List all existing roles
  -h, --help         Show this help message

Notes:
  - role_name should be lowercase with underscores (e.g., content_creator)
  - display_name is the human-readable name (e.g., "Content Creator")
  - description is optional but recommended
`);
    process.exit(0);
  }
  
  if (args[0] === '--list') {
    await listRoles();
    process.exit(0);
  }
  
  if (args.length < 2) {
    console.error('❌ Error: Please provide role name and display name');
    console.error('Usage: node scripts/create-role.js <role_name> <display_name> [description]');
    process.exit(1);
  }
  
  const [name, displayName, description] = args;
  await createRole(name, displayName, description);
  
  await pool.end();
}

main().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});