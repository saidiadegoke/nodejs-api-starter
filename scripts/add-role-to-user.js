#!/usr/bin/env node

/**
 * CLI Script: Add Role to User
 * Usage: node scripts/add-role-to-user.js <user_email> <role_name> [expires_in_days]
 * Example: node scripts/add-role-to-user.js user@example.com admin 30
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

async function addRoleToUser(userEmail, roleName, expiresInDays = null) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Find user
    const userResult = await client.query(
      'SELECT id, email FROM users WHERE email = $1',
      [userEmail]
    );
    
    if (userResult.rows.length === 0) {
      throw new Error(`User with email '${userEmail}' not found`);
    }
    
    const user = userResult.rows[0];
    
    // Find role
    const roleResult = await client.query(
      'SELECT id, name, display_name FROM roles WHERE name = $1',
      [roleName]
    );
    
    if (roleResult.rows.length === 0) {
      throw new Error(`Role '${roleName}' not found`);
    }
    
    const role = roleResult.rows[0];
    
    // Calculate expiry date if provided
    let expiresAt = null;
    if (expiresInDays) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + parseInt(expiresInDays));
      expiresAt = expiry;
    }
    
    // Check if already exists
    const existingResult = await client.query(
      'SELECT id, expires_at FROM user_roles WHERE user_id = $1 AND role_id = $2',
      [user.id, role.id]
    );
    
    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];
      
      // Update expiry if different
      if (expiresAt && (!existing.expires_at || existing.expires_at.getTime() !== expiresAt.getTime())) {
        await client.query(
          'UPDATE user_roles SET expires_at = $1 WHERE user_id = $2 AND role_id = $3',
          [expiresAt, user.id, role.id]
        );
        console.log(`✅ Updated expiry for role '${role.display_name}' for user '${userEmail}' to ${expiresAt ? expiresAt.toDateString() : 'never'}`);
      } else {
        console.log(`✅ Role '${role.display_name}' already assigned to user '${userEmail}'`);
      }
      
      await client.query('COMMIT');
      return;
    }
    
    // Add role to user
    await client.query(
      'INSERT INTO user_roles (user_id, role_id, expires_at) VALUES ($1, $2, $3)',
      [user.id, role.id, expiresAt]
    );
    
    await client.query('COMMIT');
    
    const expiryText = expiresAt ? ` (expires: ${expiresAt.toDateString()})` : ' (permanent)';
    console.log(`✅ Successfully added role '${role.display_name}' to user '${userEmail}'${expiryText}`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

async function listUsers() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT 
        u.email,
        p.display_name,
        u.status,
        u.created_at,
        COALESCE(
          ARRAY_AGG(r.display_name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL),
          '{}'::text[]
        ) as roles
      FROM users u
      LEFT JOIN profiles p ON u.id = p.user_id
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.deleted_at IS NULL
      GROUP BY u.id, u.email, p.display_name, u.status, u.created_at
      ORDER BY u.created_at DESC
      LIMIT 20
    `);
    
    console.log('\n👥 Recent Users (last 20):');
    console.log('===========================');
    result.rows.forEach(user => {
      const roles = user.roles.length > 0 ? user.roles.join(', ') : 'No roles';
      console.log(`• ${user.email} (${user.display_name || 'No display name'})`);
      console.log(`  Status: ${user.status} | Roles: ${roles}`);
      console.log(`  Created: ${user.created_at.toDateString()}`);
      console.log('');
    });
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

async function showUserRoles(userEmail) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT 
        r.name,
        r.display_name,
        r.description,
        ur.assigned_at,
        ur.expires_at,
        assigner.email as assigned_by_email
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      LEFT JOIN users assigner ON ur.assigned_by = assigner.id
      WHERE u.email = $1
      ORDER BY ur.assigned_at DESC
    `, [userEmail]);
    
    if (result.rows.length === 0) {
      console.log(`\n👤 User '${userEmail}' has no roles assigned`);
      return;
    }
    
    console.log(`\n👤 Roles for user '${userEmail}':`);
    console.log('=====================================');
    result.rows.forEach(role => {
      const expiry = role.expires_at ? ` (expires: ${role.expires_at.toDateString()})` : ' (permanent)';
      const assignedBy = role.assigned_by_email ? ` by ${role.assigned_by_email}` : '';
      console.log(`• ${role.display_name} (${role.name})${expiry}`);
      console.log(`  Assigned: ${role.assigned_at.toDateString()}${assignedBy}`);
      if (role.description) {
        console.log(`  ${role.description}`);
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
🔧 Add Role to User Script
==========================

Usage:
  node scripts/add-role-to-user.js <user_email> <role_name> [expires_in_days]
  node scripts/add-role-to-user.js --list-users
  node scripts/add-role-to-user.js --list-roles
  node scripts/add-role-to-user.js --show-roles <user_email>

Examples:
  node scripts/add-role-to-user.js user@example.com admin
  node scripts/add-role-to-user.js user@example.com moderator 30
  node scripts/add-role-to-user.js user@example.com content_creator 365

Options:
  --list-users       List recent users
  --list-roles       List all available roles
  --show-roles       Show roles for a specific user
  -h, --help         Show this help message

Notes:
  - expires_in_days is optional (role will be permanent if not specified)
  - If role already exists, expiry date will be updated if different
`);
    process.exit(0);
  }
  
  if (args[0] === '--list-users') {
    await listUsers();
    process.exit(0);
  }
  
  if (args[0] === '--list-roles') {
    await listRoles();
    process.exit(0);
  }
  
  if (args[0] === '--show-roles') {
    if (args.length !== 2) {
      console.error('❌ Error: Please provide user email');
      console.error('Usage: node scripts/add-role-to-user.js --show-roles <user_email>');
      process.exit(1);
    }
    await showUserRoles(args[1]);
    process.exit(0);
  }
  
  if (args.length < 2 || args.length > 3) {
    console.error('❌ Error: Please provide user email and role name');
    console.error('Usage: node scripts/add-role-to-user.js <user_email> <role_name> [expires_in_days]');
    process.exit(1);
  }
  
  const [userEmail, roleName, expiresInDays] = args;
  await addRoleToUser(userEmail, roleName, expiresInDays);
  
  await pool.end();
}

main().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});