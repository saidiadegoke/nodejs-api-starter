#!/usr/bin/env node

/**
 * CLI Script: Create a user through the API (POST /admin/users)
 *
 * Signs in as an admin, then creates the user with a profile and role, the same way the
 * admin screen does. The password is generated unless given, and printed once at the end
 * (the API sends no welcome email).
 *
 * Usage:
 *   node scripts/create-user.js --base-url <api url> --email <email> --role <role>
 *        --first-name <name> --last-name <name> [--phone <phone>] [--university-id <uuid>]
 *        [--password <password>]
 *
 * The admin signing in: REG_PORTAL_ADMIN_EMAIL / REG_PORTAL_ADMIN_PASSWORD, else prompted.
 *
 * Example:
 *   node scripts/create-user.js --base-url https://crp-api.jupeb.edu.ng \
 *     --email registrar@jupeb.edu.ng --role registrar --first-name JUPEB --last-name Registrar
 */

require('dotenv').config();
const crypto = require('crypto');
const readline = require('readline');

const argValue = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const ask = (question, { hidden = false } = {}) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (hidden) {
      rl._writeToOutput = (s) => rl.output.write(s.includes(question) ? s : '*');
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });

/** 14 characters with upper, lower, digit and symbol; no look-alikes (0/O, 1/l/I). */
const generatePassword = () => {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghjkmnpqrstuvwxyz', '23456789', '!@#$%*?'];
  const all = sets.join('');
  const pick = (chars) => chars[crypto.randomInt(chars.length)];
  const chars = [...sets.map(pick), ...Array.from({ length: 10 }, () => pick(all))];
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

const request = async (baseUrl, path, { method = 'GET', token, body } = {}) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { message: text.slice(0, 300) };
  }
  if (!res.ok) {
    const details = Array.isArray(json.details) ? ` (${json.details.map((d) => d.msg).join('; ')})` : '';
    throw new Error(`${method} ${path} → ${res.status}: ${json.message || res.statusText}${details}`);
  }
  return json;
};

async function main() {
  const baseUrl = (argValue('--base-url') || '').replace(/\/+$/, '');
  const email = (argValue('--email') || '').toLowerCase().trim();
  const role = argValue('--role');
  const firstName = argValue('--first-name');
  const lastName = argValue('--last-name');
  if (!baseUrl || !email || !role || !firstName || !lastName) {
    console.error(
      'Usage: node scripts/create-user.js --base-url <api url> --email <email> --role <role> ' +
        '--first-name <name> --last-name <name> [--phone <phone>] [--university-id <uuid>] [--password <password>]',
    );
    process.exit(1);
  }

  const adminEmail = process.env.REG_PORTAL_ADMIN_EMAIL || (await ask('Admin email: '));
  const adminPassword = process.env.REG_PORTAL_ADMIN_PASSWORD || (await ask('Admin password: ', { hidden: true }));

  const login = await request(baseUrl, '/auth/login', {
    method: 'POST',
    body: { identifier: adminEmail, password: adminPassword },
  });
  const token = login.access_token || login.data?.access_token || login.tokens?.access_token;
  if (!token) throw new Error('Signed in, but the response carried no access token');

  const password = argValue('--password') || generatePassword();
  const created = await request(baseUrl, '/admin/users', {
    method: 'POST',
    token,
    body: {
      email,
      password,
      first_name: firstName,
      last_name: lastName,
      role,
      ...(argValue('--phone') ? { phone: argValue('--phone') } : {}),
      ...(argValue('--university-id') ? { university_id: argValue('--university-id') } : {}),
    },
  });

  const user = created.user || created.data?.user || {};
  console.log(`✅ Created ${user.email || email} (${user.role || role}) on ${baseUrl}`);
  if (created.university?.name) console.log(`   University: ${created.university.name}`);
  console.log(`   Password: ${password}`);
  console.log('   Share it privately; the user should change it after signing in.');
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
