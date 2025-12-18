#!/usr/bin/env node

/**
 * CLI Script: List User Roles
 * Usage: node scripts/list-user-roles.js <user_email>
 * Example: node scripts/list-user-roles.js user@example.com
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

async function listUserRoles(userEmail) {
  const client = await pool.connect();
  
  try {
    // First check if user exists
    const userResult = await client.query(
      'SELECT id, email FROM users WHERE email = $1',
      [userEmail]
    );
    
    if (userResult.rows.length === 0) {
      console.log(`❌ User with email '${userEmail}' not found`);
      return;
    }
    
    const user = userResult.rows[0];
    
    // Get user roles with details
    const rolesResult = await client.query(`
      SELECT 
        r.name as role_name,
        r.display_name,
        r.description,
        r.is_system,
        ur.assigned_at,
        ur.expires_at,
        assigner.email as assigned_by_email,
        CASE 
          WHEN ur.expires_at IS NULL THEN 'Permanent'
          WHEN ur.expires_at > NOW() THEN 'Active'
          ELSE 'Expired'
        END as status,
        CASE 
          WHEN ur.expires_at IS NOT NULL AND ur.expires_at > NOW() 
          THEN EXTRACT(days FROM ur.expires_at - NOW())::INTEGER
          ELSE NULL
        END as days_until_expiry
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      LEFT JOIN users assigner ON ur.assigned_by = assigner.id
      WHERE ur.user_id = $1
      ORDER BY ur.assigned_at DESC
    `, [user.id]);
    
    if (rolesResult.rows.length === 0) {
      console.log(`\n👤 User '${userEmail}' has no roles assigned`);
      return;
    }
    
    console.log(`\n👤 Roles for user: ${userEmail}`);
    console.log('=====================================');
    
    rolesResult.rows.forEach((role, index) => {
      const systemBadge = role.is_system ? ' [SYSTEM]' : '';
      const statusEmoji = role.status === 'Active' ? '✅' : role.status === 'Expired' ? '❌' : '🔒';
      
      console.log(`${index + 1}. ${statusEmoji} ${role.display_name} (${role.role_name})${systemBadge}`);
      
      if (role.description) {
        console.log(`   Description: ${role.description}`);
      }
      
      console.log(`   Status: ${role.status}`);
      console.log(`   Assigned: ${role.assigned_at.toDateString()}`);
      
      if (role.assigned_by_email) {
        console.log(`   Assigned by: ${role.assigned_by_email}`);
      }
      
      if (role.expires_at) {
        console.log(`   Expires: ${role.expires_at.toDateString()}`);
        if (role.days_until_expiry !== null) {
          console.log(`   Days remaining: ${role.days_until_expiry}`);
        }
      } else {
        console.log(`   Expires: Never (Permanent)`);
      }
      
      console.log('');
    });
    
    // Summary
    const activeRoles = rolesResult.rows.filter(r => r.status === 'Active' || r.status === 'Permanent').length;
    const expiredRoles = rolesResult.rows.filter(r => r.status === 'Expired').length;
    
    console.log(`📊 Summary: ${activeRoles} active role(s), ${expiredRoles} expired role(s)`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

async function listAllUsersWithRoles() {
  const client = await pool.connect();
  
  try {
    const result = await client.query(`
      SELECT 
        u.email,
        p.display_name,
        u.status as user_status,
        u.created_at,
        COUNT(ur.role_id) as role_count,
        ARRAY_AGG(
          DISTINCT r.display_name 
          ORDER BY r.display_name
        ) FILTER (WHERE r.name IS NOT NULL) as roles,
        ARRAY_AGG(
          DISTINCT CASE 
            WHEN ur.expires_at IS NULL THEN 'Permanent'
            WHEN ur.expires_at > NOW() THEN 'Active'
            ELSE 'Expired'
          END
        ) FILTER (WHERE ur.role_id IS NOT NULL) as role_statuses
      FROM users u
      LEFT JOIN profiles p ON u.id = p.user_id
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.deleted_at IS NULL
      GROUP BY u.id, u.email, p.display_name, u.status, u.created_at
      HAVING COUNT(ur.role_id) > 0
      ORDER BY u.created_at DESC
      LIMIT 50
    `);
    
    console.log('\n👥 Users with Roles (last 50):');
    console.log('===============================');
    
    if (result.rows.length === 0) {
      console.log('No users with roles found.');
      return;
    }
    
    result.rows.forEach((user, index) => {
      const roles = user.roles || [];
      const activeRoles = user.role_statuses ? user.role_statuses.filter(s => s === 'Active' || s === 'Permanent').length : 0;
      const expiredRoles = user.role_statuses ? user.role_statuses.filter(s => s === 'Expired').length : 0;
      
      console.log(`${index + 1}. ${user.email} (${user.display_name || 'No display name'})`);
      console.log(`   Status: ${user.user_status} | Created: ${user.created_at.toDateString()}`);
      console.log(`   Roles (${user.role_count}): ${roles.join(', ')}`);
      console.log(`   Active: ${activeRoles}, Expired: ${expiredRoles}`);
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
🔧 List User Roles Script
=========================

Usage:
  node scripts/list-user-roles.js <user_email>
  node scripts/list-user-roles.js --all

Examples:
  node scripts/list-user-roles.js user@example.com
  node scripts/list-user-roles.js admin@company.com

Options:
  --all              List all users who have roles assigned
  -h, --help         Show this help message

Description:
  Shows detailed information about roles assigned to a specific user including:
  - Role name and display name
  - Role description
  - Assignment date and who assigned it
  - Expiry date and remaining days
  - Status (Active, Expired, Permanent)
`);
    process.exit(0);
  }
  
  if (args[0] === '--all') {
    await listAllUsersWithRoles();
    process.exit(0);
  }
  
  if (args.length !== 1) {
    console.error('❌ Error: Please provide a user email');
    console.error('Usage: node scripts/list-user-roles.js <user_email>');
    process.exit(1);
  }
  
  const userEmail = args[0];
  await listUserRoles(userEmail);
  
  await pool.end();
}

main().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});