#!/usr/bin/env node

/**
 * CLI Script: Create Permission
 * Usage: node scripts/create-permission.js <resource> <action> [description]
 * Example: node scripts/create-permission.js polls create "Create new polls"
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

async function createPermission(resource, action, description = null) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const permissionName = `${resource}.${action}`;
    
    // Check if permission already exists
    const existingResult = await client.query(
      'SELECT id, name FROM permissions WHERE name = $1',
      [permissionName]
    );
    
    if (existingResult.rows.length > 0) {
      console.log(`✅ Permission '${permissionName}' already exists`);
      await client.query('COMMIT');
      return;
    }
    
    // Create permission
    const result = await client.query(
      'INSERT INTO permissions (name, resource, action, description) VALUES ($1, $2, $3, $4) RETURNING id',
      [permissionName, resource, action, description]
    );
    
    await client.query('COMMIT');
    console.log(`✅ Successfully created permission '${permissionName}'`);
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

async function listPermissions() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT 
        p.name,
        p.resource,
        p.action,
        p.description,
        p.created_at,
        COUNT(rp.role_id) as role_count,
        COUNT(up.user_id) as direct_user_count
      FROM permissions p
      LEFT JOIN role_permissions rp ON p.id = rp.permission_id
      LEFT JOIN user_permissions up ON p.id = up.permission_id AND up.granted = true
      GROUP BY p.id, p.name, p.resource, p.action, p.description, p.created_at
      ORDER BY p.resource, p.action
    `);
    
    console.log('\n🔐 All Permissions:');
    console.log('===================');
    
    let currentResource = '';
    result.rows.forEach(perm => {
      if (perm.resource !== currentResource) {
        if (currentResource !== '') console.log('');
        console.log(`📁 ${perm.resource.toUpperCase()}:`);
        currentResource = perm.resource;
      }
      
      console.log(`  • ${perm.name}`);
      console.log(`    Roles: ${perm.role_count} | Direct users: ${perm.direct_user_count}`);
      console.log(`    Created: ${perm.created_at.toDateString()}`);
      if (perm.description) {
        console.log(`    Description: ${perm.description}`);
      }
      console.log('');
    });
  } finally {
    client.release();
  }
}

async function createCommonPermissions() {
  const commonPermissions = [
    // User management
    { resource: 'users', action: 'view', description: 'View user profiles and information' },
    { resource: 'users', action: 'create', description: 'Create new user accounts' },
    { resource: 'users', action: 'update', description: 'Update user profiles and settings' },
    { resource: 'users', action: 'delete', description: 'Delete user accounts' },
    { resource: 'users', action: 'moderate', description: 'Moderate user accounts and content' },
    
    // Poll management
    { resource: 'polls', action: 'view', description: 'View polls and responses' },
    { resource: 'polls', action: 'create', description: 'Create new polls' },
    { resource: 'polls', action: 'update', description: 'Update own polls' },
    { resource: 'polls', action: 'delete', description: 'Delete own polls' },
    { resource: 'polls', action: 'moderate', description: 'Moderate any polls' },
    { resource: 'polls', action: 'respond', description: 'Respond to polls' },
    
    // Comments
    { resource: 'comments', action: 'view', description: 'View comments' },
    { resource: 'comments', action: 'create', description: 'Create comments' },
    { resource: 'comments', action: 'update', description: 'Update own comments' },
    { resource: 'comments', action: 'delete', description: 'Delete own comments' },
    { resource: 'comments', action: 'moderate', description: 'Moderate any comments' },
    
    // Analytics
    { resource: 'analytics', action: 'view', description: 'View analytics and statistics' },
    { resource: 'analytics', action: 'export', description: 'Export analytics data' },
    
    // Authoring
    { resource: 'authoring', action: 'create', description: 'Create content using wizards' },
    { resource: 'authoring', action: 'bulk_create', description: 'Create content in bulk' },
    
    // Context sources (stories)
    { resource: 'context_sources', action: 'view', description: 'View context sources' },
    { resource: 'context_sources', action: 'create', description: 'Create context sources' },
    { resource: 'context_sources', action: 'update', description: 'Update own context sources' },
    { resource: 'context_sources', action: 'delete', description: 'Delete own context sources' },
    { resource: 'context_sources', action: 'moderate', description: 'Moderate any context sources' },
    
    // System administration
    { resource: 'system', action: 'admin', description: 'Full system administration access' },
    { resource: 'system', action: 'config', description: 'Manage system configuration' },
    { resource: 'system', action: 'logs', description: 'View system logs' },
  ];
  
  console.log('🔧 Creating common permissions...\n');
  
  for (const perm of commonPermissions) {
    await createPermission(perm.resource, perm.action, perm.description);
  }
  
  console.log(`\n✅ Finished creating ${commonPermissions.length} common permissions`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
🔧 Create Permission Script
===========================

Usage:
  node scripts/create-permission.js <resource> <action> [description]
  node scripts/create-permission.js --list
  node scripts/create-permission.js --create-common

Examples:
  node scripts/create-permission.js polls create "Create new polls"
  node scripts/create-permission.js users moderate "Moderate user accounts"
  node scripts/create-permission.js analytics view "View analytics dashboard"

Options:
  --list             List all existing permissions
  --create-common    Create a set of common permissions
  -h, --help         Show this help message

Notes:
  - Permission name will be automatically generated as "resource.action"
  - resource should be lowercase (e.g., polls, users, comments)
  - action should be lowercase (e.g., create, view, update, delete)
  - description is optional but recommended
`);
    process.exit(0);
  }
  
  if (args[0] === '--list') {
    await listPermissions();
    process.exit(0);
  }
  
  if (args[0] === '--create-common') {
    await createCommonPermissions();
    process.exit(0);
  }
  
  if (args.length < 2) {
    console.error('❌ Error: Please provide resource and action');
    console.error('Usage: node scripts/create-permission.js <resource> <action> [description]');
    process.exit(1);
  }
  
  const [resource, action, description] = args;
  await createPermission(resource, action, description);
  
  await pool.end();
}

main().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});