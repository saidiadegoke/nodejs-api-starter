# Architecture

## Overview

Commod Backend is a monolithic NestJS application following a modular architecture. Each business domain is encapsulated in its own module under `src/modules/`. Shared infrastructure (Redis, payments, file storage) lives in `src/infra/`.

```
src/
├── config/          # Environment config per domain (validated with class-validator)
├── database/        # TypeORM config, migrations, seeders
├── infra/           # Infrastructure: Redis client, payment factory
├── logger/          # Custom Pino/Loki logger
├── modules/         # Business domain modules (see below)
├── utils/           # Shared abstracts, decorators, guards, pipes
├── app.module.ts    # Root module
└── main.ts          # Bootstrap, Fastify adapter, microservice listener
```

---

## Runtime

| Layer           | Technology                                        |
| --------------- | ------------------------------------------------- |
| HTTP framework  | Fastify (via `@nestjs/platform-fastify`)          |
| ORM             | TypeORM                                           |
| Database        | PostgreSQL                                        |
| Cache / Pub-Sub | Redis (ioredis for microservices transport)       |
| File storage    | Local disk or DigitalOcean Spaces (S3-compatible) |
| Vector DB       | Milvus (optional, for AI semantic search)         |
| Search          | Elasticsearch (optional)                          |

---

## Module Map

### Authentication & Security

| Module         | Path                   | Responsibility                                  |
| -------------- | ---------------------- | ----------------------------------------------- |
| `auth`         | `modules/auth`         | JWT login/register, social OAuth, token refresh |
| `session`      | `modules/session`      | Active session tracking                         |
| `twofa`        | `modules/twofa`        | TOTP two-factor authentication                  |
| `permission`   | `modules/permission`   | Fine-grained permission definitions             |
| `role`         | `modules/role`         | User roles (Admin, User, …)                     |
| `blocked-user` | `modules/blocked-user` | User blocking/unblocking                        |
| `forgot`       | `modules/forgot`       | Password reset tokens                           |

### User Management

| Module          | Path                    | Responsibility                        |
| --------------- | ----------------------- | ------------------------------------- |
| `users`         | `modules/users`         | User CRUD, notifications, profile     |
| `user-config`   | `modules/user-config`   | Per-user settings, logo, widget prefs |
| `address`       | `modules/address`       | Billing & shipping addresses          |
| `organizations` | `modules/organizations` | Multi-tenant org management           |

### AI & Machine Learning

| Module            | Path                      | Responsibility                               |
| ----------------- | ------------------------- | -------------------------------------------- |
| `ai`              | `modules/ai`              | LLM query orchestration, chat                |
| `ai-chains`       | `modules/ai-chains`       | Configurable processing chain definitions    |
| `ai-chat-history` | `modules/ai-chat-history` | Conversation threads and messages            |
| `ai-doc`          | `modules/ai-doc`          | Document ingestion and analysis              |
| `ai-llms`         | `modules/ai-llms`         | LLM provider configuration (model, keys)     |
| `assistants`      | `modules/assistants`      | Named AI assistant entities                  |
| `vectors`         | `modules/vectors`         | Milvus vector store: embed, search, retrieve |
| `elevenlabs`      | `modules/elevenlabs`      | Text-to-speech via ElevenLabs                |

### E-commerce

| Module       | Path                 | Responsibility                  |
| ------------ | -------------------- | ------------------------------- |
| `products`   | `modules/products`   | Product catalog + inventory     |
| `categories` | `modules/category`   | Product categories              |
| `cart`       | `modules/cart`       | Shopping cart                   |
| `wishlist`   | `modules/wishlist`   | User wishlists                  |
| `order`      | `modules/order`      | Order lifecycle                 |
| `invoice`    | `modules/invoice`    | Invoice generation              |
| `warehouses` | `modules/warehouses` | Warehouse management            |
| `currencies` | `modules/currencies` | Multi-currency + exchange rates |
| `taxes`      | `modules/taxes`      | Tax rules                       |

### Payments

| Module              | Path                        | Responsibility                                    |
| ------------------- | --------------------------- | ------------------------------------------------- |
| `payments`          | `modules/payments`          | Generic payment interface                         |
| `stripe`            | `modules/stripe`            | Stripe: products, prices, subscriptions, accounts |
| `paypal-subscriber` | `modules/paypal-subscriber` | PayPal subscription plans                         |
| `subscriptions`     | `modules/subscriptions`     | Subscription lifecycle                            |
| `plans`             | `modules/plans`             | Service plan definitions                          |

### Project Management

| Module          | Path                    | Responsibility                  |
| --------------- | ----------------------- | ------------------------------- |
| `kanban`        | `modules/kanban`        | Kanban boards and categories    |
| `kanban-status` | `modules/kanban-status` | Kanban column statuses          |
| `task`          | `modules/task`          | Task management with assignees  |
| `calendar`      | `modules/calendar`      | Events and scheduling           |
| `comment`       | `modules/comment`       | Threaded comments on any entity |

### Business Intelligence

| Module    | Path              | Responsibility                                    |
| --------- | ----------------- | ------------------------------------------------- |
| `widgets` | `modules/widgets` | Dashboard widgets (Bar, Line, Pie, Histogram, XY) |
| `finance` | `modules/finance` | Accounts and transactions                         |
| `leads`   | `modules/leads`   | Lead tracking                                     |
| `forms`   | `modules/forms`   | Dynamic form builder                              |

### Infrastructure & System

| Module        | Path                  | Responsibility                         |
| ------------- | --------------------- | -------------------------------------- |
| `files`       | `modules/files`       | File upload, S3/local storage, sharing |
| `mail`        | `modules/mail`        | Email templates (Handlebars)           |
| `mailer`      | `modules/mailer`      | SMTP sending abstraction               |
| `departments` | `modules/departments` | Org department management              |
| `scim`        | `modules/scim`        | SCIM 2.0 identity provisioning         |
| `statuses`    | `modules/statuses`    | System-wide status codes               |
| `home`        | `modules/home`        | Homepage content                       |
| `mcp-servers` | `modules/mcp-servers` | MCP server configurations              |

---

## Service Layer Architecture

Every module follows the same three-tier pattern:

```
Controller  →  Service  →  Repository (TypeORM)
```

### Base Classes

| Class                     | Location                                     | Use                                 |
| ------------------------- | -------------------------------------------- | ----------------------------------- |
| `ServiceAbstract<T>`      | `utils/abstracts/serviceAbstract.ts`         | CRUD + pagination for all services  |
| `ServiceAbstractRepoless` | `utils/abstracts/serviceAbstractRepoless.ts` | Services without direct DB access   |
| `ServiceAbstractLikeable` | `utils/abstracts/serviceAbstractLikeable.ts` | Entities with like/unlike           |
| `ControllerBase`          | `utils/controllerBase.ts`                    | Standard REST endpoints + filtering |
| `ControllerBaseCRUD`      | `utils/controllerBaseCRUD.ts`                | Full CRUD controller                |
| `EntityHelper`            | `utils/entity-helper.ts`                     | Base TypeORM entity (JSON, hooks)   |

### Design Patterns

**Factory Pattern**

- `PaymentServiceFactory` — instantiates Stripe or PayPal service based on `PAY_SYSTEM` env
- `RedisClientFactory` — creates the Redis client

**Provider Pattern**

- AI chain providers (`chainDataSource`, `chainTavilySearch`, `llm`)
- File storage adapters (`S3Adapter`, `FileAdapter`)
- Social auth strategies (Google, Facebook, Apple, Twitter)

**Widget System**

- `AbstractWidgetHandle` — base for dashboard data sources
- Interpreter classes per chart type: `BarChart`, `LineChart`, `Pie`, `Histogram`, `XYGraph`, `SingleValue`

---

## Security

- **JWT** — access token (short-lived) + refresh token (long-lived, stored in session)
- **2FA** — TOTP via `speakeasy`, enforced per user
- **RBAC** — `PermissionGuard` checks `@Permission()` decorator against user's role permissions
- **Social OAuth** — Passport strategies per provider; tokens verified server-side
- **Password hashing** — bcrypt

Guards applied globally or per-route:

- `JwtTwoFactorGuard` — default guard (requires valid JWT + 2FA if enabled)
- `PermissionGuard` — checks specific permission
- `StatusGuard` — blocks inactive/banned users

---

## Data Flow — AI Query

```
POST /api/v1/ai/query
  │
  ├─ JwtTwoFactorGuard
  ├─ AiController.query()
  ├─ AiService.handleQuery()
  │   ├─ Load LLM config from AiLlmsService
  │   ├─ Build chain via ai-chains (router → chain)
  │   ├─ (optional) Vector retrieval from Milvus
  │   └─ Stream response back
  └─ Save to AiChatHistoryService
```

---

## Infrastructure on DigitalOcean

```
┌─────────────────────────────────────┐
│           DigitalOcean              │
│                                     │
│  Droplet (Staging / Production)     │
│  ┌─────────────────────────────┐   │
│  │  docker-compose.prod.yml    │   │
│  │  ┌─────────┐  ┌──────────┐ │   │
│  │  │   api   │  │ postgres │ │   │
│  │  │ (NestJS)│  │  17.2    │ │   │
│  │  └────┬────┘  └──────────┘ │   │
│  └───────┼─────────────────────┘   │
│          │                         │
│  Managed Redis (TLS, rediss://)    │
│  Managed DB (PostgreSQL, SSL)      │
│  Spaces (S3-compatible storage)    │
└─────────────────────────────────────┘
```

Deployment is trigger-based (GitHub Actions):

1. Docker image built in CI
2. Saved as `.tar.gz`, SCP'd to Droplet
3. Loaded and swapped with health-check rollback
