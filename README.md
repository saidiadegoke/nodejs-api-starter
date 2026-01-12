# SmartStore Backend API

A scalable Node.js + Express + PostgreSQL backend API for the SmartStore platform, providing site management, template system, component registry, SSL certificate management, and custom domain support.

## 🚀 Quick Start

### Prerequisites

- Node.js (v16 or higher)
- PostgreSQL (v13 or higher)
- npm or pnpm
- Redis (optional, for caching)

### Installation

1. Clone the repository and navigate to the API directory:
```bash
cd smartstore-api
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

4. Update the `.env` file with your configuration (see [Environment Variables](#-environment-variables)).

5. Create the database:
```bash
createdb smartstore_db
```

6. Run migrations:
```bash
npm run migrate
```

7. Seed the database (optional):
```bash
npm run seed
```

8. Start the development server:
```bash
npm run dev
```

The API will be available at `http://localhost:4050/api` (or your configured `API_PORT`)

## 📁 Project Structure

```
smartstore-api/
├── src/
│   ├── app.js                 # Express app configuration
│   ├── server.js              # Server entry point
│   │
│   ├── config/                # Configuration files
│   │   ├── db.config.js       # Database configuration
│   │   └── env.config.js      # Environment configuration
│   │
│   ├── db/                    # Database layer
│   │   ├── migrations/        # SQL migration files
│   │   ├── seeds/             # SQL seed files (RBAC, users)
│   │   ├── migrate.js         # Migration runner
│   │   ├── seed.js            # Seed runner
│   │   └── pool.js            # PostgreSQL connection pool
│   │
│   ├── modules/               # Feature modules
│   │   ├── auth/              # Authentication & authorization
│   │   ├── users/             # User management
│   │   ├── sites/             # Site management, templates, components
│   │   │   ├── services/      # SSL, Nginx, certificates, deployment
│   │   │   ├── controllers/   # Site, template, component controllers
│   │   │   └── routes/        # Site routes
│   │   ├── orders/            # Order management
│   │   ├── files/             # File uploads
│   │   ├── notifications/     # Notification system
│   │   └── analytics/         # Analytics
│   │
│   ├── shared/                # Shared utilities
│   │   ├── middleware/        # Express middleware (auth, RBAC)
│   │   ├── utils/             # Utility functions
│   │   ├── constants/         # Constants and enums
│   │   └── validations/       # Validation helpers
│   │
│   ├── routes/                # Global route configuration
│   │   └── index.js           # Route aggregator
│   │
│   ├── utils/                 # Application utilities
│   │   └── default-pages/     # Default page templates (JSON)
│   │
│   └── tests/                 # Test files
│
├── nginx/                     # Nginx configuration files
├── docker-compose.yml         # Docker Compose configuration
├── Dockerfile                 # Docker image definition
├── .env.example               # Environment variables template
├── package.json               # Dependencies and scripts
└── README.md                  # This file
```

## 🗄️ Database Schema

The application uses PostgreSQL with UUID primary keys:

### Core Tables
- **users** - Authentication data (email, phone, password)
- **profiles** - User profile information
- **roles** - System roles (user, admin)
- **permissions** - System permissions
- **user_roles** - Many-to-many relationship between users and roles
- **role_permissions** - Many-to-many relationship between roles and permissions

### Site Management Tables
- **sites** - Site instances with templates and configurations
- **templates** - Reusable site templates
- **component_registry** - System and custom component definitions
- **custom_domains** - Custom domain configurations
- **ssl_certificates** - SSL certificate management
- **ssl_certificate_domains** - Certificate-domain mappings
- **deployment_history** - Site deployment tracking

### Authentication Tables
- **social_accounts** - OAuth provider accounts
- **user_sessions** - Active user sessions
- **password_resets** - Password reset tokens
- **verification_tokens** - Email/phone verification tokens

### Order Management Tables
- **orders** - Core order data
- **order_items** - Shopping items breakdown

### File Management
- **files** - Centralized file metadata storage

## 🔐 Authentication & Authorization

The API implements a comprehensive RBAC (Role-Based Access Control) system:

- **Multiple roles per user**: Users can have multiple roles simultaneously
- **Permission inheritance**: Users inherit permissions from their roles
- **Default role assignment**: All new users automatically get the "user" role
- **Admin access**: Admin role grants full system access

### Default Roles

- **user**: Regular users with site management capabilities
- **admin**: Full system access and administration

### Permissions

Key permission resources:
- `sites.*` - Site management
- `templates.*` - Template management
- `products.*` - Product management
- `orders.*` - Order management
- `customers.*` - Customer management
- `certificates.*` - SSL certificate management (admin only)
- `deployments.*` - Deployment management

## 🌐 Key Features

### Site Management
- Create and manage sites
- Apply templates to sites
- Site activation/deactivation
- Site status tracking

### Template System
- Create reusable site templates
- Default page templates (Home, About, Contact, Services, Store)
- Template preview
- Template-based site creation

### Component Registry
- System components (breadcrumbs, CTA, features, etc.)
- Custom component registration
- Component schema validation
- Component configuration management

### Custom Domains & SSL
- Custom domain verification (DNS TXT records)
- Automatic SSL certificate provisioning via Cloudflare API
- Multi-domain certificate management (up to 50 domains per certificate)
- Base origin certificate for `smartstore.ng` and `*.smartstore.ng`
- Let's Encrypt fallback support
- Automatic certificate assignment and creation

### Nginx Integration
- Automatic Nginx configuration generation for custom domains
- Nginx reload support (Docker and host nginx)
- SSL certificate path management
- Custom domain routing

### Deployment
- Site activation workflow
- Deployment history tracking
- Subdomain support (`*.smartstore.ng`)
- Custom domain support

## 📝 API Scripts

```bash
# Development
npm run dev                    # Start development server with nodemon
npm start                      # Start production server

# Database
npm run migrate                # Run all pending migrations
npm run seed                   # Seed database with initial data

# Component Management
npm run update:component-schemas  # Update component schemas in database

# Testing
npm test                       # Run all tests with coverage
npm run test:auth              # Run authentication tests only
npm run test:rbac              # Run RBAC tests only
npm run test:orders            # Run order tests only
npm run test:templates         # Run template tests only
npm run test:watch             # Run tests in watch mode
npm run test:cleanup           # Clean up test database

# RBAC Management
npm run rbac                   # RBAC management CLI
npm run rbac:setup             # Setup common roles and permissions
npm run rbac:create-role       # Create a new role
npm run rbac:create-permission # Create a new permission
npm run rbac:add-permission-to-role  # Add permission to role
npm run rbac:add-role-to-user  # Add role to user
npm run rbac:list-user-roles  # List roles for a user
npm run rbac:list-role-permissions  # List permissions for a role
```

## 🛣️ API Endpoints

### Health Check
- `GET /api/health` - Check API status
- `GET /api` - API version information

### Authentication
- `POST /api/auth/register` - Register new user (auto-assigns "user" role)
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh-token` - Refresh access token
- `POST /api/auth/logout` - Logout user
- `POST /api/auth/verify-phone` - Verify phone with OTP
- `POST /api/auth/resend-otp` - Resend OTP
- `POST /api/auth/forgot-password` - Initiate password reset
- `POST /api/auth/reset-password` - Reset password with code
- `POST /api/auth/change-password` - Change password (authenticated)

### Sites
- `GET /api/sites` - List user's sites
- `POST /api/sites` - Create new site
- `GET /api/sites/:id` - Get site details
- `PUT /api/sites/:id` - Update site
- `DELETE /api/sites/:id` - Delete site
- `POST /api/sites/:id/activate` - Activate site
- `POST /api/sites/:id/deactivate` - Deactivate site
- `GET /api/sites/:id/preview` - Preview site configuration

### Templates
- `GET /api/templates` - List templates
- `POST /api/templates` - Create template
- `GET /api/templates/:id` - Get template details
- `PUT /api/templates/:id` - Update template
- `DELETE /api/templates/:id` - Delete template
- `POST /api/templates/:id/preview` - Preview template
- `POST /api/templates/:id/default-pages` - Create default pages for template

### Components
- `GET /api/components` - List registered components
- `POST /api/components` - Register new component
- `GET /api/components/:id` - Get component details
- `PUT /api/components/:id` - Update component
- `DELETE /api/components/:id` - Delete component
- `GET /api/components/:id/preview` - Preview component

### Custom Domains (Admin)
- `GET /api/sites/:siteId/domains` - List custom domains for site
- `POST /api/sites/:siteId/domains` - Add custom domain
- `DELETE /api/sites/:siteId/domains/:domainId` - Remove custom domain
- `POST /api/sites/:siteId/domains/:domainId/verify` - Verify domain ownership

### SSL Certificates (Admin)
- `GET /api/admin/certificates` - List all certificates
- `GET /api/admin/certificates/:id` - Get certificate details
- `POST /api/admin/certificates` - Create new certificate
- `POST /api/admin/certificates/:id/domains` - Assign domain to certificate
- `DELETE /api/admin/certificates/:id/domains` - Remove domain from certificate
- `DELETE /api/admin/certificates/:id` - Delete certificate
- `GET /api/admin/certificates/base-origin` - Get base origin certificate
- `POST /api/admin/certificates/base-origin` - Create base origin certificate

### Users
- `GET /api/users/me` - Get current user profile
- `PUT /api/users/me` - Update current user profile

### Orders
- `POST /api/orders` - Create new order
- `GET /api/orders` - List user's orders
- `GET /api/orders/:id` - Get order details

### Files
- `POST /api/files/upload` - Upload single file
- `GET /api/files/:file_id` - Get file details
- `DELETE /api/files/:file_id` - Delete file

## 🔧 Environment Variables

Key environment variables (see `.env.example` for complete list):

### Server Configuration
- `PORT` or `API_PORT` - Server port (default: 4050)
- `NODE_ENV` - Environment (development/production/test)
- `BASE_URL` - Base API URL

### Database
- `DB_HOST` - PostgreSQL host
- `DB_PORT` - PostgreSQL port
- `DB_NAME` - Database name
- `DB_USER` - Database user
- `DB_PASSWORD` - Database password

### Authentication
- `JWT_SECRET` - JWT signing secret
- `JWT_ACCESS_EXPIRY` - Access token expiry (default: 1h)
- `JWT_REFRESH_EXPIRY` - Refresh token expiry (default: 7d)

### CORS
- `CORS_ORIGIN` - Allowed CORS origins (comma-separated)

### Cloudflare SSL
- `CLOUDFLARE_API_TOKEN` - Cloudflare API token
- `CLOUDFLARE_ZONE_ID` - Cloudflare zone ID
- `CLOUDFLARE_USE_ORIGIN_CERT` - Use Cloudflare Origin Certificates (default: true)
- `CLOUDFLARE_ORIGIN_CERT_PATH` - Path to base origin certificate
- `CLOUDFLARE_ORIGIN_KEY_PATH` - Path to base origin certificate key
- `ALLOW_LETSENCRYPT_FALLBACK` - Allow Let's Encrypt as fallback (default: false)

### Nginx Integration
- `NGINX_SITES_ENABLED` - Path to nginx sites-enabled directory
- `NGINX_CONFIG_PATH` - Path to nginx config file
- `NGINX_USE_DOCKER` - Use Docker nginx (default: true)
- `NGINX_USE_SYSTEMCTL` - Use systemctl for nginx reload (default: false)
- `NGINX_CONTAINER_NAME` - Docker nginx container name (default: smartstore-nginx)

### SSL Certificate Paths
- `SSL_CERT_PATH` - SSL certificate storage path
- `SSL_KEY_PATH` - SSL private key storage path

### App Service Configuration
- `APP_HOST` - App service host (default: localhost)
- `APP_PORT` - App service port (default: 4060)

### Base Domain
- `BASE_DOMAIN` - Base domain for sites (default: smartstore.ng)

## 🐳 Docker Deployment

### Using Docker Compose

1. Create `.env` file with your configuration
2. Build and start services:
```bash
docker-compose up -d
```

3. Run migrations:
```bash
docker-compose exec api npm run migrate
```

4. Seed database (optional):
```bash
docker-compose exec api npm run seed
```

### Docker Configuration

The API service is configured to:
- Run on port 4050 (configurable via `API_PORT`)
- Connect to external PostgreSQL database
- Support health checks
- Auto-restart on failure

See `docker-compose.yml` and `Dockerfile` for details.

## 🔒 SSL Certificate Management

The API provides automatic SSL certificate management:

### Cloudflare Origin Certificates (Primary)
- Automatic certificate creation via Cloudflare API
- Multi-domain certificates (up to 50 domains per certificate)
- Base origin certificate for `smartstore.ng` and `*.smartstore.ng`
- Automatic certificate assignment when adding custom domains
- Automatic new certificate creation when all certificates are full

### Let's Encrypt (Fallback)
- Available as fallback option
- Rate-limited, suitable for backup only

### Certificate Storage
- Certificates stored in `/etc/ssl/smartstore/certs/`
- Private keys stored in `/etc/ssl/smartstore/keys/`
- Database tracks certificate assignments and usage

See `CLOUDFLARE_ORIGIN_CERTIFICATE_SETUP.md` and `MULTI_DOMAIN_CERTIFICATE_GUIDE.md` for detailed setup instructions.

## 🌍 Nginx Integration

The API automatically generates Nginx configurations for custom domains:

- Configs written to `/etc/nginx/sites-enabled/custom-domains/`
- Automatic Nginx reload after config changes
- Supports both Docker nginx and host nginx
- SSL certificate path management

### Nginx Service Configuration

Set environment variables to control Nginx behavior:
- `NGINX_USE_DOCKER=true` - Use Docker nginx (default)
- `NGINX_USE_SYSTEMCTL=true` - Use systemctl for host nginx
- `APP_HOST=localhost` - App service host (for same-server deployment)

See `nginx/DEPLOYMENT_SCENARIOS.md` for deployment scenarios.

## 📊 Logging

The application uses structured logging with different levels:
- **debug**: Development debugging
- **info**: Normal operations
- **warn**: Warning conditions
- **error**: Error conditions
- **critical**: Critical failures

Logs include request IDs for tracing requests across the system.

## 🧪 Testing

Tests are located in the `src/tests/` directory. Run tests with:

```bash
npm test
```

Test coverage includes:
- Authentication and authorization
- RBAC system
- Site and template management
- Order management
- Component registry

## 🚀 Production Deployment

### Prerequisites
1. PostgreSQL database
2. Environment variables configured
3. Cloudflare API credentials (for SSL)
4. Nginx configured (if using host nginx)

### Steps

1. Set `NODE_ENV=production`
2. Configure all environment variables
3. Run migrations: `npm run migrate`
4. Seed database: `npm run seed`
5. Start the server: `npm start`

### Docker Production

```bash
# Build image
docker build -t smartstore-api .

# Run container
docker run -d \
  --name smartstore-api \
  -p 4050:4050 \
  --env-file .env \
  smartstore-api
```

## 📚 Documentation

Additional documentation:
- `CLOUDFLARE_ORIGIN_CERTIFICATE_SETUP.md` - Cloudflare SSL setup
- `MULTI_DOMAIN_CERTIFICATE_GUIDE.md` - Multi-domain certificate management
- `SSL_INTEGRATION_GUIDE.md` - SSL integration guide
- `SITE_DEPLOYMENT_IMPLEMENTATION_PLAN.md` - Site deployment guide
- `nginx/DEPLOYMENT_SCENARIOS.md` - Nginx deployment scenarios
- `CONTRIBUTING.md` - Contribution guidelines

## 🤝 Contributing

We welcome contributions! Please see our detailed contribution guide:

**📖 [CONTRIBUTING.md](CONTRIBUTING.md)** - Complete guide to adding modules

Quick checklist:
1. Create a feature branch
2. Follow the modular architecture pattern
3. Add comprehensive tests (minimum 80% coverage)
4. Update documentation
5. Follow the code style guide
6. Create descriptive pull request

**Example modules to reference:**
- `src/modules/auth/` - Authentication module
- `src/modules/sites/` - Site management module
- `src/modules/orders/` - Order management module

## 📄 License

MIT

## 📧 Contact

For questions or support, contact the development team.
