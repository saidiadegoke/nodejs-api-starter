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

The API will be available at `http://localhost:3000/api`

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
npm run migrate      # Run all pending migrations
npm run seed         # Seed database with initial data

# Testing
npm test             # Run tests with coverage
```

## 🛣️ API Endpoints

### Health Check
- `GET /api/health` - Check API status

### Users
- `GET /api/users` - List all users (paginated)
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

## 🔧 Environment Variables

See `.env.example` for all available configuration options.

Key variables:
- `PORT` - Server port (default: 3000)
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

1. Follow the modular architecture pattern
2. Add tests for new features
3. Update documentation as needed
4. Follow the existing code style

## 📄 License

MIT

## 📧 Contact

For questions or support, contact: engineering@runcitygo.com

