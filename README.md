# RunCityGo Backend API

A scalable Node.js + Express + PostgreSQL backend for the RunCityGo platform, following a modular feature-based architecture.

## 🚀 Quick Start

### Prerequisites

- Node.js (v16 or higher)
- PostgreSQL (v13 or higher)
- npm or pnpm

### Installation

1. Clone the repository and navigate to the backend directory:
```bash
cd runcitygo-backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

4. Update the `.env` file with your database credentials and other configuration.

5. Create the database:
```bash
createdb runcitygo_db
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

The API will be available at `http://localhost:3010/api`

## 📁 Project Structure

```
runcitygo-backend/
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
│   │   ├── seeds/             # SQL seed files
│   │   ├── migrate.js         # Migration runner
│   │   ├── seed.js            # Seed runner
│   │   └── pool.js            # PostgreSQL connection pool
│   │
│   ├── modules/               # Feature modules
│   │   ├── users/             # User management module
│   │   │   ├── models/        # Data models
│   │   │   ├── controllers/   # Request handlers
│   │   │   ├── services/      # Business logic
│   │   │   ├── utils/         # Module-specific utilities
│   │   │   └── routes.js      # Module routes
│   │   └── index.js           # Module exports
│   │
│   ├── shared/                # Shared utilities
│   │   ├── middleware/        # Express middleware
│   │   ├── utils/             # Utility functions
│   │   ├── constants/         # Constants and enums
│   │   └── validations/       # Validation helpers
│   │
│   ├── routes/                # Global route configuration
│   │   └── index.js           # Route aggregator
│   │
│   └── tests/                 # Test files
│
├── .env.example               # Environment variables template
├── .gitignore                 # Git ignore rules
├── package.json               # Dependencies and scripts
└── README.md                  # This file
```

## 🗄️ Database Schema

The application uses PostgreSQL with UUID primary keys and follows the RunCityGo architecture guidelines:

### Core Tables
- **users** - Authentication data (email, phone, password)
- **profiles** - User profile information
- **roles** - System roles (customer, shopper, dispatcher, admin, support)
- **permissions** - System permissions
- **user_roles** - Many-to-many relationship between users and roles
- **role_permissions** - Many-to-many relationship between roles and permissions
- **user_permissions** - Direct permission overrides for users

### Authentication Tables
- **social_accounts** - OAuth provider accounts
- **user_sessions** - Active user sessions
- **password_resets** - Password reset tokens
- **verification_tokens** - Email/phone verification tokens

### Location & Address Tables
- **countries** - Country reference data with ISO codes and phone codes
- **locations** - Centralized location storage (GPS + address data)
- **user_addresses** - User delivery addresses (references locations)

### Order Management Tables
- **orders** - Core order data with location references
- **order_items** - Shopping items breakdown
- **order_reference_photos** - Customer-uploaded reference photos
- **order_progress_photos** - Service provider progress photos
- **order_timeline** - Order status change history
- **order_location_tracking** - Real-time GPS tracking

### File Management
- **files** - Centralized file metadata storage for all uploads

## 🔐 Authentication & Authorization

The API implements a comprehensive RBAC (Role-Based Access Control) system:

- **Multiple roles per user**: Users can have multiple roles simultaneously
- **Permission inheritance**: Users inherit permissions from their roles
- **Direct permission overrides**: Additional permissions can be granted/denied to specific users
- **Time-limited permissions**: Roles and permissions can have expiration dates

### Default Roles

- **Customer**: Regular users who create orders
- **Shopper**: Service providers who fulfill shopping orders
- **Dispatcher**: Delivery personnel
- **Admin**: Platform administrators
- **Support**: Customer support agents

## 📝 API Scripts

```bash
# Development
npm run dev          # Start development server with nodemon

# Production
npm start            # Start production server

# Database
npm run migrate      # Run all pending migrations (with version tracking)
npm run seed         # Seed database with initial data

# Testing
npm test             # Run all tests with coverage
npm run test:auth    # Run authentication tests only
npm run test:rbac    # Run RBAC tests only
npm run test:orders  # Run order tests only
npm run test:watch   # Run tests in watch mode
npm run test:cleanup # Clean up test database
```

## 🛣️ API Endpoints

### Health Check
- `GET /api/health` - Check API status
- `GET /api` - API version information

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh-token` - Refresh access token
- `POST /api/auth/logout` - Logout user
- `POST /api/auth/verify-phone` - Verify phone with OTP
- `POST /api/auth/resend-otp` - Resend OTP
- `POST /api/auth/forgot-password` - Initiate password reset
- `POST /api/auth/reset-password` - Reset password with code
- `POST /api/auth/change-password` - Change password (authenticated)

### Users
- `GET /api/users/me` - Get current user profile
- `PUT /api/users/me` - Update current user profile
- `GET /api/users/me/addresses` - List user addresses
- `POST /api/users/me/addresses` - Add delivery address
- `PUT /api/users/me/addresses/:id` - Update address
- `DELETE /api/users/me/addresses/:id` - Delete address

### Orders
- `POST /api/orders` - Create new order
- `GET /api/orders` - List user's orders (with pagination)
- `GET /api/orders/:id` - Get order details
- `POST /api/orders/:id/cancel` - Cancel order
- `POST /api/orders/:id/photos` - Upload progress photo
- `POST /api/orders/:id/location` - Update order location
- `GET /api/orders/:id/location` - Get current location
- `GET /api/orders/:id/location/history` - Get location history

### Files
- `POST /api/files/upload` - Upload single file
- `POST /api/files/batch` - Create files from metadata
- `GET /api/files/:file_id` - Get file details
- `DELETE /api/files/:file_id` - Delete file

### Shared Resources
- `GET /api/shared/countries` - List all countries
- `GET /api/shared/countries/search` - Search countries
- `GET /api/shared/countries/:id` - Get country by ID

## 🔧 Environment Variables

See `.env.example` for all available configuration options.

Key variables:
- `PORT` - Server port (default: 3010)
- `NODE_ENV` - Environment (development/production)
- `DB_*` - Database connection settings
- `JWT_*` - JWT token configuration
- `CORS_ORIGIN` - Allowed CORS origins

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

## 🚀 Deployment

### Production Build

1. Set `NODE_ENV=production` in your environment
2. Ensure all environment variables are properly configured
3. Run migrations: `npm run migrate`
4. Start the server: `npm start`

### Docker Support

Docker support can be added with a `Dockerfile` and `docker-compose.yml` for easy deployment.

## 📚 Documentation

For detailed API architecture and implementation guidelines, see:
- `api-architecture-guidelines.md` - Architecture patterns and standards
- `api-documentation.md` - Full API reference
- `API-QUICK-REFERENCE.md` - Quick API reference

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
- `src/modules/orders/` - Order management module
- `src/modules/files/` - File management module

## 📄 License

MIT

## 📧 Contact

For questions or support, contact: info@runcitygo.com

