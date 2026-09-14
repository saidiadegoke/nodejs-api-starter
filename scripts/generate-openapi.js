const fs = require('fs');
const path = require('path');
const YAML = require('js-yaml');

const docsDir = path.join(__dirname, '../docs');
const rootDir = path.join(__dirname, '..');

// All modular swagger files
const swaggerFiles = fs
  .readdirSync(docsDir)
  .filter((file) => file.endsWith('-swagger.yaml') && !file.startsWith('openapi'));

console.log(`Found ${swaggerFiles.length} modular swagger files in docs/`);

const unified = {
  openapi: '3.0.3',
  info: {
    title: 'JUPEB Registration & Administration Portal API',
    version: '1.0.0',
    description: `
Complete OpenAPI 3.0 Specification for the JUPEB Registration Portal API.
Import directly into Postman, Insomnia, or Swagger UI.

### Modules Covered:
- **Auth & SSO**: Registration, login, verification, OAuth, RS256 token exchange
- **Users & RBAC**: User profiles, roles, and granular permissions
- **JUPEB Catalog**: Participating universities, courses, subject combinations
- **Academic Sessions**: Registration sessions, deadlines, quotas, fees
- **Identity & Biometrics**: NIN verification and verification gating
- **OCR Engine**: AI-assisted examination result extraction (WAEC/NECO/NABTEB)
- **Submissions**: Candidate document uploads, reviews, and status workflow
- **Candidate Registrations**: Application processing, candidate profiles, slips
- **Finance & Payments**: Invoicing, payment gateway verification, reconciliation
- **Academic Results**: Continuous assessment and exam result management
- **Observability & Admin**: Audit trails, system logs, error metrics, settings
- **Support Tickets**: Student ticket submissions, institution scoping, threads
- **Attendance & Timetable**: Student biometric tracking and schedules
- **CRMS**: Candidate result management and course transcripts
- **Files, Notifications, Webhooks, Assets, API Keys, Posts**
    `.trim(),
    contact: {
      name: 'JUPEB Technical Team',
      email: 'support@jupeb.edu.ng'
    }
  },
  servers: [
    {
      url: 'http://localhost:5000',
      description: 'Local Development Server'
    },
    {
      url: 'https://api.regportal.jupeb.edu.ng',
      description: 'Production Server'
    }
  ],
  tags: [],
  paths: {},
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT access token'
      },
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
        description: 'API key authentication'
      }
    },
    schemas: {},
    parameters: {},
    responses: {}
  }
};

const tagMap = new Map();

for (const file of swaggerFiles) {
  const filePath = path.join(docsDir, file);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const doc = YAML.load(raw);
    if (!doc) continue;

    // Collect tags from top level
    if (Array.isArray(doc.tags)) {
      for (const t of doc.tags) {
        if (!tagMap.has(t.name)) {
          tagMap.set(t.name, t);
        }
      }
    }

    // Merge paths
    if (doc.paths && typeof doc.paths === 'object') {
      for (const [rawPath, pathItem] of Object.entries(doc.paths)) {
        // Standardize path (ensure leading slash)
        const p = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
        if (!unified.paths[p]) {
          unified.paths[p] = {};
        }

        for (const [method, op] of Object.entries(pathItem)) {
          const m = method.toLowerCase();
          if (!['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(m)) {
            unified.paths[p][method] = op;
            continue;
          }

          // Ensure tags
          if (Array.isArray(op.tags)) {
            for (const tagName of op.tags) {
              if (!tagMap.has(tagName)) {
                tagMap.set(tagName, { name: tagName, description: `${tagName} endpoints` });
              }
            }
          } else {
            // Derive tag from module name if missing
            const fallbackTag = file.replace('-swagger.yaml', '').replace('jupeb-', 'JUPEB - ');
            op.tags = [fallbackTag];
            if (!tagMap.has(fallbackTag)) {
              tagMap.set(fallbackTag, { name: fallbackTag, description: `${fallbackTag} endpoints` });
            }
          }

          // Ensure summary
          if (!op.summary) {
            op.summary = `${m.toUpperCase()} ${p}`;
          }

          // Standardize BearerAuth security references
          if (Array.isArray(op.security)) {
            op.security = op.security.map((sec) => {
              const newSec = {};
              for (const k of Object.keys(sec)) {
                if (k.toLowerCase() === 'bearerauth') newSec['BearerAuth'] = sec[k];
                else if (k.toLowerCase() === 'apikeyauth') newSec['ApiKeyAuth'] = sec[k];
                else newSec[k] = sec[k];
              }
              return newSec;
            });
          }

          unified.paths[p][m] = op;
        }
      }
    }

    // Merge components
    if (doc.components) {
      if (doc.components.schemas) {
        Object.assign(unified.components.schemas, doc.components.schemas);
      }
      if (doc.components.parameters) {
        Object.assign(unified.components.parameters, doc.components.parameters);
      }
      if (doc.components.responses) {
        Object.assign(unified.components.responses, doc.components.responses);
      }
      if (doc.components.securitySchemes) {
        for (const [k, v] of Object.entries(doc.components.securitySchemes)) {
          const key =
            k.toLowerCase() === 'bearerauth'
              ? 'BearerAuth'
              : k.toLowerCase() === 'apikeyauth'
              ? 'ApiKeyAuth'
              : k;
          if (!unified.components.securitySchemes[key]) {
            unified.components.securitySchemes[key] = v;
          }
        }
      }
    }
  } catch (err) {
    console.error(`Error processing ${file}:`, err.message);
  }
}

// Sort tags alphabetically
unified.tags = Array.from(tagMap.values()).sort((a, b) => a.name.localeCompare(b.name));

// Sort paths alphabetically
const sortedPaths = {};
Object.keys(unified.paths)
  .sort()
  .forEach((key) => {
    sortedPaths[key] = unified.paths[key];
  });
unified.paths = sortedPaths;

// Count statistics
const totalPaths = Object.keys(unified.paths).length;
let totalOps = 0;
for (const p of Object.values(unified.paths)) {
  for (const m of Object.keys(p)) {
    if (['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(m.toLowerCase())) {
      totalOps++;
    }
  }
}

// Target output files
const docsJson = path.join(docsDir, 'openapi.json');
const docsYaml = path.join(docsDir, 'openapi.yaml');
const rootJson = path.join(rootDir, 'openapi.json');
const rootYaml = path.join(rootDir, 'openapi.yaml');

const jsonContent = JSON.stringify(unified, null, 2);
const yamlContent = YAML.dump(unified, { lineWidth: -1, noRefs: true });

fs.writeFileSync(docsJson, jsonContent, 'utf8');
fs.writeFileSync(docsYaml, yamlContent, 'utf8');
fs.writeFileSync(rootJson, jsonContent, 'utf8');
fs.writeFileSync(rootYaml, yamlContent, 'utf8');

console.log('\n=========================================');
console.log('✅ OpenAPI Specification Generated Successfully');
console.log(`- Total Paths (Endpoints): ${totalPaths}`);
console.log(`- Total HTTP Operations:    ${totalOps}`);
console.log(`- Total Tags (Categories):  ${unified.tags.length}`);
console.log('=========================================');
console.log('Generated Files for Postman Import:');
console.log(`1. ${docsJson}`);
console.log(`2. ${docsYaml}`);
console.log(`3. ${rootJson} (workspace root for easy import)`);
console.log(`4. ${rootYaml}`);
