# SmartStore-App Design Architecture

## Overview

`smartstore-app` is a Next.js microservice that serves as the rendering engine for all SmartStore sites. It provides multi-tenant site rendering, dynamic component loading, and supports both preview and production modes.

---

## Architecture Principles

### 1. Multi-Tenancy First
- Single application serves all sites
- Site identification via hostname (subdomain/custom domain)
- Isolated rendering per site
- Shared infrastructure, isolated data

### 2. Configuration-Driven
- Sites rendered based on configuration from `smartstore-api`
- No hardcoded site-specific logic
- Dynamic component loading based on site config
- Real-time configuration updates

### 3. Performance-Optimized
- Code splitting by component
- SSG for static pages
- ISR for semi-dynamic content
- Aggressive caching strategies

### 4. Component Marketplace Ready
- Dynamic component loading
- Version management
- Component isolation
- Easy to add new components

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        smartstore-app                           │
│                      (Next.js Application)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           Multi-Tenant Router Layer                       │  │
│  │  - Hostname extraction                                    │  │
│  │  - Site identification                                    │  │
│  │  - Route resolution                                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            │                                     │
│                            ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         Configuration Service Layer                       │  │
│  │  - Fetch site config from smartstore-api                 │  │
│  │  - Cache management (Redis)                              │  │
│  │  - Config validation                                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            │                                     │
│                            ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         Component Registry Service                        │  │
│  │  - Component discovery                                   │  │
│  │  - Dynamic imports                                       │  │
│  │  - Version management                                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            │                                     │
│                            ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         Rendering Engine                                  │  │
│  │  - SSR / SSG / ISR                                        │  │
│  │  - Site renderer                                          │  │
│  │  - Preview mode handler                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ API Calls
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     smartstore-api                              │
│              (Backend API - Express.js)                          │
│  - Site configurations                                          │
│  - Component registry                                           │
│  - Data API                                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
smartstore-app/
├── app/                              # Next.js App Router
│   ├── [siteSlug]/                  # Multi-tenant site routes
│   │   ├── page.tsx                 # Homepage handler
│   │   ├── [pageSlug]/
│   │   │   └── page.tsx             # Dynamic page handler
│   │   └── preview/
│   │       └── page.tsx             # Preview mode handler
│   ├── api/                         # API routes
│   │   ├── config/
│   │   │   └── [siteId]/
│   │   │       └── route.ts         # Config fetch endpoint
│   │   ├── cache/
│   │   │   └── invalidate/
│   │   │       └── route.ts         # Cache invalidation webhook
│   │   └── health/
│   │       └── route.ts             # Health check
│   └── layout.tsx                   # Root layout
│
├── lib/                              # Core libraries
│   ├── config/                      # Configuration services
│   │   ├── siteConfig.service.ts   # Site config fetching
│   │   ├── cache.service.ts        # Redis cache service
│   │   └── validation.service.ts   # Config validation
│   │
│   ├── components/                  # Component services
│   │   ├── componentRegistry.ts    # Component registry
│   │   ├── componentLoader.ts      # Dynamic component loading
│   │   └── componentMapper.ts      # Component type mapping
│   │
│   ├── rendering/                   # Rendering services
│   │   ├── siteRenderer.tsx        # Main site renderer
│   │   ├── pageRenderer.tsx        # Page renderer
│   │   └── previewRenderer.tsx     # Preview renderer
│   │
│   ├── middleware/                  # Middleware
│   │   ├── multiTenant.ts          # Multi-tenant routing
│   │   ├── siteResolver.ts         # Site identification
│   │   └── configInjector.ts       # Config injection
│   │
│   ├── utils/                       # Utilities
│   │   ├── hostname.ts             # Hostname parsing
│   │   ├── slug.ts                 # Slug utilities
│   │   └── errors.ts               # Error handling
│   │
│   └── types/                       # TypeScript types
│       ├── site.ts                 # Site types
│       ├── config.ts               # Config types
│       ├── component.ts            # Component types
│       └── api.ts                  # API types
│
├── components/                      # React components
│   ├── smartstore/                 # Official SmartStore components
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Footer.tsx
│   │   │   └── Navigation.tsx
│   │   ├── blocks/
│   │   │   ├── Hero/
│   │   │   │   ├── Hero.tsx
│   │   │   │   └── index.ts
│   │   │   ├── Text/
│   │   │   │   ├── Text.tsx
│   │   │   │   └── index.ts
│   │   │   ├── Image/
│   │   │   ├── Gallery/
│   │   │   ├── Features/
│   │   │   ├── Testimonials/
│   │   │   ├── CTA/
│   │   │   ├── Form/
│   │   │   ├── Video/
│   │   │   ├── Code/
│   │   │   ├── Spacer/
│   │   │   └── Divider/
│   │   └── ecommerce/
│   │       ├── ProductList/
│   │       ├── ProductCard/
│   │       ├── ShoppingCart/
│   │       └── Checkout/
│   │
│   └── site/                        # Site-specific components
│       ├── SiteLayout.tsx          # Site layout wrapper
│       ├── CustomizationProvider.tsx # Customization context
│       └── BlockRenderer.tsx       # Block renderer component
│
├── public/                          # Static assets
│   └── assets/                     # Shared assets
│
├── config/                          # Configuration files
│   ├── next.config.js              # Next.js config
│   ├── redis.config.ts             # Redis config
│   └── api.config.ts               # API endpoints config
│
├── middleware.ts                    # Next.js middleware
├── package.json
├── tsconfig.json
└── .env.local                      # Environment variables
```

---

## Core Services

### 1. Multi-Tenant Router

**Purpose:** Extract site identifier and route to appropriate handler

**Implementation:**
```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';
  const { siteSlug, isPreview } = parseHostname(hostname);
  
  // Rewrite to internal route
  return NextResponse.rewrite(
    new URL(`/${siteSlug}${request.nextUrl.pathname}`, request.url)
  );
}
```

**Responsibilities:**
- Extract site identifier from hostname
- Determine if preview mode
- Route to appropriate page handler
- Handle custom domains and subdomains

---

### 2. Site Configuration Service

**Purpose:** Fetch and manage site configurations

**Implementation:**
```typescript
// lib/config/siteConfig.service.ts
export class SiteConfigService {
  static async getSiteConfig(siteId: string): Promise<SiteConfig> {
    // Check cache first
    const cached = await CacheService.get(`site:config:${siteId}`);
    if (cached) return cached;
    
    // Fetch from API
    const config = await fetch(`${API_URL}/sites/${siteId}/config`);
    
    // Validate config
    const validated = ValidationService.validate(config);
    
    // Cache for 5 minutes
    await CacheService.set(`site:config:${siteId}`, validated, 300);
    
    return validated;
  }
}
```

**Responsibilities:**
- Fetch site config from `smartstore-api`
- Cache configurations (Redis)
- Validate configuration structure
- Handle config updates and invalidation

**Cache Strategy:**
- Cache key: `site:config:${siteId}`
- TTL: 5 minutes (configurable)
- Invalidation: Webhook from API on config change

---

### 3. Component Registry Service

**Purpose:** Manage component discovery and loading

**Implementation:**
```typescript
// lib/components/componentRegistry.ts
export class ComponentRegistry {
  static async getComponentsForSite(siteConfig: SiteConfig): Promise<ComponentMap> {
    const componentIds = siteConfig.requiredComponents;
    const componentMap = {};
    
    for (const componentId of componentIds) {
      const componentInfo = await fetch(`${API_URL}/components/${componentId}`);
      componentMap[componentId] = {
        path: componentInfo.path,
        version: componentInfo.version,
        props: componentInfo.defaultProps
      };
    }
    
    return componentMap;
  }
  
  static async loadComponent(componentPath: string): Promise<React.ComponentType> {
    // Dynamic import based on path
    const module = await import(`@/components/${componentPath}`);
    return module.default;
  }
}
```

**Responsibilities:**
- Identify components needed by site
- Load component metadata from API
- Dynamic component imports
- Component version management

---

### 4. Component Loader Service

**Purpose:** Dynamically load React components

**Implementation:**
```typescript
// lib/components/componentLoader.ts
export class ComponentLoader {
  private static componentCache = new Map<string, React.ComponentType>();
  
  static async loadComponent(
    type: BlockType,
    version: string
  ): Promise<React.ComponentType> {
    const cacheKey = `${type}:${version}`;
    
    // Check cache
    if (this.componentCache.has(cacheKey)) {
      return this.componentCache.get(cacheKey)!;
    }
    
    // Dynamic import
    const component = await import(
      `@/components/smartstore/blocks/${type}/v${version}`
    );
    
    // Cache component
    this.componentCache.set(cacheKey, component.default);
    
    return component.default;
  }
}
```

**Responsibilities:**
- Dynamic component loading
- Component caching
- Version management
- Error handling for missing components

---

### 5. Site Renderer

**Purpose:** Render complete site with customization

**Implementation:**
```typescript
// lib/rendering/siteRenderer.tsx
export function SiteRenderer({ 
  site, 
  page, 
  config, 
  customization 
}: SiteRendererProps) {
  return (
    <CustomizationProvider value={customization}>
      <SiteLayout site={site} customization={customization}>
        {page.content.regions ? (
          <RegionsRenderer regions={page.content.regions} />
        ) : (
          <BlocksRenderer blocks={page.content.blocks} />
        )}
      </SiteLayout>
    </CustomizationProvider>
  );
}
```

**Responsibilities:**
- Render complete site structure
- Apply customization (colors, fonts, logo)
- Render pages with layouts
- Handle regions and blocks

---

### 6. Block Renderer

**Purpose:** Render individual blocks using components

**Implementation:**
```typescript
// components/site/BlockRenderer.tsx
export function BlockRenderer({ block, components }: BlockRendererProps) {
  const Component = components[block.type];
  
  if (!Component) {
    return <FallbackBlock block={block} />;
  }
  
  return (
    <Component
      data={block.data}
      styles={block.styles}
      settings={block.settings}
    />
  );
}
```

**Responsibilities:**
- Map block types to components
- Render blocks with props
- Handle missing components gracefully
- Apply block-specific styling

---

## Data Flow

### Request Flow

```
1. User Request
   ↓
2. Multi-Tenant Middleware
   - Extract hostname
   - Identify site
   - Route to handler
   ↓
3. Page Handler (app/[siteSlug]/page.tsx)
   - Extract site slug
   - Determine page (homepage or dynamic)
   ↓
4. Site Config Service
   - Fetch site config from API (or cache)
   - Validate config
   ↓
5. Component Registry Service
   - Identify required components
   - Load component metadata
   ↓
6. Component Loader Service
   - Dynamically import components
   - Cache loaded components
   ↓
7. Site Renderer
   - Prepare props
   - Render site with components
   - Apply customization
   ↓
8. Next.js Rendering
   - SSR / SSG / ISR
   - Generate HTML
   ↓
9. Response
   - HTML + CSS + JS bundles
   - Return to client
```

### Preview Mode Flow

```
1. Preview Request (iframe)
   ↓
2. Preview Mode Handler (app/[siteSlug]/preview/page.tsx)
   - Extract preview token
   - Validate preview access
   ↓
3. Fetch Draft Config
   - Get draft version of config
   - Load draft pages
   ↓
4. Render with Preview Features
   - Preview-specific styling
   - Preview toolbar (optional)
   - Draft content visible
   ↓
5. Return Preview HTML
   - Iframe-friendly HTML
   - Preview mode indicators
```

---

## Component System Design

### Component Structure

```
components/smartstore/blocks/Hero/
├── v1.0.0/
│   ├── Hero.tsx              # Component implementation
│   ├── Hero.types.ts         # TypeScript types
│   ├── Hero.styles.ts        # Styles (if needed)
│   └── index.ts              # Export
├── v1.1.0/
│   └── ...
└── latest -> v1.1.0/         # Symlink to latest version
```

### Component Interface

```typescript
// Component Props Interface
interface BlockComponentProps {
  data: Record<string, any>;        // Block data
  styles?: Record<string, any>;     // Block styles
  settings?: Record<string, any>;   // Block settings
  siteId?: string;                  // Site context
  customization?: Customization;    // Site customization
}

// Component Export
export default function HeroBlock(props: BlockComponentProps) {
  // Component implementation
}
```

### Component Registration

Components are registered in `smartstore-api` component registry:

```json
{
  "id": "hero-v1.0.0",
  "type": "hero",
  "version": "1.0.0",
  "path": "smartstore/blocks/Hero/v1.0.0",
  "defaultData": { ... },
  "defaultStyles": { ... },
  "isDynamic": false,
  "requiresAuth": false
}
```

---

## Rendering Strategies

### 1. Static Site Generation (SSG)

**When to Use:**
- Static pages (homepage, about, etc.)
- Content that doesn't change frequently
- Best performance

**Implementation:**
```typescript
// app/[siteSlug]/page.tsx
export async function generateStaticParams() {
  // Generate static paths for all active sites
  const sites = await fetch(`${API_URL}/sites/active`);
  return sites.map(site => ({ siteSlug: site.slug }));
}

export async function generateStaticProps({ params }) {
  const config = await SiteConfigService.getSiteConfig(params.siteSlug);
  return { props: { config } };
}

export default function SitePage({ config }) {
  // Static page rendering
}
```

### 2. Incremental Static Regeneration (ISR)

**When to Use:**
- Pages that update occasionally
- Balance between performance and freshness
- Best for most pages

**Implementation:**
```typescript
export const revalidate = 3600; // Revalidate every hour

export async function generateProps({ params }) {
  const config = await SiteConfigService.getSiteConfig(params.siteSlug);
  return { props: { config } };
}
```

### 3. Server-Side Rendering (SSR)

**When to Use:**
- Dynamic content
- User-specific content
- Real-time data
- Preview mode

**Implementation:**
```typescript
export default async function SitePage({ params, searchParams }) {
  // Fetch config on each request
  const config = await SiteConfigService.getSiteConfig(params.siteSlug);
  
  // Check if preview mode
  if (searchParams.preview === 'true') {
    return <PreviewRenderer config={config} />;
  }
  
  return <SiteRenderer config={config} />;
}
```

### 4. Preview Mode

**Implementation:**
```typescript
// app/[siteSlug]/preview/page.tsx
export default async function PreviewPage({ params }) {
  const { token } = searchParams;
  
  // Validate preview token
  const isValid = await validatePreviewToken(token);
  if (!isValid) return <Unauthorized />;
  
  // Fetch draft config
  const config = await SiteConfigService.getDraftConfig(params.siteSlug);
  
  return (
    <PreviewMode>
      <SiteRenderer config={config} preview={true} />
    </PreviewMode>
  );
}
```

---

## Caching Strategy

### Multi-Level Caching

```
Level 1: CDN/Edge Cache (Vercel Edge)
  - Static assets
  - HTML pages (with ISR)
  - TTL: Based on ISR revalidate time

Level 2: Next.js Cache
  - Rendered pages
  - Component imports
  - TTL: Per-route configuration

Level 3: Redis Cache
  - Site configurations
  - Component metadata
  - TTL: 5 minutes (configurable)

Level 4: Component Cache (In-Memory)
  - Loaded React components
  - Cache until process restart
```

### Cache Invalidation

**Webhook from smartstore-api:**
```typescript
// app/api/cache/invalidate/route.ts
export async function POST(request: Request) {
  const { siteId, type } = await request.json();
  
  // Invalidate Next.js cache
  await revalidatePath(`/${siteId}`);
  
  // Invalidate Redis cache
  await CacheService.delete(`site:config:${siteId}`);
  
  // Invalidate component cache if component changed
  if (type === 'component') {
    ComponentLoader.clearCache();
  }
  
  return Response.json({ success: true });
}
```

---

## Phase-by-Phase Implementation

## Phase 1: Foundation & Core Infrastructure (Weeks 1-3)

### Goals
- Set up Next.js project structure
- Implement multi-tenant routing
- Basic configuration fetching
- Simple site rendering

### Tasks

**1.1 Project Setup**
- [ ] Initialize Next.js project with TypeScript
- [ ] Configure Next.js (app router, TypeScript, ESLint)
- [ ] Set up directory structure
- [ ] Configure environment variables
- [ ] Set up package.json with dependencies

**1.2 Multi-Tenant Routing**
- [ ] Implement hostname extraction middleware
- [ ] Create site resolver service
- [ ] Set up dynamic routing structure (`app/[siteSlug]/`)
- [ ] Handle subdomain routing
- [ ] Handle custom domain routing
- [ ] Test routing with multiple sites

**1.3 Configuration Service**
- [ ] Create site config service
- [ ] Implement API client for `smartstore-api`
- [ ] Add config validation
- [ ] Set up basic error handling
- [ ] Test config fetching

**1.4 Basic Site Renderer**
- [ ] Create site renderer component
- [ ] Implement basic page rendering
- [ ] Apply site customization (colors, fonts)
- [ ] Test with sample site config

### Deliverables
- ✅ Next.js project setup complete
- ✅ Multi-tenant routing working
- ✅ Can fetch and render sites from config
- ✅ Basic customization applied

### Dependencies
- `smartstore-api` config endpoints ready
- Redis for caching (optional in Phase 1)

---

## Phase 2: Component System & Dynamic Loading (Weeks 4-6)

### Goals
- Implement component registry
- Dynamic component loading
- Code splitting by component
- Component versioning

### Tasks

**2.1 Component Registry**
- [ ] Create component registry service
- [ ] Integrate with `smartstore-api` component registry
- [ ] Implement component metadata fetching
- [ ] Add component discovery logic
- [ ] Handle component dependencies

**2.2 Component Loader**
- [ ] Implement dynamic component imports
- [ ] Set up component caching
- [ ] Handle component versioning
- [ ] Add fallback for missing components
- [ ] Implement component loading errors

**2.3 Component Structure**
- [ ] Create component directory structure
- [ ] Migrate existing block types to React components
  - [ ] Hero component
  - [ ] Text component
  - [ ] Image component
  - [ ] Gallery component
  - [ ] Features component
  - [ ] Testimonials component
  - [ ] CTA component
  - [ ] Form component
  - [ ] Video component
  - [ ] Code component
  - [ ] Spacer component
  - [ ] Divider component

**2.4 Block Renderer**
- [ ] Create block renderer component
- [ ] Implement block-to-component mapping
- [ ] Handle block props (data, styles, settings)
- [ ] Apply block-level customization
- [ ] Test all block types

**2.5 Code Splitting**
- [ ] Configure Next.js code splitting
- [ ] Set up dynamic imports for components
- [ ] Verify bundle sizes per site
- [ ] Optimize component chunks
- [ ] Test code splitting works correctly

### Deliverables
- ✅ Component registry working
- ✅ Dynamic component loading functional
- ✅ All block types have React components
- ✅ Code splitting implemented
- ✅ Components render correctly

### Dependencies
- Component registry API in `smartstore-api`
- Component files structure ready

---

## Phase 3: Layouts & Regions (Weeks 7-8)

### Goals
- Implement layout system
- Region-based page rendering
- Responsive layout support
- Layout configuration

### Tasks

**3.1 Layout System**
- [ ] Create layout registry
- [ ] Implement layout templates (linear, regions, etc.)
- [ ] Set up layout configuration
- [ ] Store layouts in database (via API)

**3.2 Region Renderer**
- [ ] Create region renderer component
- [ ] Implement region-based page rendering
- [ ] Handle block placement in regions
- [ ] Support region-level styling

**3.3 Responsive Layouts**
- [ ] Implement responsive region visibility
- [ ] Handle mobile/tablet/desktop layouts
- [ ] Add region ordering for different breakpoints
- [ ] Test responsive behavior

**3.4 Layout Configuration UI** (if needed)
- [ ] Create layout selector
- [ ] Allow custom layout creation
- [ ] Save layouts to API

### Deliverables
- ✅ Layout system working
- ✅ Region-based rendering functional
- ✅ Responsive layouts supported
- ✅ Layouts can be configured and saved

---

## Phase 4: Rendering Modes & Preview (Weeks 9-10)

### Goals
- Implement SSR, SSG, ISR
- Preview mode functionality
- Preview iframe support
- Rendering optimization

### Tasks

**4.1 Rendering Modes**
- [ ] Implement SSG for static pages
- [ ] Implement ISR for semi-dynamic pages
- [ ] Implement SSR for dynamic pages
- [ ] Configure revalidation strategies
- [ ] Test all rendering modes

**4.2 Preview Mode**
- [ ] Create preview page handler
- [ ] Implement preview token validation
- [ ] Fetch draft configurations
- [ ] Render preview with draft content
- [ ] Add preview mode indicators

**4.3 Iframe Preview**
- [ ] Optimize for iframe rendering
- [ ] Handle preview in dashboard
- [ ] Add preview toolbar (optional)
- [ ] Test iframe integration

**4.4 Rendering Optimization**
- [ ] Optimize bundle sizes
- [ ] Implement lazy loading
- [ ] Add image optimization
- [ ] Font optimization
- [ ] CSS optimization

### Deliverables
- ✅ All rendering modes working
- ✅ Preview mode functional
- ✅ Iframe preview working
- ✅ Optimized rendering performance

---

## Phase 5: Advanced Features (Weeks 11-12)

### Goals
- Advanced caching strategies
- Performance optimizations
- Error handling and monitoring
- Production readiness

### Tasks

**5.1 Advanced Caching**
- [ ] Implement Redis caching
- [ ] Multi-level cache strategy
- [ ] Cache invalidation webhooks
- [ ] Cache warming strategies
- [ ] Monitor cache hit rates

**5.2 Performance Optimization**
- [ ] Bundle analysis and optimization
- [ ] Image optimization with Next.js Image
- [ ] Font optimization
- [ ] CSS-in-JS or CSS modules optimization
- [ ] Database query optimization (if any)

**5.3 Error Handling**
- [ ] Graceful error boundaries
- [ ] Fallback components
- [ ] Error logging and monitoring
- [ ] User-friendly error pages
- [ ] Error recovery strategies

**5.4 Monitoring & Analytics**
- [ ] Set up application monitoring (Sentry, LogRocket)
- [ ] Performance monitoring
- [ ] Error tracking
- [ ] Analytics integration (optional)
- [ ] Health check endpoints

**5.5 Production Deployment**
- [ ] Set up deployment pipeline
- [ ] Environment configuration
- [ ] CI/CD pipeline
- [ ] Production testing
- [ ] Documentation

### Deliverables
- ✅ Production-ready application
- ✅ Monitoring and error tracking
- ✅ Optimized performance
- ✅ Complete documentation

---

## Phase 6: Component Marketplace Foundation (Weeks 13-14)

### Goals
- Third-party component support
- Component versioning system
- Component marketplace infrastructure
- Component security

### Tasks

**6.1 Third-Party Components**
- [ ] Component sandboxing
- [ ] Security validation
- [ ] Component isolation
- [ ] Third-party component loading
- [ ] Component permission system

**6.2 Component Versioning**
- [ ] Version management system
- [ ] Component version updates
- [ ] Backward compatibility
- [ ] Version rollback

**6.3 Component Marketplace**
- [ ] Component discovery API
- [ ] Component search and filtering
- [ ] Component rating system (future)
- [ ] Component licensing system

**6.4 Component Security**
- [ ] Component validation
- [ ] Security scanning
- [ ] Sandbox execution
- [ ] Access control

### Deliverables
- ✅ Third-party component support
- ✅ Component versioning working
- ✅ Component marketplace foundation
- ✅ Security measures in place

---

## Technical Stack

### Core Dependencies

```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "zod": "^3.22.0",
    "redis": "^4.6.0",
    "ioredis": "^5.3.0"
  },
  "devDependencies": {
    "@types/react-dom": "^18.2.0",
    "eslint": "^8.50.0",
    "eslint-config-next": "^14.0.0",
    "@next/bundle-analyzer": "^14.0.0"
  }
}
```

### Infrastructure

- **Hosting:** Vercel (recommended) or self-hosted
- **Database:** PostgreSQL (via smartstore-api)
- **Cache:** Redis (for config and component caching)
- **CDN:** Vercel Edge Network (included) or Cloudflare
- **Monitoring:** Sentry, LogRocket, or similar

---

## Environment Variables

```env
# API Configuration
SMARTSTORE_API_URL=http://localhost:4050
SMARTSTORE_API_KEY=your-api-key

# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=

# Environment
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Feature Flags
ENABLE_PREVIEW=true
ENABLE_ANALYTICS=false
```

---

## API Integration

### Required Endpoints from smartstore-api

```typescript
// Site Configuration
GET /sites/by-slug/:slug           // Get site by slug
GET /sites/:id/config              // Get site config
GET /sites/:id/config/draft        // Get draft config (for preview)

// Components
GET /components                    // List all components
GET /components/:id                // Get component details
GET /sites/:id/components          // Get components for site

// Pages
GET /sites/:id/pages               // Get site pages
GET /sites/:id/pages/:pageId       // Get specific page

// Cache Invalidation
POST /cache/invalidate             // Invalidate cache (webhook)
```

---

## Success Metrics

### Performance Targets

- **First Load (SSR):** < 2 seconds
- **Subsequent Loads (Cached):** < 500ms
- **Preview Mode:** < 1 second
- **Static Pages (SSG):** < 200ms
- **Bundle Size:** < 200KB initial bundle

### Reliability Targets

- **Uptime:** > 99.9%
- **Error Rate:** < 0.1%
- **Cache Hit Rate:** > 80%

### Scalability Targets

- **Sites Supported:** 1000+ sites per instance
- **Concurrent Requests:** 1000+ req/s
- **Component Loading:** < 100ms per component

---

## Risk Mitigation

### Technical Risks

**Risk 1: Component Loading Performance**
- **Mitigation:** Aggressive caching, lazy loading, code splitting
- **Monitoring:** Track component load times

**Risk 2: Config Fetching Latency**
- **Mitigation:** Redis caching, CDN caching, ISR
- **Monitoring:** Track config fetch times

**Risk 3: Multi-Tenant Security**
- **Mitigation:** Site isolation, config validation, security audits
- **Monitoring:** Security scanning, access logs

**Risk 4: Scalability Issues**
- **Mitigation:** Horizontal scaling, edge deployment, caching
- **Monitoring:** Performance metrics, load testing

### Business Risks

**Risk 1: Deployment Complexity**
- **Mitigation:** Automated CI/CD, blue-green deployments, rollback plan

**Risk 2: Cost Overruns**
- **Mitigation:** Cost monitoring, optimization, usage-based pricing

---

## Migration Plan

### From Current to smartstore-app

**Week 1-2: Parallel Deployment**
- Deploy `smartstore-app` to staging
- Test with sample sites
- Validate functionality

**Week 3-4: Preview Migration**
- Route all previews to `smartstore-app`
- Keep current system for public sites
- Monitor and fix issues

**Week 5-6: Gradual Public Migration**
- Route 10% of traffic to `smartstore-app`
- Monitor performance and errors
- Gradually increase to 50%, 100%

**Week 7-8: Full Migration**
- All traffic on `smartstore-app`
- Decommission old rendering system
- Optimize and improve

---

## Conclusion

This architecture provides a scalable, performant, and maintainable solution for rendering SmartStore sites. The phased approach allows for gradual implementation and validation at each stage, reducing risk while building toward a comprehensive solution.

**Key Benefits:**
- ✅ Separation of concerns (rendering vs. API)
- ✅ Multi-tenant architecture
- ✅ Component marketplace ready
- ✅ Excellent performance with Next.js optimizations
- ✅ Preview mode support
- ✅ Scalable and maintainable

**Next Steps:**
1. Review and approve architecture
2. Set up Phase 1 project structure
3. Begin implementation
4. Regular reviews and adjustments


