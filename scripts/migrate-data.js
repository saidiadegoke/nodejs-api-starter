#!/usr/bin/env node

/**
 * SmartStore Data Migration Script
 *
 * Copies selected data from a source DB to a destination DB:
 * - users (and profiles)
 * - certification info (ssl_certificates, ssl_certificate_domains; custom_domains for links)
 * - sites (and site_templates, custom_domains)
 * - early_adopters
 * - templates
 *
 * Idempotent: safe to run multiple times; uses ON CONFLICT / upserts where applicable.
 *
 * DB config: edit SOURCE_DB_CONFIG and DEST_DB_CONFIG in this file (no .env required).
 * Env vars SOURCE_DB_* / DEST_DB_* override when set.
 *
 * Run: node scripts/migrate-data.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Source DB connection config (edit values in script; no .env required)
const SOURCE_DB_CONFIG = {
  host: '72.62.180.222',
  port: 5437,
  user: 'postgres',
  password: 'AUy8uAxVqdPWB6Ry',
  database: 'smartstore_db',
};

// Destination DB connection config (edit values in script; no .env required)
const DEST_DB_CONFIG = {
  host: 'postgresql-162324-0.cloudclusters.net',
  port: 19992,
  user: 'smartdbadmin',
  password: 'f)!Dn2KdWYex@E$',
  database: 'smartstore_db',
};
// const DEST_DB_CONFIG = {
//   host: 'localhost',
//   port: 5437,
//   user: 'postgres',
//   password: 'postgres',
//   database: 'smartstore_db',
// };

const args = process.argv.slice(2);

function getSourceConfig() {
  return {
    host: process.env.SOURCE_DB_HOST || SOURCE_DB_CONFIG.host,
    port: parseInt(process.env.SOURCE_DB_PORT || String(SOURCE_DB_CONFIG.port), 10),
    user: process.env.SOURCE_DB_USER || SOURCE_DB_CONFIG.user,
    password: process.env.SOURCE_DB_PASSWORD ?? SOURCE_DB_CONFIG.password,
    database: process.env.SOURCE_DB_NAME || SOURCE_DB_CONFIG.database,
  };
}

function getDestConfig() {
  return {
    host: process.env.DEST_DB_HOST || DEST_DB_CONFIG.host,
    port: parseInt(process.env.DEST_DB_PORT || String(DEST_DB_CONFIG.port), 10),
    user: process.env.DEST_DB_USER || DEST_DB_CONFIG.user,
    password: process.env.DEST_DB_PASSWORD ?? DEST_DB_CONFIG.password,
    database: process.env.DEST_DB_NAME || DEST_DB_CONFIG.database,
  };
}

function validateConfig(name, config) {
  if (!config.host || !config.user || !config.database) {
    console.error(`❌ ${name} DB config incomplete. Set ${name}_DB_HOST, ${name}_DB_USER, ${name}_DB_NAME (and optionally PORT, PASSWORD).`);
    process.exit(1);
  }
}

async function migrateUsers(source, dest) {
  const userIdMap = new Map(); // source user id -> dest user id (same or existing dest id when skipped)
  const client = await dest.connect();
  try {
    const res = await source.query(
      `SELECT id, email, phone, email_verified, phone_verified, password_hash, status, last_login_at, created_at, updated_at, deleted_at
       FROM users WHERE deleted_at IS NULL`
    );
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    for (const row of res.rows) {
      try {
        const r = await client.query(
          `INSERT INTO users (id, email, phone, email_verified, phone_verified, password_hash, status, last_login_at, created_at, updated_at, deleted_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO UPDATE SET
             email = EXCLUDED.email,
             phone = EXCLUDED.phone,
             email_verified = EXCLUDED.email_verified,
             phone_verified = EXCLUDED.phone_verified,
             password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
             status = EXCLUDED.status,
             last_login_at = EXCLUDED.last_login_at,
             updated_at = EXCLUDED.updated_at`,
          [
            row.id,
            row.email,
            row.phone,
            row.email_verified,
            row.phone_verified,
            row.password_hash,
            row.status,
            row.last_login_at,
            row.created_at,
            row.updated_at,
            row.deleted_at,
          ]
        );
        userIdMap.set(row.id, row.id);
        if (r.rowCount === 1) inserted++;
        else updated++;
      } catch (err) {
        if (err.code === '23505' && (err.constraint === 'users_email_key' || err.constraint === 'users_phone_key')) {
          skipped++;
          const ident = row.email || row.phone || row.id;
          console.warn(`   [skip] user already exists (${err.constraint}): ${ident}`);
          const byEmail = row.email ? await client.query('SELECT id FROM users WHERE email = $1', [row.email]) : { rows: [] };
          const byPhone = row.phone && byEmail.rows.length === 0 ? await client.query('SELECT id FROM users WHERE phone = $1', [row.phone]) : { rows: [] };
          const existing = byEmail.rows[0] || byPhone.rows[0];
          if (existing) userIdMap.set(row.id, existing.id);
        } else {
          throw err;
        }
      }
    }
    console.log(`   users: ${res.rows.length} rows (${inserted} inserted, ${updated} updated, ${skipped} skipped → use existing dest id in refs)`);
    return userIdMap;
  } finally {
    client.release();
  }
}

async function migrateProfiles(source, dest, userIdMap) {
  const client = await dest.connect();
  try {
    const res = await source.query(
      `SELECT p.id, p.user_id, p.first_name, p.last_name, p.display_name, p.bio, p.profile_photo_url,
              p.date_of_birth, p.gender, p.preferred_language, p.timezone,
              p.rating_average, p.rating_count, p.total_orders, p.completed_orders, p.created_at, p.updated_at
       FROM profiles p
       JOIN users u ON u.id = p.user_id AND u.deleted_at IS NULL`
    );
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    for (const row of res.rows) {
      const destUserId = userIdMap.get(row.user_id) ?? row.user_id;
      if (!destUserId) {
        skipped++;
        continue;
      }
      const r = await client.query(
        `INSERT INTO profiles (id, user_id, first_name, last_name, display_name, bio, profile_photo_url,
          date_of_birth, gender, preferred_language, timezone, rating_average, rating_count, total_orders, completed_orders, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         ON CONFLICT (user_id) DO UPDATE SET
           first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           display_name = EXCLUDED.display_name,
           bio = EXCLUDED.bio,
           profile_photo_url = EXCLUDED.profile_photo_url,
           date_of_birth = EXCLUDED.date_of_birth,
           gender = EXCLUDED.gender,
           preferred_language = EXCLUDED.preferred_language,
           timezone = EXCLUDED.timezone,
           rating_average = EXCLUDED.rating_average,
           rating_count = EXCLUDED.rating_count,
           total_orders = EXCLUDED.total_orders,
           completed_orders = EXCLUDED.completed_orders,
           updated_at = EXCLUDED.updated_at`,
        [
          row.id,
          destUserId,
          row.first_name,
          row.last_name,
          row.display_name,
          row.bio,
          row.profile_photo_url,
          row.date_of_birth,
          row.gender,
          row.preferred_language,
          row.timezone,
          row.rating_average,
          row.rating_count,
          row.total_orders,
          row.completed_orders,
          row.created_at,
          row.updated_at,
        ]
      );
      if (r.rowCount === 1) inserted++;
      else updated++;
    }
    console.log(`   profiles: ${res.rows.length} rows (${inserted} inserted, ${updated} updated, ${skipped} skipped no dest user)`);
  } finally {
    client.release();
  }
}

async function migrateSites(source, dest, userIdMap) {
  const siteIdMap = {}; // source id -> dest id
  const client = await dest.connect();
  try {
    const res = await source.query(
      `SELECT id, slug, name, primary_domain, engine_version, status, owner_id, created_at, updated_at FROM sites`
    );
    let skipped = 0;
    for (const row of res.rows) {
      const destOwnerId = userIdMap.get(row.owner_id) ?? row.owner_id;
      if (!destOwnerId) {
        skipped++;
        continue;
      }
      const r = await client.query(
        `INSERT INTO sites (slug, name, primary_domain, engine_version, status, owner_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name,
           primary_domain = EXCLUDED.primary_domain,
           engine_version = EXCLUDED.engine_version,
           status = EXCLUDED.status,
           owner_id = EXCLUDED.owner_id,
           updated_at = EXCLUDED.updated_at
         RETURNING id`,
        [
          row.slug,
          row.name,
          row.primary_domain,
          row.engine_version,
          row.status,
          destOwnerId,
          row.created_at,
          row.updated_at,
        ]
      );
      siteIdMap[row.id] = r.rows[0].id;
    }
    console.log(`   sites: ${res.rows.length} rows, id mapping built (${skipped} skipped no dest owner)`);
    return siteIdMap;
  } finally {
    client.release();
  }
}

async function migrateCustomDomains(source, dest, siteIdMap) {
  const customDomainIdMap = {}; // source id -> dest id
  const client = await dest.connect();
  try {
    const res = await source.query(
      `SELECT id, site_id, domain, verified, verification_token, ssl_status, ssl_provider, created_at, updated_at, certificate_id
       FROM custom_domains`
    );
    let count = 0;
    for (const row of res.rows) {
      const destSiteId = siteIdMap[row.site_id];
      if (destSiteId == null) continue;
      const r = await client.query(
        `INSERT INTO custom_domains (site_id, domain, verified, verification_token, ssl_status, ssl_provider, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (domain) DO UPDATE SET
           site_id = EXCLUDED.site_id,
           verified = EXCLUDED.verified,
           verification_token = EXCLUDED.verification_token,
           ssl_status = EXCLUDED.ssl_status,
           ssl_provider = EXCLUDED.ssl_provider,
           updated_at = EXCLUDED.updated_at
         RETURNING id`,
        [
          destSiteId,
          row.domain,
          row.verified,
          row.verification_token,
          row.ssl_status,
          row.ssl_provider,
          row.created_at,
          row.updated_at,
        ]
      );
      customDomainIdMap[row.id] = r.rows[0].id;
      count++;
    }
    console.log(`   custom_domains: ${count} rows (certificate_id updated in next steps)`);
    return customDomainIdMap;
  } finally {
    client.release();
  }
}

async function migrateTemplates(source, dest, userIdMap) {
  const templateIdMap = {}; // source id -> dest id
  const client = await dest.connect();
  try {
    const res = await source.query(
      `SELECT id, name, description, category, preview_image_url, thumbnail_url, config, is_premium, is_active, created_at, updated_at, created_by
       FROM templates`
    );
    for (const row of res.rows) {
      const destCreatedBy = row.created_by != null ? (userIdMap.get(row.created_by) ?? row.created_by) : null;
      const existing = await client.query(
        'SELECT id FROM templates WHERE name = $1 AND (category IS NOT DISTINCT FROM $2) LIMIT 1',
        [row.name, row.category]
      );
      let destId;
      if (existing.rows.length) {
        destId = existing.rows[0].id;
        await client.query(
          `UPDATE templates SET description = $1, preview_image_url = $2, thumbnail_url = $3, config = $4, is_premium = $5, is_active = $6, updated_at = $7, created_by = $8 WHERE id = $9`,
          [
            row.description,
            row.preview_image_url,
            row.thumbnail_url,
            JSON.stringify(row.config),
            row.is_premium,
            row.is_active,
            row.updated_at,
            destCreatedBy,
            destId,
          ]
        );
      } else {
        const ins = await client.query(
          `INSERT INTO templates (name, description, category, preview_image_url, thumbnail_url, config, is_premium, is_active, created_at, updated_at, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING id`,
          [
            row.name,
            row.description,
            row.category,
            row.preview_image_url,
            row.thumbnail_url,
            row.config,
            row.is_premium,
            row.is_active,
            row.created_at,
            row.updated_at,
            destCreatedBy,
          ]
        );
        destId = ins.rows[0].id;
      }
      templateIdMap[row.id] = destId;
    }
    console.log(`   templates: ${res.rows.length} rows, id mapping built`);
    return templateIdMap;
  } finally {
    client.release();
  }
}

async function migrateSiteTemplates(source, dest, siteIdMap, templateIdMap) {
  const client = await dest.connect();
  try {
    const res = await source.query(
      `SELECT site_id, template_id, customization_settings, applied_at FROM site_templates`
    );
    let count = 0;
    for (const row of res.rows) {
      const destSiteId = siteIdMap[row.site_id];
      const destTemplateId = templateIdMap[row.template_id];
      if (destSiteId == null || destTemplateId == null) continue;
      await client.query(
        `INSERT INTO site_templates (site_id, template_id, customization_settings, applied_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (site_id) DO UPDATE SET template_id = EXCLUDED.template_id, customization_settings = EXCLUDED.customization_settings, applied_at = EXCLUDED.applied_at`,
        [destSiteId, destTemplateId, row.customization_settings ? JSON.stringify(row.customization_settings) : null, row.applied_at]
      );
      count++;
    }
    console.log(`   site_templates: ${count} rows`);
  } finally {
    client.release();
  }
}

async function migrateEarlyAdopters(source, dest) {
  const client = await dest.connect();
  try {
    const res = await source.query(
      `SELECT name, email, business_name, ip_address, user_agent, status, notes, contacted_at, created_at, updated_at FROM early_adopters`
    );
    let inserted = 0;
    let updated = 0;
    for (const row of res.rows) {
      const r = await client.query(
        `INSERT INTO early_adopters (name, email, business_name, ip_address, user_agent, status, notes, contacted_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (email) DO UPDATE SET
           name = EXCLUDED.name,
           business_name = EXCLUDED.business_name,
           ip_address = EXCLUDED.ip_address,
           user_agent = EXCLUDED.user_agent,
           status = EXCLUDED.status,
           notes = EXCLUDED.notes,
           contacted_at = EXCLUDED.contacted_at,
           updated_at = EXCLUDED.updated_at`,
        [
          row.name,
          row.email,
          row.business_name,
          row.ip_address,
          row.user_agent,
          row.status,
          row.notes,
          row.contacted_at,
          row.created_at,
          row.updated_at,
        ]
      );
      if (r.rowCount === 1) inserted++;
      else updated++;
    }
    console.log(`   early_adopters: ${res.rows.length} rows (${inserted} inserted, ${updated} updated)`);
  } finally {
    client.release();
  }
}

async function migrateSslCertificates(source, dest) {
  const certIdMap = {}; // source id -> dest id
  const client = await dest.connect();
  try {
    const res = await source.query(
      `SELECT id, certificate_name, cloudflare_cert_id, cert_path, key_path, domains_count, max_domains, status, certificate_type, created_at, updated_at, expires_at, notes, provider
       FROM ssl_certificates`
    );
    for (const row of res.rows) {
      const existing = await client.query(
        'SELECT id FROM ssl_certificates WHERE certificate_name = $1 LIMIT 1',
        [row.certificate_name]
      );
      let destId;
      if (existing.rows.length) {
        destId = existing.rows[0].id;
        await client.query(
          `UPDATE ssl_certificates SET cloudflare_cert_id = $1, cert_path = $2, key_path = $3, domains_count = $4, max_domains = $5, status = $6, certificate_type = $7, updated_at = $8, expires_at = $9, notes = $10, provider = $11 WHERE id = $12`,
          [
            row.cloudflare_cert_id,
            row.cert_path,
            row.key_path,
            row.domains_count,
            row.max_domains,
            row.status,
            row.certificate_type,
            row.updated_at,
            row.expires_at,
            row.notes,
            row.provider || 'cloudflare',
            destId,
          ]
        );
      } else {
        const ins = await client.query(
          `INSERT INTO ssl_certificates (certificate_name, cloudflare_cert_id, cert_path, key_path, domains_count, max_domains, status, certificate_type, created_at, updated_at, expires_at, notes, provider)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           RETURNING id`,
          [
            row.certificate_name,
            row.cloudflare_cert_id,
            row.cert_path,
            row.key_path,
            row.domains_count,
            row.max_domains,
            row.status,
            row.certificate_type,
            row.created_at,
            row.updated_at,
            row.expires_at,
            row.notes,
            row.provider || 'cloudflare',
          ]
        );
        destId = ins.rows[0].id;
      }
      certIdMap[row.id] = destId;
    }
    console.log(`   ssl_certificates: ${res.rows.length} rows, id mapping built`);
    return certIdMap;
  } finally {
    client.release();
  }
}

async function migrateSslCertificateDomains(source, dest, certIdMap, customDomainIdMap) {
  const client = await dest.connect();
  try {
    const res = await source.query(
      `SELECT certificate_id, custom_domain_id, domain, assigned_at FROM ssl_certificate_domains`
    );
    let count = 0;
    for (const row of res.rows) {
      const destCertId = certIdMap[row.certificate_id];
      const destCustomDomainId = row.custom_domain_id != null ? customDomainIdMap[row.custom_domain_id] : null;
      if (destCertId == null) continue;
      await client.query(
        `INSERT INTO ssl_certificate_domains (certificate_id, custom_domain_id, domain, assigned_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (domain) DO UPDATE SET certificate_id = EXCLUDED.certificate_id, custom_domain_id = EXCLUDED.custom_domain_id, assigned_at = EXCLUDED.assigned_at`,
        [destCertId, destCustomDomainId, row.domain, row.assigned_at]
      );
      count++;
    }
    console.log(`   ssl_certificate_domains: ${count} rows`);
  } finally {
    client.release();
  }
}

async function updateCustomDomainsCertificateId(source, dest, siteIdMap, certIdMap) {
  const client = await dest.connect();
  try {
    const res = await source.query(
      `SELECT cd.id, cd.domain, cd.certificate_id FROM custom_domains cd WHERE cd.certificate_id IS NOT NULL`
    );
    let count = 0;
    for (const row of res.rows) {
      const destCertId = certIdMap[row.certificate_id];
      if (destCertId == null) continue;
      await client.query(
        `UPDATE custom_domains SET certificate_id = $1 WHERE domain = $2`,
        [destCertId, row.domain]
      );
      count++;
    }
    console.log(`   custom_domains (certificate_id): ${count} rows updated`);
  } finally {
    client.release();
  }
}

async function main() {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
SmartStore Data Migration (idempotent)
======================================

Copies: users, profiles, sites, custom_domains, templates, site_templates, early_adopters, ssl_certificates, ssl_certificate_domains.

Config: Edit SOURCE_DB_CONFIG and DEST_DB_CONFIG at the top of this script (no .env file).
Optional override via env: SOURCE_DB_HOST, SOURCE_DB_PORT, SOURCE_DB_USER, SOURCE_DB_PASSWORD, SOURCE_DB_NAME (same for DEST_DB_*).

Usage:
  node scripts/migrate-data.js
`);
    process.exit(0);
  }

  const sourceConfig = getSourceConfig();
  const destConfig = getDestConfig();
  validateConfig('SOURCE', sourceConfig);
  validateConfig('DEST', destConfig);

  const sourcePool = new Pool(sourceConfig);
  const destPool = new Pool(destConfig);

  try {
    await sourcePool.query('SELECT 1');
    await destPool.query('SELECT 1');
  } catch (e) {
    console.error('❌ DB connection failed:', e.message);
    process.exit(1);
  }

  console.log('Starting migration (idempotent)...\n');

  try {
    const userIdMap = await migrateUsers(sourcePool, destPool);
    await migrateProfiles(sourcePool, destPool, userIdMap);
    const siteIdMap = await migrateSites(sourcePool, destPool, userIdMap);
    const customDomainIdMap = await migrateCustomDomains(sourcePool, destPool, siteIdMap);
    const templateIdMap = await migrateTemplates(sourcePool, destPool, userIdMap);
    await migrateSiteTemplates(sourcePool, destPool, siteIdMap, templateIdMap);
    await migrateEarlyAdopters(sourcePool, destPool);
    const certIdMap = await migrateSslCertificates(sourcePool, destPool);
    await migrateSslCertificateDomains(sourcePool, destPool, certIdMap, customDomainIdMap);
    await updateCustomDomainsCertificateId(sourcePool, destPool, siteIdMap, certIdMap);

    console.log('\n✅ Migration completed.');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await sourcePool.end();
    await destPool.end();
  }
}

main();
