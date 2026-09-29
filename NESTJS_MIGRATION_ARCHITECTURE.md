# NestJS Migration Architecture — Modular Monolith, Event-Driven

**Status:** Draft for adoption
**Template source:** `commod-main` (NestJS 11 + Fastify + TypeORM + PostgreSQL)
**Source system:** an existing Express service
**Date:** 2026-09-29

---

## 0. How to use this document

This is the **target architecture and migration plan** for moving an Express codebase onto NestJS, using `commod-main` as the reference implementation. It is written to be dropped into the target repo as `docs/architecture/ARCHITECTURE.md`.

Two things to keep separate as you read:

- **The architecture** (§1, §3–§12) — where you are going. This is stable, and every section cites a `commod-main` file that already proves the pattern.
- **The migration** (§2, §13) — how you get there from Express. This is a sequence of reversible steps.

Section §15 lists what **not** to copy from `commod-main` — it is a mature template with real accumulated debt, and reproducing that debt in a new service would be a waste of the whole exercise.

---

## 1. Target architecture at a glance

A **modular monolith**: one deployable, one process, one database — but internally partitioned into feature modules with enforced boundaries, communicating through in-process domain events rather than direct cross-module calls.

```
┌───────────────────────────────────────────────────────────────┐
│  Single NestJS process                                        │
│                                                               │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐          │
│  │  Module A   │   │  Module B   │   │  Module C   │          │
│  │ controller  │   │ controller  │   │ controller  │          │
│  │ service     │──▶│ service     │   │ service     │          │
│  │ repository  │   │ repository  │   │ repository  │          │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘          │
│         │ emit            │ emit            │ emit            │
│         ▼                 ▼                 ▼                 │
│  ┌─────────────────────────────────────────────────────┐      │
│  │  DOMAIN_EVENT_BUS (port)                            │      │
│  │  adapter: in-process EventEmitter2  →  BullMQ/Kafka │      │
│  └─────────────────────────────────────────────────────┘      │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐      │
│  │  Cross-cutting: guards, filters, interceptors, pipes │      │
│  └─────────────────────────────────────────────────────┘      │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    PostgreSQL (shared schema)
```

**Design rules, in priority order:**

1. **One module = one bounded context.** A module owns its tables, its entities, its migrations, and its events. Nothing outside the module reads its tables directly.
2. **Cross-module communication is by event or by exported service interface** — never by reaching into another module's repository.
3. **Events are published through a port, not through `EventEmitter2` directly.** The transport is an adapter choice, so moving to BullMQ or Kafka later is a wiring change, not a rewrite.
4. **Publish after commit.** An event describing a state change must not be observable before that state change is durable.
5. **The module boundary is enforced by tooling**, not by convention. See §4.5.

### Runtime stack

| Layer | Choice | `commod-main` precedent |
| --- | --- | --- |
| HTTP | Fastify via `@nestjs/platform-fastify` | `src/main.ts` |
| ORM | TypeORM 0.3.x | `src/database/typeorm-config.service.ts` |
| Database | PostgreSQL | — |
| Cache / pub-sub | Redis (ioredis) | `src/infra/redis/redis.client.factory.ts` |
| Job queues | BullMQ | `src/infra/bullmq/bullmq.module.ts` |
| Realtime | Socket.io via `@nestjs/platform-socket.io` | `src/modules/notifications/notification.gateway.ts` |
| Validation | class-validator + class-transformer | `src/utils/validation-options.ts` |
| Logging | Pino or Nest `ConsoleLogger` + Loki shipping | `src/logger/` |
| Async workflows | Temporal (only if you have long-running sagas) | `src/modules/temporal/` |

> **Adopt Fastify from day one.** `commod-main` starts on Fastify and never regrets it. Express-compatible middleware is available through `@fastify/middie` if you need to lift something across verbatim.

---

## 2. Migration strategy

You have an Express app in production and a Nest app that does not exist yet. Two viable paths. **The recommendation for a live service is the strangler-fig**, because the workspace's own cross-service invariant ("Zero Synchronized Deploys") exists precisely to avoid flag-day cutovers.

### 2.1 Option A — Incremental strangler-fig (recommended)

Both apps run simultaneously against the same database. A reverse proxy routes by path prefix; migrated routes go to Nest, everything else falls through to Express.

```
                    ┌──────────────┐
   clients ────────▶│  nginx /     │
                    │  traefik     │
                    └──────┬───────┘
                  /api/v1/new/*  │  everything else
                    ┌──────────┴──────────┐
                    ▼                     ▼
            ┌───────────────┐    ┌───────────────┐
            │  NestJS app   │    │  Express app  │
            │  (new)        │    │  (legacy)     │
            └───────┬───────┘    └───────┬───────┘
                    └────────┬───────────┘
                             ▼
                      PostgreSQL (one schema)
```

**Pros:** every step ships independently and is individually reversible; production traffic validates each module before the next one starts; no big-bang risk window.

**Cons:** two runtimes to operate and monitor during the transition; you must actively delete the migrated Express routes, or the split ossifies and you end up maintaining both forever.

**Critical discipline — the rules that make this work:**

| Rule | Why |
| --- | --- |
| **Exactly one writer per table.** A table is owned by either Express or Nest, never both. | Two ORMs writing one table produces divergent invariants silently. |
| **One schema owner for migrations.** Legacy owns migrations until a table is fully migrated; then Nest takes it. | Prevents two migration histories forking the schema. |
| **Delete the Express route in the same PR that ships the Nest one.** | The only defence against a permanent two-stack split. |
| **Never `synchronize: true`.** | TypeORM will happily drop columns it does not know about. |
| **Proxy by path prefix only** — never by feature flag inside one process. | Keeps the routing decision observable in one place. |

Nest can also be mounted *inside* the Express process (Nest exposes the underlying Express instance, and you can mount it on a sub-path). This is tempting because it means one deploy. **Avoid it.** Two runtimes in one process means one crash domain and a much harder rollback story.

### 2.2 Option B — big-bang rewrite

Build the Nest service alongside the Express one, then cut over at a scheduled flag day.

**Pros:** reaches a clean architecture fastest; no dual-runtime tax; no legacy route demuxer to build.

**Cons:** the whole service is unproven until the day it takes production traffic; rollback is all-or-nothing; the longer the build runs, the more the Express app drifts and invalidates your port.

**Only take this path if** the service is small, has few consumers, and you can afford a maintenance freeze on the Express side during the port.

### 2.3 Decision criteria

| Condition | Lean |
| --- | --- |
| Service is live with real consumers | **Strangler (§2.1)** |
| Service is < ~10k LOC with a handful of routes | Big-bang is defensible |
| Multiple client repos depend on the response shapes | **Strangler** — you cannot renegotiate four clients at once |
| The database will be shared with other writers | **Strangler** — see `AGENTS.md` coupling points |
| No one can own a maintenance freeze | **Strangler** |
| You need the new architecture to unlock a specific launch date | Big-bang, with a hard date and a rehearsed rollback |

### 2.4 Shared-database rules

You selected **same DB, same schema. ** That makes these non-negotiable:

1. `synchronize: false` in every environment, including local. Entities never create schema.
2. One owner for `src/database/migrations/` at a time — see the phase table in §13.
3. Any schema change follows **Expand → Migrate → Contract** (`AGENTS.md`, "Zero Synchronized Deploys"): add columns nullable, backfill, dual-write, switch reads, then drop the old column in a *later* release.
4. TypeORM entities map onto the existing schema **explicitly** — `@Entity('snake_case_table')`, `@Column({ name: 'snake_case_col' })`. Do not let naming-strategy inference guess; it will guess wrong against a hand-written schema.
5. Migrations are frozen once applied (checksums). `commod-main` enforces this with `src/database/migrations-are-frozen.spec.ts` — copy that guard.

---

## 3. Repository layout

`commod-main` uses a **flat module namespace** — no `domain/`, `application/`, `infrastructure/` split. That is the right call for this scale, and we keep it. What we add is a stricter module contract (§4).

```
src/
├── main.ts                     # HTTP bootstrap
├── app.module.ts               # root module: imports + global providers
├── config/                     # one registerAs factory per domain + config.type.ts
├── database/
│   ├── data-source.ts          # CLI DataSource (migrations, seeds)
│   ├── typeorm-config.service.ts # runtime TypeOrmOptionsFactory
│   ├── migrations/             # timestamped migration files
│   └── seeds/                  # idempotent seed modules
├── infra/                      # technical wiring only: redis, bullmq
├── logger/                     # LoggerService + factory
├── modules/                    # feature modules (the bounded contexts)
│   └── <module>/
│       ├── <module>.module.ts
│       ├── <module>-http.module.ts    # optional: controllers split out
│       ├── index.ts                    # PUBLIC API — the only legal import surface
│       ├── controllers/
│       ├── services/
│       ├── repositories/
│       ├── entities/
│       ├── dto/
│       ├── enum/
│       ├── events/             # event names + payload interfaces
│       ├── listeners/          # @OnEvent handlers
│       ├── state-machine/      # if the module has a lifecycle
│       ├── helpers/
│       └── interfaces/
├── shared/                     # cross-module canonical enums/types ONLY
└── utils/                      # cross-cutting: guards, filters, pipes, decorators,
                                # abstracts, errors, validation-options, transaction-manager
```

**Notes on this layout:**

- **Entities live next to their module**, never in a central `entities/` folder. TypeORM discovers them by glob. `commod-main` does exactly this and it is a large part of why modules stay independently movable.
- **`index.ts` per module is the public API.** Everything under `controllers/`, `services/`, `helpers/` is private. This is an addition over `commod-main`, which has no barrel convention — and pays for it (§15).
- **`shared/` is for value types only** — enums and types that multiple modules genuinely share (currency codes, unit conversions). It must never contain services, and it must never import from `modules/`. `commod-main` keeps this honest at `src/shared/enum/`.
- **`infra/` is wiring, not abstraction.** `commod-main`'s `src/infra/` holds only Redis and BullMQ; everything else lives in its feature module. Keep that restraint — an `infra/` folder that slowly absorbs business logic is how modular monoliths die.

---

## 4. Modules — the modular monolith contract

### 4.1 The four rules

Every module obeys these. The migration checklist in §13 gates on them.

1. **Owns its data.** Its entities, its tables, its migrations, its repositories. No other module touches them.
2. **Exposes a named public surface.** `index.ts` re-exports only: the module class, its public service interfaces, and its event name/payload types. Nothing else is importable.
3. **Talks outward by event, not by call.** If A needs to react to something B did, B emits and A listens. A direct `bService.doThing()` from inside A is a design smell that should be justified in review.
4. **Declares its dependencies explicitly.** `imports: [...]` lists every module it consumes. This becomes the dependency graph you can render and review.

### 4.2 Module definition

```ts
// src/modules/members/members.module.ts
@Module({
  imports: [
    TypeOrmModule.forFeature([Member, Membership]),
    NotificationsModule,          // explicit, not implicit
  ],
  controllers: [MembersController],
  providers: [MembersService, MemberRepository, MembershipActivatedListener],
  exports: [MembersService],      // the ONLY thing other modules may inject
})
export class MembersModule {}
```

`commod-main` reference: `commod-main/src/modules/members/members.module.ts`

### 4.3 Splitting a module that grows

When a module passes roughly the point where a reviewer cannot hold it in their head, split it into sub-modules and make the parent a pure aggregator with no providers of its own.

```ts
// src/modules/deals/deals.module.ts  — 41 lines, purely structural
@Module({
  imports: [
    DealsCoreModule, DealsContractsModule, DealsNegotiationModule,
    DealsInvitesModule, DealsDocumentsModule, DealsCfcModule,
    DealsExceptionsModule, DealsInstallmentsModule, DealsSettlementModule,
    DealGatewayModule, DealAccessLogModule,
  ],
  exports: [ /* same, minus internal-only modules */ ],
})
export class DealsModule {}
```

`commod-main` reference: `commod-main/src/modules/deals/deals.module.ts`

Each sub-module then repeats the standard folder vocabulary. Cross-sub-module code that has no module class of its own (shared enums, events, guards) goes in a `shared/` folder inside the parent module — mirroring `commod-main`'s `src/modules/deals/shared/`.

### 4.4 The `-http.module` split

When a module has non-HTTP consumers (a queue worker, a cron process, a CLI), split the module in two so those consumers do not drag the HTTP dependency tree into their DI graph:

```ts
// members.module.ts       — services, repositories, listeners
// members-http.module.ts  — controllers only; imports MembersModule
```

`commod-main` does this for `listing` and `files`, and documents the reason inline. Adopt it the first time you have a worker importing a module, not after.

### 4.5 Enforcing the boundary

This is the single highest-value thing to add over the `commod-main` template. Without enforcement, "modular monolith" degrades into "monolith with folders".

**Tooling:** `eslint-plugin-boundaries` or `dependency-cruiser`, configured with two rules:

1. A module may not import from another module except through that module's `index.ts`.
2. `shared/` may not import from `modules/`; no module may import from another module's `repositories/` or `entities/`.

```js
// eslint.config.mjs (excerpt)
{
  files: ['src/modules/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        group: ['@modules/*/!(index)'],
        message: 'Import another module only through its index.ts public API.',
      }],
    }],
  },
}
```

Add a CI check that renders the module dependency graph and fails on a new cycle. A cycle between modules is the earliest detectable symptom of a boundary collapse.

---

## 5. Layering and dependency injection

### 5.1 The layer contract

```
Controller  →  Service  →  Repository  →  TypeORM  →  PostgreSQL
                   │
                   └──▶ DomainEventBus.publish(event)
```

- **Controllers** parse and validate input, call one service method, shape the response. No business logic, no repository access.
- **Services** hold business logic. One service per cohesive capability, not one per entity.
- **Repositories** hold query logic. A custom repository is warranted when a query is complex, reused, or needs an aggregate root. Otherwise inject `Repository<T>` directly.

### 5.2 Repository patterns

Three patterns coexist in `commod-main`; adopt the first two, treat the third as inherited debt.

**Pattern 1 — direct injection (default).** Simplest, and correct for most modules:

```ts
constructor(
  @InjectRepository(Listing) private readonly listingRepo: Repository<Listing>,
) {}
```

**Pattern 2 — custom repository extending an abstract base (complex aggregates).**

```ts
// src/utils/abstracts/repositoryAbstract.ts  — the base
@Injectable()
export class DealRepository extends RepositoryAbstract<Deal> {
  constructor(@InjectRepository(Deal) repo: Repository<Deal>) { super(repo); }

  async listDeals(params: ListDealsParams): Promise<[Deal[], number]> { /* ... */ }
}
```

Registered as a plain provider in the module — `commod-main` has 29 of these, concentrated in `deals/*/repositories/`. Reference: `commod-main/src/modules/deals/core/repositories/deal.repository.ts`

**Pattern 3 — service-level CRUD base classes.** `commod-main` provides `ServiceAbstract<T>` (`src/utils/abstracts/serviceAbstract.ts`) with 47 subclasses, plus `ServiceAbstractLikeable` and `ServiceAbstractRepoless`. The base class resolves a per-instance logger through `ModuleRef` and supplies `create/findOne/findMany/findManyWithPagination`.

> **Caveat.** These bases save real time early and cost real time later — inherited CRUD methods accumulate behaviour that no single module asked for, and 47 subclasses means a change to the base is a change to 47 services. **Start without them.** Write explicit service methods. Introduce a base class only after three services independently repeat the same shape, and keep it thin (pagination + soft-delete only). Do **not** port `ServiceAbstract` into the new service on day one.

### 5.3 Transactions

Route every multi-write operation through a transaction manager rather than scattering `dataSource.transaction()` calls:

```
src/utils/transaction-manager.ts   # commod-main's implementation
```

This is also where the **after-commit event flush** hooks in (§8.4).

### 5.4 State machines

Any entity with a lifecycle gets an explicit, pure, tested state machine — not `if (status === ...)` chains scattered across services. This is a genuinely good pattern that `commod-main` applies consistently:

- `src/modules/listing/state-machine/status-transitions.ts`
- `src/modules/offer/state-machine/status-transitions.ts`
- `src/modules/deals/core/state-machine/phase-transitions.ts`

```ts
// pure functions, no DI, trivially unit-testable
export function isValidListingTransition(from: ListingStatus, to: ListingStatus): boolean { /* ... */ }
```

Services call the guard and throw a typed conflict on violation:

```ts
if (!isValidListingTransition(from, to)) {
  throw new ConflictException({ code: ListingErrorCode.INVALID_STATUS_TRANSITION });
}
```

**Requirement:** every state machine ships with a co-located `*.spec.ts` covering every legal transition and a representative set of illegal ones. This is a CI-gated requirement, not a nice-to-have.

---

## 6. Configuration

`commod-main`'s config pattern is the cleanest part of the template. **Copy it wholesale.**

### 6.1 One file per domain, self-validating

```ts
// src/config/app.config.ts
class EnvironmentVariablesValidator {
  @IsEnum(Environment) @IsOptional() NODE_ENV: Environment;
  @IsInt() @Min(0) @Max(65535) @IsOptional() APP_PORT: number;
  @IsUrl({ require_tld: false }) FRONTEND_DOMAIN: string;
}

export default registerAs<AppConfig>('app', () => {
  const env = validateConfig(process.env, EnvironmentVariablesValidator);
  return {
    nodeEnv: env.NODE_ENV || 'development',
    port: env.APP_PORT ?? 3000,
    // ...
  };
});
```

Rules:

1. **Every config file validates its own env slice** with class-validator via `src/utils/validate-config.ts` (`plainToClass` + `validateSync`, throws on error). The app refuses to boot on a bad env — fail-closed.
2. **`config.type.ts` declares the typed surface** (`AppConfig`, `RedisConfig`, … and the `AllConfigType` union).
3. **Every injection site uses `ConfigService<AllConfigType>`** so `configService.get('app.port')` is typed and typo-proof.
4. **`{ infer: true }` on every `.get()` call.** `commod-main` enforces this with a `no-restricted-syntax` ESLint rule — copy the rule, it catches a whole class of silent `undefined`s.
5. **`dotenv/config` is the first import in `main.ts`**, before anything that reads `process.env` at module-evaluation time. `commod-main` documents this inline at `src/main.ts:1-5` because Sentry and the CORS allow-list both read env before `ConfigModule` runs.
6. **Co-locate config specs** for anything with logic: `trust-proxy.spec.ts`, `subscriptions.config.spec.ts`.

Register everything in the root module:

```ts
ConfigModule.forRoot({
  isGlobal: true,
  load: [appConfig, redisConfig, databaseConfig, /* ... */],
  envFilePath: ['.env'],
}),
```

---

## 7. Data layer

### 7.1 Two DataSources

`commod-main` splits runtime and CLI deliberately. Keep the split:

| Concern | File | Notes |
| --- | --- | --- |
| Runtime | `src/database/typeorm-config.service.ts` | `TypeOrmOptionsFactory`, wired via `TypeOrmModule.forRootAsync({ useClass })` |
| CLI | `src/database/data-source.ts` | Raw `process.env`; used by migration and seed CLIs; `migrationsTransactionMode: 'each'` |

The CLI one must not depend on Nest DI, because `typeorm` CLI runs outside the application container.

### 7.2 Entities

```ts
@Entity('listing')
@Index('IDX_listing_status', ['status'])
@Index('IDX_listing_status_commodity_type', ['status', 'commodityType'])
export class Listing extends EntityHelper {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  // ...
}
```

Conventions:

- **Explicit table and column names.** `commod-main` migrated toward explicit snake_case after starting with TypeORM defaults, which left ~30 entities on inferred names. Start explicit; never infer.
- **One base entity class** — `EntityHelper` (`src/utils/entity-helper.ts`) extends TypeORM's `BaseEntity`, adds `@AfterLoad` and `toJSON() → instanceToPlain`. Keep it thin.
- **Index naming:** `IDX_<table>_<cols>`.
- **`@ApiProperty` decorators on entities** only if entities double as API response schemas — which `commod-main` does. If you use separate response DTOs (recommended, see §10.4), keep entities free of Swagger decorators.
- **`synchronize: false`, always.** Entities never create schema.

### 7.3 Migrations

- Location: `src/database/migrations/postgres/`
- Filename: `<epochMs>-PascalCaseName.ts`; class `PascalCaseName<epochMs>`
- **Frozen once applied.** Copy `src/database/migrations-are-frozen.spec.ts` — it is a checksum guard that fails CI if an applied migration is edited.
- **Additive-first.** Every schema change is Expand → Migrate → Contract. No destructive change in the same release as the code that stops using the column.
- A CI job (mirroring `.github/workflows/validate-migrations.yml`) restores a real database dump, runs pending migrations, and fails on drift.

### 7.4 Seeds

Seed modules are idempotent — `count() === 0 → save()` — and orchestrated by a single runner. `commod-main` wires this with hygen templates under `.hygen/seeds/create/`, generating six files per seed:

`<name>-seed.module.ts`, `<name>-seed.service.ts`, plus four injection templates that patch `seed.module.ts` and `run-seed.ts`.

This is the **only** code generator in `commod-main`, and it is worth copying because seed wiring is pure boilerplate that is easy to get subtly wrong.

---

## 8. Event-driven architecture

This is the section the migration exists for. The goal: modules react to each other without coupling, and the transport can change without touching business code.

### 8.1 Layering of events

| Kind | Meaning | Transport | Example |
| --- | --- | --- | --- |
| **Domain event** | Something happened inside one module. May have no consumers. | In-process | `member.activated` |
| **Integration event** | A contract other modules depend on. Payload is versioned and stable. | In-process now, broker later | `listing.published` |
| **Job** | Work that must survive a restart or be retried. | BullMQ | `document.extract` |
| **Workflow** | Multi-step, long-running, needs durable state. | Temporal | `deal.settlement` |

**Rule:** if losing the event on a crash is unacceptable, it is a **job** or a **workflow**, not a domain event. In-process events are deliberately not durable — see §8.5.

### 8.2 The event catalogue

Each module owns an `events/<domain>.events.ts` exporting a frozen name map and typed payload interfaces. Copy this exact shape — 24 modules in `commod-main` follow it.

```ts
// src/modules/listing/events/listing.events.ts
export const LISTING_EVENTS = {
  PUBLISHED: 'listing.published',
  STATUS_CHANGED: 'listing.status_changed',
  TIER_GATE_UNAVAILABLE: 'listing.tier_gate_unavailable',
} as const;

export interface ListingStatusChangedEvent {
  listingId: string;
  sellerEntityPassId: string;
  fromStatus: ListingStatus;
  toStatus: ListingStatus;
  actorUserId?: number;
  reason?: string;
}
```

Conventions:

- **Namespaced, dotted, lowercase, past-tense or noun-phrase:** `listing.status_changed`.
- **`as const`** so the name map is the single source of truth for both publisher and subscriber.
- **Payloads carry IDs and facts, never entities.** An event is a durable contract; an entity is an implementation detail that changes shape.
- **Interface names end in `Event`.**
- **Version integration events** when they cross a deploy boundary: `listing.published.v2`.

### 8.3 The transport-agnostic port

**This is the key design addition over `commod-main`.** `commod-main` injects `EventEmitter2` directly at 281 call sites, which is exactly why moving any of them to a broker would be a rewrite. Do not repeat that.

```ts
// src/shared/events/domain-event-bus.port.ts
export interface DomainEvent<TPayload = unknown> {
  readonly name: string;
  readonly payload: TPayload;
  readonly occurredAt: Date;
  readonly correlationId?: string;
}

export interface DomainEventBus {
  /** Fire-and-forget. Never throws into the caller's transaction. */
  publish<T>(event: DomainEvent<T>): void;
  /** Awaits all handlers. Use when a handler's result changes the outcome. */
  publishAndWait<T>(event: DomainEvent<T>): Promise<void>;
}

export const DOMAIN_EVENT_BUS = Symbol('DOMAIN_EVENT_BUS');
```

The in-process adapter:

```ts
// src/shared/events/in-process-event-bus.adapter.ts
@Injectable()
export class InProcessEventBusAdapter implements DomainEventBus {
  constructor(private readonly emitter: EventEmitter2) {}

  publish<T>(event: DomainEvent<T>): void {
    this.emitter.emit(event.name, event.payload);
  }

  async publishAndWait<T>(event: DomainEvent<T>): Promise<void> {
    await this.emitter.emitAsync(event.name, event.payload);
  }
}
```

Bound once, in a `@Global()` `EventsModule`:

```ts
{ provide: DOMAIN_EVENT_BUS, useClass: InProcessEventBusAdapter }
```

Business code injects the **token**, never the adapter:

```ts
constructor(
  @Inject(DOMAIN_EVENT_BUS) private readonly events: DomainEventBus,
) {}
```

**The payoff:** the day you need cross-process delivery, you write `BullMqEventBusAdapter` or `KafkaEventBusAdapter` and change one provider binding. Every call site is untouched.

> **Note on `publish` being synchronous.** Keeping the fire-and-forget signature `void` rather than `Promise<void>` means a broker-backed adapter cannot make publishers await a network round-trip it never needed. `publishAndWait` is the explicit opt-in for the cases that genuinely need handler results — in `commod-main` those are the veto/validation listeners (`listing.service.ts:480,514,533`).

### 8.4 Publishing — three rules

**Rule 1: publish the fact, not the intent.** `listing.status_changed` with `fromStatus`/`toStatus`, not `notifySellerAboutListing`.

**Rule 2: publish after commit.** An event that becomes observable before its transaction commits lets a listener act on state that may still roll back.

```ts
// Preferred shape
await this.transactionManager.run(async (manager) => {
  const saved = await manager.save(listing);
  this.events.collect(LISTING_EVENTS.STATUS_CHANGED, { /* ... */ });
  return saved;
});
// transactionManager flushes collected events only after the commit resolves
```

`commod-main` does **not** do this — it emits inline after `repo.save()` resolves, which is correct only because the write is already committed at that point. The `collect`-then-flush-after-commit pattern is strictly safer and composes with multi-write transactions.

**Rule 3: type the payload at the emit site.** Use `satisfies` so a schema drift is a compile error:

```ts
this.events.publish({
  name: LISTING_EVENTS.STATUS_CHANGED,
  payload: {
    listingId: saved.id,
    fromStatus, toStatus,
    actorUserId: options.actorUserId,
  } satisfies ListingStatusChangedEvent,
  occurredAt: new Date(),
  correlationId: ctx.correlationId,
});
```

`commod-main` reference: `src/modules/listing/listing.service.ts:1375`

### 8.5 Subscribing

```ts
@Injectable()
export class ListingPassCascadeListener {
  private readonly logger = new Logger(ListingPassCascadeListener.name);

  constructor(private readonly listingService: ListingService) {}

  @OnEvent(BATCH_PASS_EVENTS.STATUS_CHANGED, { async: true })
  async onBatchPassStatusChanged(event: BatchPassStatusChangedEvent): Promise<void> {
    if (CASCADE_SUSPEND_STATUSES.includes(event.toStatus)) {
      await this.cascadeSuspend(event);
    }
  }
}
```

Conventions:

- **Location:** `<module>/listeners/<descriptive-name>.listener.ts`
- **Registration:** ordinary providers in the owning module's `providers` array
- **Naming:** `<Subject><Reaction>Listener` — `ListingPassCascadeListener`, not `Listener1`
- **A listener must be idempotent.** In-process events are at-most-once today, but the moment you move to a broker they become at-least-once. Write listeners that tolerate replay from the start: guard on current state, or key on `correlationId`.
- **A listener must not throw into the publisher's path** unless it is deliberately a veto listener. Catch, log, and (for anything that matters) enqueue a retry job.
- **One listener per file, one concern per listener.** `commod-main`'s `src/modules/notifications/listeners/` holds 14 listeners — one per source domain. That is the right granularity.

### 8.6 The durability gap — read this before you rely on events

In-process `EventEmitter2` gives you: **no persistence, no retries, no delivery guarantee, no ordering across processes.** A crash mid-emit loses the event silently.

`commod-main` has **no outbox pattern and no event store**, which is precisely why anything that must survive a restart lives in BullMQ or Temporal instead. That division of labour is correct and you should adopt it explicitly:

| Need | Mechanism |
| --- | --- |
| In-process reaction, fine to lose on crash | Domain event via the port |
| Must survive restart, needs retry/backoff | BullMQ job |
| Multi-step with compensation | Temporal workflow |
| Cross-service delivery | Broker (Kafka/Redpanda) |

**If you need durable events without a broker**, the upgrade path is a transactional outbox: an `outbox` table written in the same transaction as the state change, drained by a poller that publishes and marks rows sent. The port in §8.3 makes this a new adapter (`OutboxEventBusAdapter`) rather than a change to business code — which is the whole point of building the port first.

### 8.7 Realtime

Socket.io gateways are the read-side of the event system. Keep the bridge explicit: a listener translates a domain event into a socket room emit, so the gateway never subscribes to domain events directly.

```
Domain event → <module>/listeners/<x>-realtime.listener.ts → gateway.emitToRoom(...)
```

`commod-main` reference: `src/modules/deals/realtime/deal-realtime.listener.ts`

WS auth is separate from HTTP auth — `commod-main` has `src/utils/guards/ws/` (`ws-auth.middleware.ts`, `ws-jwt.guard.ts`, `@CurrentWsUser()`). Copy it and keep CORS on the gateway sourced from the **same** allow-list object as HTTP (`src/corsObject.ts`), or the two will drift.

---

## 9. Cross-cutting concerns

### 9.1 Registration — and why order matters

Global providers go in the root module:

```ts
providers: [
  { provide: APP_FILTER,      useClass: AllExceptionsFilter },
  { provide: APP_INTERCEPTOR, useClass: SessionActivityInterceptor },
  { provide: APP_GUARD,       useClass: AuthenticationGuard },  // populates request.user
  { provide: APP_GUARD,       useClass: AuthorizationGuard },   // depends on ^
  { provide: APP_GUARD,       useClass: EntitlementGuard },     // metadata-gated
],
```

`APP_GUARD` providers execute **in declaration order**, and a guard that reads `request.user` must run after the one that populates it. `commod-main` documents this with a 16-line comment block at `src/app.module.ts:365-410` because it has already been broken once. Write that comment in the new service.

Things that **must** be registered imperatively in `main.ts` (they need the app instance): global pipes, `ClassSerializerInterceptor`, the logger, HTTP request logging, response-header registration. Follow the sequence in `src/main.ts:80-113`.

### 9.2 The piece table

| Concern | Mechanism | Location | `commod-main` reference |
| --- | --- | --- | --- |
| Error normalization | `@Catch()` global filter | `utils/filters/` | `all-exceptions.filter.ts` |
| Authn | Guard | `utils/guards/common/` | `jwt-two-factor.guard.ts` |
| Authz | Guard + `@Permission()` metadata | `utils/guards/common/` | `permission.guard.ts` |
| Request logging | Fastify hook | `logger/` | `http-request-logger.ts` |
| Serialization | `ClassSerializerInterceptor` | global | `main.ts:108` |
| Validation | `ValidationPipe` | global | `utils/validation-options.ts` |
| Throttling | `ThrottlerModule` + Redis storage | `utils/throttle/` | `redis-throttler.storage.ts` |
| Tracing | Sentry | `instrument.ts` | `src/instrument.ts` |
| Error codes | Per-module enum | `modules/<x>/enum/` | `*-error-code.enum.ts` |

### 9.3 Error handling

One global filter normalizes every throw into a single envelope:

```ts
{ code: string, message: string, errors: FieldError[] }
```

Copy `src/utils/filters/all-exceptions.filter.ts` and `src/utils/errors/error-response.dto.ts`.

Specific behaviours worth carrying over:

- **Map PostgreSQL lock/serialization failures to 409.** `55P03` (lock not available) and `40P01` (deadlock) become `CONCURRENT_MODIFICATION`. Clients then know to retry rather than treating it as a server fault.
- **Never leak internal messages.** The filter maps unknown exceptions to a generic 500 body and logs the real one.
- **Error codes are per-module enums**, so a client can branch on `code` without parsing prose.
- **Fail closed** (workspace invariant #10): a dependency that times out or errors must deny, never allow-by-default.

### 9.4 Validation

class-validator + class-transformer, globally:

```ts
// src/utils/validation-options.ts
{
  transform: true,
  whitelist: true,               // strip unknown properties
  errorHttpStatusCode: 422,
  exceptionFactory: /* flatten nested DTO children into field errors */,
}
```

- `422` for validation, not `400` — pick this and be consistent.
- `whitelist: true` is a security control, not a convenience: it stops mass-assignment of properties a client was never meant to set.
- Custom validators for cross-field rules (`is-exists`, `matches-property`) live in `utils/validators/`.
- **`useContainer(app.select(AppModule), { fallbackOnErrors: true })`** in `main.ts` — without it, validators cannot inject services, and `@IsExists()`-style validators silently fail.
- **Zod is not the API validation layer in `commod-main`.** It is a dependency, used for non-HTTP payloads. Pick one and do not mix: class-validator for HTTP DTOs, and if you want Zod for messaging payloads, keep it there.

### 9.5 Logging

`commod-main`'s logger is a `Scope.TRANSIENT` `ConsoleLogger` that auto-labels its context from the injecting class via Nest's `INQUIRER`, plus Loki HTTP shipping and a `LoggerFactory` singleton for non-DI resolution (`src/logger/`).

**Copy the transient-scoped, auto-context pattern** — it means every log line carries the emitting class without manual `new Logger(X.name)` boilerplate.

**Simplification for a new service:** drop Loki unless you already run it. A structured JSON logger to stdout is collected by your container platform, and adding a log-shipping sidecar before you have a log problem is premature.

**Carry this rule over verbatim:** never log secrets, tokens, PII, or `NEVER_CARRY`-class fields. Redaction happens at write time.

### 9.6 Throttling

`ThrottlerModule` with **Redis-backed storage**, not the in-memory default — in-memory throttling is per-process and silently wrong the moment you run more than one replica.

`commod-main` runs three named throttlers (`default` 30/min, `public-ip` 30/min, `partner` 120/min) with `skipIf` predicates. Copy the named-throttler structure; tune the numbers later.

---

## 10. API conventions

### 10.1 Controller shape

```ts
@ApiTags('Listings')
@ApiBearerAuth()
@ApiErrorResponses(401)
@UseGuards(AuthenticationGuard)
@Controller({ version: '1', path: 'listings' })
export class ListingController {
  constructor(private readonly listingService: ListingService) {}

  @Get(':id')
  @Permission({ name: 'read_listing', resource: 'listing' })
  @ApiOkResponse({ type: ListingResponseDto })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ListingResponseDto> {
    return this.listingService.findOneOrFail(id);
  }
}
```

Class-level order, consistently: `@ApiTags` → `@ApiBearerAuth` → `@ApiErrorResponses` → `@UseGuards` → `@Controller`.

### 10.2 Versioning

URI versioning, enabled in `main.ts`, global prefix from config (`api`), with `exclude: ['/']` so the root health route stays unversioned. Controllers declare `version: '1'` explicitly — in `commod-main`, 129 of 141 do, giving `/api/v1/...`.

**Partner/public APIs may deliberately sit outside versioning** with the version baked into the path (`public/v0/listings`). That is a legitimate way to keep a third-party contract stable while internal APIs evolve. If you do it, document why in the controller.

### 10.3 Response shape

**No success envelope.** Controllers return DTOs directly; `ClassSerializerInterceptor` applies `@Exclude`/`@Expose`. Errors *do* have an envelope (§9.3). This asymmetry is deliberate and worth keeping — wrapping successes in `{ data: ... }` adds a layer every client must unwrap for no benefit.

Pagination is the exception, and it is explicit:

```ts
interface FixedPaginationResult<T> { data: T[]; total: number; limit: number; page: number; }
```

For large or public collections, use **keyset cursors** instead of offset pagination (`commod-main`: `src/modules/public-api/pagination/cursor.ts`). Offset pagination degrades badly and skips rows under concurrent writes.

### 10.4 DTOs

- **Naming:** `<verb>-<entity>.dto.ts` (`create-listing.dto.ts`); query DTOs `*-query.dto.ts`; responses `*-response.dto.ts`.
- **Every field carries both** `@ApiProperty`/`@ApiPropertyOptional` (with `description` and `example`) **and** class-validator decorators. Swagger that drifts from validation is worse than no Swagger.
- **Separate request DTOs from response DTOs.** `commod-main` lets entities double as response schemas via `@ApiProperty`, which couples the wire format to the table shape — a schema change then becomes a breaking API change. New service: DTOs out, entities stay internal.

### 10.5 Filtering and sorting

Adopt the `FilterPipe` + `transformToWhere` / `applyFiltersAndOrdering` / `applyPagination` helpers (`src/utils/api-filter-helper.ts`) rather than hand-rolling query parsing per controller.

**Security requirement:** if clients can pass arbitrary filter fields, they can probe columns that are not in the API contract. `commod-main` guards this with a `filter-allow-list.guard.ts` — an allow-list per endpoint. Do not ship a generic filter surface without it.

### 10.6 Swagger

Build it from the start; it is cheap and it is the contract your frontend reads. `commod-main` builds three surfaces in `src/swagger.ts`: full API at `/docs`, a public/partner doc with `X-Api-Key` auth, and per-module docs. Gate the whole thing behind a config flag so production can disable it.

---

## 11. Testing

Four suites, four runners. Adopt the split; it maps to genuinely different needs.

| Suite | Root | Pattern | Purpose |
| --- | --- | --- | --- |
| Unit (co-located) | `src/` | `*.spec.ts` | Services, state machines, helpers, guards |
| Unit (standalone) | `test/units/` | `units/*.spec.ts` | Larger units that need several files |
| E2E | `test/` | `*.e2e-spec.ts` | Full HTTP against a real database |
| BDD | `test/features/**/*.feature` | cucumber | Acceptance criteria in business language |

### Conventions worth copying

- **Co-locate unit specs with the code.** `listing.service.spec.ts` next to `listing.service.ts`. Multi-facet coverage uses additional suffixed files: `listing.anonymity.spec.ts`, `listing.publish-gate.spec.ts`.
- **E2E mirrors domains:** `test/deals/`, `test/listings/`, etc.
- **A global setup that pre-authenticates personas once** and caches tokens to a temp file — `commod-main`'s `test/global-setup.ts` does this specifically so parallel workers do not trip the login throttler. Saves a lot of confusing flakiness.
- **Shard E2E in CI** (4 shards in `commod-main`). A single E2E job becomes the bottleneck long before you expect it.
- **Sequential escape hatches** for suites that genuinely cannot parallelize (`run-e2e-deals-sequential.sh`), rather than globally disabling parallelism.
- **Schema-invariant specs as tests.** `migrations-are-frozen.spec.ts`, `enum-migration-coverage.spec.ts`. Encoding "you may not do this" as a failing test is more durable than a wiki page.

### Negative tests are mandatory

Workspace invariant #7: **every guardrail needs a CI-gated negative test at the API/service layer. A guardrail without a negative test is treated as unimplemented.**

Concretely: if a guard exists to block an action, there must be a test that attempts the action, is refused, and asserts the refusal. This is the difference between a security control and a hope.

---

## 12. Tooling and CI

### 12.1 Path aliases — do this differently

`commod-main` has ~90 path aliases (`@<camelCaseName>Module/*` per module) that **must be mirrored in four places**: `tsconfig.json` `paths`, `package.json` `jest.moduleNameMapper`, `test/jest-e2e.json`, `test/jest-unit.json`. It also carries aliases pointing at modules that no longer exist. This is the single biggest maintenance tax in the template.

**New service: use exactly four aliases.**

```jsonc
"paths": {
  "@/*":            ["src/*"],
  "@modules/*":     ["src/modules/*"],
  "@utils/*":       ["src/utils/*"],
  "@shared/*":      ["src/shared/*"]
}
```

One per-module alias buys nothing that `@modules/listing` does not already give you, and it multiplies the config surface by four. Add a Jest `moduleNameMapper` for these four and stop.

### 12.2 TypeScript

`commod-main`'s settings, with reasons:

```jsonc
{
  "target": "ES2021",              // keeps useDefineForClassFields false — required for decorators
  "strictNullChecks": true,
  "noImplicitAny": false,          // -> turn this ON in the new service
  "strictPropertyInitialization": false,  // DTO/entity fields set by the framework
  "useUnknownInCatchVariables": false
}
```

**Turn `noImplicitAny` on.** It is off in `commod-main` as inherited boilerplate, and turning it on is a per-file cost paid once at the start rather than a permanent hole in type safety. `target: ES2021` is load-bearing — do not raise it without understanding the `useDefineForClassFields` interaction with decorators.

### 12.3 Lint

Flat ESLint config, type-aware, with `eslint-config-prettier` and `prettier/prettier: error`. Rules worth carrying:

| Rule | Why |
| --- | --- |
| `@typescript-eslint/no-floating-promises: error` | An unawaited promise in a service is a silent data bug |
| `@typescript-eslint/require-await: error` | Catches `async` functions with no `await`, usually a missing one |
| `@typescript-eslint/no-unused-vars: error` | — |
| `no-explicit-any: off` | Pragmatic; `any` at boundaries is sometimes correct |
| `no-restricted-syntax` for `ConfigService.get()` without `{ infer: true }` | Catches a whole class of silent `undefined` |
| `no-restricted-imports` for cross-module deep imports | **The modular-monolith enforcement rule** (§4.5) |

Prettier: `{ singleQuote: true, trailingComma: "all", endOfLine: "auto" }`.

### 12.4 Git hooks

- **pre-commit** — prettier + eslint `--fix` on staged `src`/`test` TS files only, then re-stage.
- **pre-push** — block direct pushes to protected branches; run `typecheck`; run `jest --changedSince=origin/dev --maxWorkers=2`.

The `--changedSince` scoping is what makes the pre-push test tolerable to live with. Copy it.

### 12.5 CI jobs

| Job | Purpose |
| --- | --- |
| `lint` / `format` | Style gate |
| `typecheck` | `tsc --noEmit` |
| `test` | Unit + coverage artifact |
| `e2e` | Sharded matrix against a real Postgres |
| `validate-migrations` | Restore a DB dump, run pending migrations, detect drift |
| `audit` / `secret-scan` | Dependency and credential gates |
| `build` | Docker image |
| **`module-boundaries`** | **New.** Render the module dependency graph; fail on cycles |
| **`branch-name`** | Enforce the branch naming convention |

### 12.6 Code generation

`commod-main` has exactly one hygen generator (seeds). Resist the urge to scaffold feature modules with hygen — module structure varies enough that generated skeletons get deleted more often than adapted. **Exception:** seed wiring (§7.4) is genuinely mechanical and worth generating.

---

## 13. Migration roadmap

Phases are ordered so each one is independently shippable and reversible. Durations assume one engineer.

### Phase 0 — Foundations (1 week)

- Scaffold the Nest project: Fastify adapter, TypeORM, ConfigModule, logger, health endpoint.
- Port `src/utils/` wholesale: filters, guards, decorators, pipes, `validation-options.ts`, `transaction-manager.ts`, `error-response.dto.ts`, `api-filter-helper.ts`, `validate-config.ts`.
- Set up `src/config/` with the `registerAs` + per-file validator pattern, `config.type.ts`, and the `{ infer: true }` lint rule.
- Set up the four path aliases only (§12.1).
- **Set up the module-boundary lint rule now, while there are zero violations.** Retrofitting it later means fixing hundreds of imports.
- Stand up CI: lint, typecheck, test, build.
- **Do not migrate any feature yet.** Phase 0 exists so Phase 1 has somewhere to land.

**Done when:** the app boots, `/health` responds, CI is green, and there is a documented module contract (§4.1).

### Phase 1 — Events and the first module (1 week)

- Build the event port and in-process adapter (§8.3), the `@Global()` `EventsModule`, and the after-commit flush in the transaction manager (§8.4).
- Write the event-name and payload conventions into `CONTRIBUTING.md`.
- Migrate **one leaf module** — the one with the fewest inbound dependencies. Typically a lookup/reference module (categories, statuses, currencies).
- Write its state machine spec, unit specs, and an E2E spec.
- **Establish the template here.** This module is what every subsequent migration copies.

**Done when:** the first module is live on the strangler, the Express route is **deleted**, and there is a reference PR others can follow.

### Phase 2 — The shared-database split (1–2 weeks)

- Decide the per-table ownership map (§2.4) and write it down.
- Freeze `synchronize` everywhere; verify the frozen-migration guard works.
- Migrate 2–3 more leaf modules, each deleting its Express counterpart in the same PR.
- Add the `module-boundaries` CI job.
- **Pressure-test the port:** add a second adapter implementation (a no-op or logging bus in tests) to prove the abstraction actually holds before you depend on it.

**Done when:** at least 3 modules run in Nest, the Express app no longer contains their routes, and no table has two writers.

### Phase 3 — Core domains (3–6 weeks)

- Migrate the core business modules in dependency order — deepest dependencies last.
- For each: extract the state machine, define the event catalogue, move the tables, add negative tests for every guardrail.
- **Move affected tables' migration ownership to Nest** as each module completes.
- Run both apps in production; the proxy split shifts route by route.

**Done when:** >60% of traffic is served by Nest and the Express app's remaining surface is enumerated.

### Phase 4 — Drain and delete (1–2 weeks)

- Migrate the remaining routes.
- Delete the Express app, the proxy demuxer, and the dual-runtime infrastructure in one final release.
- Move remaining migration ownership to Nest.
- Archive the Express repo with a pointer to the new service.

**Done when:** the Express app is deleted, not merely unused. A retired-but-running legacy service is a permanent security surface.

### Sequencing rules

1. **Leaf modules first**, then inward. Migrating a core module first means every dependency is still in Express.
2. **One module per PR.** The PR includes the Nest module *and* the deletion of the Express route.
3. **Never migrate a module and change its behaviour in the same PR.** Behaviour changes hide inside a large diff, and a regression then has two possible causes. Migrate, verify parity, *then* change behaviour.
4. **No schema change during a module migration.** Expand first, in its own release.

---

## 14. Express → Nest mapping

| Express | NestJS | Notes |
| --- | --- | --- |
| `app.use(fn)` auth middleware | `APP_GUARD` provider | Order is declaration order; see §9.1 |
| `app.use(fn)` logging | Fastify hook / interceptor | `logger/http-request-logger.ts` |
| `app.use(fn)` body transform | `Pipe` | Pipes run per-parameter, not per-request |
| `app.use(errorHandler)` (4-arg) | `@Catch()` `ExceptionFilter` | Register via `APP_FILTER` |
| `router.get('/x', h)` | `@Controller` + `@Get` | Split route + handler into decorator + method |
| `req.body` | DTO parameter + `ValidationPipe` | Validation moves from manual to declarative |
| `req.query` | `@Query()` + query DTO | `transform: true` handles type coercion |
| `req.params.id` | `@Param('id', ParseUUIDPipe)` | Parse pipes replace manual coercion |
| `res.json(x)` | `return x` | Let the framework serialize; `ClassSerializerInterceptor` applies `@Expose` |
| `res.status(201)` | `@HttpCode(201)` | Decorator, not imperative |
| `next(err)` | `throw new ConflictException(...)` | Typed exceptions; the filter normalizes |
| `process.env.X` | `ConfigService<AllConfigType>` | Validated at boot; typed at the call site |
| `node-cron` / `setInterval` | `@nestjs/schedule`, `@Cron()` | `*-cron.service.ts` naming |
| `bull` / `bee-queue` | `@nestjs/bullmq`, `@Processor` | Named queues in one config file |
| `socket.io` setup | `@WebSocketGateway` | Global `IoAdapter` in `main.ts` |
| `knex` / `pg` / `sequelize` | TypeORM entities + repositories | See §7 |
| `express.Router()` | `@Module` + `controllers: []` | Module replaces the router as the unit |
| `module.exports` singleton | `@Injectable()` + DI | Explicit lifetimes: `DEFAULT`, `REQUEST`, `TRANSIENT` |
| `require`-time wiring | `constructor` injection | — |
| `app.listen()` | `NestFactory.create()` + `app.listen()` | See `main.ts` |

**DI lifetime gotcha:** Nest's default singleton scope means a service holding per-request state leaks between requests. Use `Scope.REQUEST` only where genuinely needed — it propagates request scope up the whole injection chain and has a real performance cost. `commod-main` uses `TRANSIENT` for its logger precisely because it wants per-injection-instance context.

---

## 15. What NOT to copy from `commod-main`

`commod-main` is a mature production service. It is also a fork of a boilerplate, and it carries that boilerplate's debt plus years of accumulated shortcuts. Reproducing these in a new service would waste the migration.

| Do not copy | Why | Do instead |
| --- | --- | --- |
| **~90 path aliases** (§12.1) | Mirrored across 4 config files; already contains aliases for deleted modules | Four aliases |
| **`ServiceAbstract<T>` CRUD base classes** (§5.2) | 47 subclasses; a base-class change is a 47-service change; inherited methods nobody asked for | Explicit service methods; extract a thin base only after the third repeat |
| **~30 entities on TypeORM default table names** | Inconsistent naming baked into the schema; renaming later is a breaking migration | Explicit `@Entity('snake_case')` from the first entity |
| **Entities doubling as response schemas** (§10.4) | Couples the wire format to the table shape | Separate response DTOs |
| **Direct `EventEmitter2` injection at call sites** (§8.3) | 281 call sites; changing transport becomes a rewrite | Inject the `DOMAIN_EVENT_BUS` port |
| **No outbox / no durable events** (§8.6) | Crash-loses events silently; the gap is only safe because BullMQ and Temporal cover it | Use the port, document the gap, add an outbox adapter when needed |
| **Stale `docs/architecture/ARCHITECTURE.md`** | Its module map lists modules that no longer exist and omits most current ones | Make doc accuracy a review checklist item, or generate the module map in CI |
| **`noImplicitAny: false`** | Inherited boilerplate default; a permanent type-safety hole | Turn it on |
| **Mixing class-validator and Zod for API validation** | Two validation idioms in one codebase | One for HTTP DTOs, one for messaging payloads, never both per layer |
| **Loki log shipping from day one** | Operational surface before you have the problem | Structured JSON to stdout |
| **Flat module namespace with no barrel convention** | Without `index.ts` per module there is no enforceable public API | `index.ts` per module + boundary lint rule |

**One thing that looks like debt but is not:** the absence of `@nestjs/cqrs`. No `CommandBus`, no `@CommandHandler`, no aggregate/repository ceremony. `commod-main` achieves separation with controllers, services, domain events, and explicit state machines, and it is more readable for it. **Do not introduce CQRS into this migration.** It adds indirection that has to pay for itself, and the event-port design in §8 already gives you the decoupling that is usually the stated reason for wanting it.

---

## 16. Reference implementations in `commod-main`

Copy these directly.

| Pattern | File |
| --- | --- |
| Bootstrap sequence | `commod-main/src/main.ts` |
| Root module + global provider order | `commod-main/src/app.module.ts` |
| Small self-contained module | `commod-main/src/modules/members/` |
| Large module split into sub-modules | `commod-main/src/modules/deals/deals.module.ts` |
| `-http.module` controller split | `commod-main/src/modules/listing/listing.module.ts` (comment at L32–49) |
| Event catalogue | `commod-main/src/modules/listing/events/listing.events.ts` |
| Event publish with `satisfies` | `commod-main/src/modules/listing/listing.service.ts:1375` |
| Event subscribe | `commod-main/src/modules/listing/listeners/listing-pass-cascade.listener.ts` |
| Custom repository | `commod-main/src/modules/deals/core/repositories/deal.repository.ts` |
| State machine | `commod-main/src/modules/listing/state-machine/status-transitions.ts` |
| Global exception filter | `commod-main/src/utils/filters/all-exceptions.filter.ts` |
| Error envelope | `commod-main/src/utils/errors/error-response.dto.ts` |
| Validation options | `commod-main/src/utils/validation-options.ts` |
| Config factory + env validator | `commod-main/src/config/app.config.ts` |
| Config typing | `commod-main/src/config/config.type.ts` |
| Filtering/sorting helpers | `commod-main/src/utils/api-filter-helper.ts` |
| Redis-backed throttling | `commod-main/src/utils/throttle/redis-throttler.storage.ts` |
| Realtime bridge (event → socket) | `commod-main/src/modules/deals/realtime/deal-realtime.listener.ts` |
| WS auth | `commod-main/src/utils/guards/ws/` |
| Logger with auto-context | `commod-main/src/logger/commod-logger.service.ts` |
| E2E global setup (token caching) | `commod-main/test/global-setup.ts` |
| Frozen-migration guard | `commod-main/src/database/migrations-are-frozen.spec.ts` |
| Seed generator | `commod-main/.hygen/seeds/create/` |
| ESLint flat config | `commod-main/eslint.config.mjs` |
| Swagger (multi-surface) | `commod-main/src/swagger.ts` |

---

## 17. Open questions

Answer these before Phase 1 closes:

1. **Which module is the pilot?** It must be a leaf with few inbound dependencies. Everything else copies it.
2. **Who owns migrations during the transition?** Pick one owner per table and write the map down (§2.4).
3. **What is the route-demuxer?** nginx, traefik, or the load balancer. Decide before Phase 1 so the pilot ships behind it.
4. **Do you need durable events?** If yes, budget the outbox adapter in Phase 2 rather than discovering the need in production (§8.6).
5. **Is there a Temporal need?** Only if a workflow is genuinely multi-step and long-running. Do not adopt it pre-emptively.
6. **What is the decommission date for Express?** A strangler without an end date becomes two permanently maintained services.
