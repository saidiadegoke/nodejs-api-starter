# Site Rendering Architecture Analysis

## Overview

This document analyzes different architectural approaches for rendering and serving sites in the SmartStore platform. The analysis compares the proposed Next.js microservice approach (`smartstore-app`) with alternative architectures.

---

## Proposed Architecture: Next.js Microservice (`smartstore-app`)

### Concept

A separate Next.js microservice that:
- Serves all sites from a single application
- Dynamically renders sites based on configuration from `smartstore-api`
- Bundles only components needed by each site (code splitting)
- Used for both previews (via iframe) and public site serving
- Multi-tenant architecture - one app, many sites

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     smartstore-web                           │
│              (Dashboard - Next.js App)                       │
│  - Template builder                                          │
│  - Site management                                           │
│  - Configuration UI                                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ API Calls
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    smartstore-api                            │
│              (Backend API - Express.js)                      │
│  - Site configurations                                       │
│  - Template definitions                                      │
│  - Component registry                                        │
│  - Data API                                                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ Configuration API
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   smartstore-app                             │
│           (Site Renderer - Next.js App)                      │
│  - Multi-tenant site rendering                              │
│  - Component bundling (code splitting)                      │
│  - SSR/SSG based on site config                             │
│  - Preview mode (iframe)                                    │
│  - Public site serving                                      │
└─────────────────────────────────────────────────────────────┘
```

### Technical Implementation

**Multi-Tenant Routing:**
```typescript
// smartstore-app/app/[siteSlug]/page.tsx
export default async function SitePage({ params }) {
  const { siteSlug } = params;
  
  // Fetch site config from smartstore-api
  const siteConfig = await fetch(`${API_URL}/sites/by-slug/${siteSlug}`);
  const { template, customization, pages, components } = siteConfig;
  
  // Dynamically import only needed components
  const componentMap = await loadComponents(components);
  
  // Render page with site-specific config
  return <SiteRenderer 
    site={siteConfig} 
    template={template} 
    customization={customization}
    components={componentMap}
  />;
}
```

**Component Bundling:**
- Next.js dynamic imports for code splitting
- Only bundle components used by the site
- Lazy loading for better performance
- Component registry in `smartstore-api` tracks which components each site uses

**Configuration Flow:**
1. User configures site in `smartstore-web` dashboard
2. Configuration saved to `smartstore-api`
3. `smartstore-app` fetches config on request
4. `smartstore-app` renders with appropriate components and styling

---

## Alternative Architectures

### Option 1: Current Approach (HTML String Rendering)

**Current Implementation:**
- Blocks rendered as HTML strings in `smartstore-api`
- No React components
- No client-side interactivity
- Server-side only

**Pros:**
- ✅ Simple implementation
- ✅ No separate service needed
- ✅ Fast for static content
- ✅ Works with current architecture

**Cons:**
- ❌ No dynamic components
- ❌ No interactivity
- ❌ No component marketplace
- ❌ Limited extensibility
- ❌ Not scalable for complex sites

**Verdict:** ❌ Not suitable for long-term goals

---

### Option 2: React SSR in API Service

**Concept:**
- Add React SSR to `smartstore-api`
- Render React components server-side
- Generate HTML + JavaScript bundle
- Client-side hydration

**Architecture:**
```
smartstore-api (Express.js + React SSR)
  ├── React SSR Service
  ├── Bundle Generation
  └── Component Registry
```

**Pros:**
- ✅ No separate service needed
- ✅ Everything in one codebase
- ✅ Simpler deployment
- ✅ Direct API access

**Cons:**
- ❌ Mixing concerns (API + rendering)
- ❌ API service becomes heavier
- ❌ Scaling rendering separately from API is harder
- ❌ Next.js features not available (SSG, ISR, etc.)
- ❌ More complex bundle management

**Verdict:** ⚠️ Possible but not optimal

---

### Option 3: Next.js Microservice (`smartstore-app`) - PROPOSED

**Concept:**
- Separate Next.js app for site rendering
- Multi-tenant architecture
- Dynamic component loading
- Configuration-driven rendering

**Pros:**
- ✅ **Separation of Concerns** - Rendering separate from API
- ✅ **Next.js Benefits** - SSG, ISR, Image optimization, etc.
- ✅ **Code Splitting** - Bundle only needed components
- ✅ **Independent Scaling** - Scale rendering separately from API
- ✅ **Better Performance** - Next.js optimizations
- ✅ **Preview Support** - Easy iframe integration
- ✅ **Component Marketplace** - Easy to add new components
- ✅ **SSG/ISR** - Static generation for better performance
- ✅ **Multi-tenant** - Single app serves all sites
- ✅ **Flexible Routing** - Next.js App Router for flexible routes

**Cons:**
- ⚠️ **Additional Service** - More infrastructure to manage
- ⚠️ **Configuration Fetching** - Must fetch config on each request (can be cached)
- ⚠️ **Deployment Complexity** - Another service to deploy
- ⚠️ **Inter-service Communication** - Must communicate with API

**Mitigations:**
- Configuration caching (Redis) for fast access
- ISR (Incremental Static Regeneration) for better performance
- Edge functions for global distribution
- CDN for static assets

**Verdict:** ✅ **RECOMMENDED** - Best balance of features and scalability

---

### Option 4: Separate Next.js App Per Site

**Concept:**
- Each site gets its own Next.js application
- Generated and deployed separately
- Full isolation

**Pros:**
- ✅ Complete isolation between sites
- ✅ Independent deployments
- ✅ No shared resources
- ✅ Maximum flexibility

**Cons:**
- ❌ **Too Many Services** - One app per site is unmanageable
- ❌ **Deployment Overhead** - Massive deployment complexity
- ❌ **Resource Intensive** - Each app needs resources
- ❌ **Update Complexity** - Updating components requires redeploying all sites
- ❌ **Cost** - Much more expensive

**Verdict:** ❌ Not practical for multi-tenant SaaS

---

### Option 5: Static Site Generation (SSG) + CDN

**Concept:**
- Generate static HTML files for each site
- Deploy to CDN (CloudFront, Cloudflare)
- Rebuild on configuration changes

**Architecture:**
```
Configuration Change → Trigger Build → Generate Static Site → Deploy to CDN
```

**Pros:**
- ✅ **Excellent Performance** - Static files from CDN
- ✅ **Low Cost** - CDN is cheap
- ✅ **Global Distribution** - CDN edge locations
- ✅ **Scalability** - CDN handles traffic

**Cons:**
- ❌ **Dynamic Content Issues** - Hard to handle dynamic components
- ❌ **Build Time** - Must rebuild on every change
- ❌ **No Real-time Updates** - Changes require rebuild
- ❌ **Preview Complexity** - Hard to preview changes instantly
- ❌ **Dynamic Components** - Can't support interactive components well

**Hybrid Approach:**
- SSG for static pages
- API routes for dynamic content
- Next.js ISR for best of both worlds

**Verdict:** ⚠️ Good for static sites, but limiting for dynamic features

---

### Option 6: Edge Functions / Serverless Rendering

**Concept:**
- Use edge functions (Cloudflare Workers, Vercel Edge, AWS Lambda@Edge)
- Render sites at the edge
- Distributed globally

**Pros:**
- ✅ **Global Distribution** - Render close to users
- ✅ **Low Latency** - Edge locations worldwide
- ✅ **Auto-scaling** - Serverless scaling
- ✅ **Cost-effective** - Pay per request

**Cons:**
- ⚠️ **Runtime Limitations** - Edge functions have limits
- ⚠️ **Component Bundling** - Harder to bundle components at edge
- ⚠️ **Cold Starts** - Possible latency on cold starts
- ⚠️ **Debugging** - Harder to debug edge functions
- ⚠️ **Vendor Lock-in** - Tied to specific edge provider

**Verdict:** ⚠️ Good for specific use cases, but adds complexity

---

## Detailed Comparison

### Feature Comparison Matrix

| Feature | HTML Strings | React SSR in API | Next.js Microservice | SSG + CDN | Edge Functions |
|---------|-------------|------------------|----------------------|-----------|----------------|
| **Dynamic Components** | ❌ | ✅ | ✅ | ⚠️ | ✅ |
| **Client-Side Interactivity** | ❌ | ✅ | ✅ | ⚠️ | ✅ |
| **Component Marketplace** | ❌ | ⚠️ | ✅ | ❌ | ⚠️ |
| **Code Splitting** | ❌ | ⚠️ | ✅ | ✅ | ⚠️ |
| **Preview Support** | ⚠️ | ⚠️ | ✅ | ❌ | ⚠️ |
| **Performance** | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| **Scalability** | ⚠️ | ⚠️ | ✅ | ✅ | ✅ |
| **Deployment Complexity** | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ |
| **Development Experience** | ⚠️ | ⚠️ | ✅ | ⚠️ | ⚠️ |
| **Multi-tenant** | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| **Real-time Updates** | ✅ | ✅ | ✅ | ❌ | ✅ |
| **SEO** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Cost** | ✅ | ✅ | ⚠️ | ✅ | ✅ |

---

## Architecture Deep Dive: Next.js Microservice

### Detailed Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      smartstore-app                          │
│                    (Next.js Application)                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Multi-Tenant Router Middleware              │  │
│  │  - Extract site identifier (subdomain/custom domain) │  │
│  │  - Fetch site config from smartstore-api             │  │
│  │  - Cache config (Redis)                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Component Registry Service                │  │
│  │  - Load component list for site                      │  │
│  │  - Dynamic imports based on config                   │  │
│  │  - Component bundling (code splitting)               │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Site Renderer Component                   │  │
│  │  - Render page with site config                      │  │
│  │  - Apply customization (colors, fonts, logo)         │  │
│  │  - Server-side render or SSG                         │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                  │
│                           ▼                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Preview Mode Handler                      │  │
│  │  - Iframe-friendly rendering                         │  │
│  │  - Preview-specific features                         │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Component Loading Strategy

**Dynamic Component Imports:**
```typescript
// Component registry from API
const componentConfig = await fetch(`${API_URL}/sites/${siteId}/components`);

// Dynamic imports - only load what's needed
const componentMap = {};
for (const componentType of componentConfig.requiredComponents) {
  componentMap[componentType] = await import(
    `@/components/${componentType}/v${componentConfig.versions[componentType]}`
  );
}
```

**Next.js Code Splitting:**
- Automatic code splitting by route
- Dynamic imports for components
- Automatic chunk optimization
- Lazy loading for better performance

### Configuration Caching Strategy

**Redis Cache:**
```typescript
// Cache key: `site:config:${siteId}`
// TTL: 5 minutes (or until config changes)

const getSiteConfig = async (siteId: string) => {
  // Check cache first
  const cached = await redis.get(`site:config:${siteId}`);
  if (cached) return JSON.parse(cached);
  
  // Fetch from API
  const config = await fetch(`${API_URL}/sites/${siteId}/config`);
  
  // Cache for 5 minutes
  await redis.setex(`site:config:${siteId}`, 300, JSON.stringify(config));
  
  return config;
};
```

**Cache Invalidation:**
- Webhook from `smartstore-api` when config changes
- Manual cache invalidation API
- Time-based expiration

### Routing Strategy

**Next.js App Router:**
```
smartstore-app/
├── app/
│   ├── [siteSlug]/
│   │   ├── page.tsx          # Homepage
│   │   ├── [pageSlug]/
│   │   │   └── page.tsx      # Dynamic pages
│   │   └── preview/
│   │       └── page.tsx      # Preview mode
│   └── api/
│       └── cache/
│           └── invalidate/   # Cache invalidation webhook
```

**Multi-Tenant Routing:**
- Extract site identifier from hostname
- Load site config
- Render appropriate site

### Rendering Modes

**1. Server-Side Rendering (SSR)**
- For dynamic content
- Real-time data
- User-specific content

**2. Static Site Generation (SSG)**
- For static pages
- Better performance
- Pre-rendered HTML

**3. Incremental Static Regeneration (ISR)**
- Best of both worlds
- Static pages with periodic updates
- On-demand revalidation

**4. Preview Mode**
- Special preview rendering
- Draft content visible
- Iframe-friendly

---

## Implementation Strategy

### Phase 1: Basic Next.js App Setup

**Goals:**
- Set up Next.js app structure
- Multi-tenant routing middleware
- Basic site rendering

**Tasks:**
1. Initialize Next.js project (`smartstore-app`)
2. Set up multi-tenant routing
3. Create basic site renderer
4. Connect to `smartstore-api` for config
5. Basic component loading

**Deliverables:**
- Working Next.js app
- Can render sites from config
- Basic routing working

---

### Phase 2: Component System

**Goals:**
- Component registry integration
- Dynamic component loading
- Code splitting

**Tasks:**
1. Integrate with component registry API
2. Implement dynamic component imports
3. Set up code splitting
4. Component bundling optimization

**Deliverables:**
- Components load dynamically
- Code splitting works
- Only needed components bundled

---

### Phase 3: Rendering Modes

**Goals:**
- SSR, SSG, ISR support
- Preview mode
- Performance optimization

**Tasks:**
1. Implement SSR for dynamic pages
2. Implement SSG for static pages
3. Implement ISR for hybrid approach
4. Preview mode for iframe
5. Caching strategy

**Deliverables:**
- Multiple rendering modes
- Preview mode working
- Performance optimized

---

### Phase 4: Advanced Features

**Goals:**
- Advanced optimizations
- Edge deployment
- Monitoring

**Tasks:**
1. Image optimization
2. Font optimization
3. Edge deployment (Vercel Edge, Cloudflare)
4. Monitoring and analytics
5. Error handling

**Deliverables:**
- Fully optimized app
- Deployed to edge
- Monitoring in place

---

## Deployment Architecture

### Recommended Deployment

**Platform:** Vercel (or similar Next.js-optimized platform)

**Why Vercel:**
- Built for Next.js
- Automatic edge deployment
- ISR support out of the box
- Easy preview deployments
- Global CDN included

**Alternative Platforms:**
- AWS Amplify
- Netlify
- Self-hosted (Docker + Kubernetes)

### Infrastructure Setup

```
┌─────────────────────────────────────────────────────────┐
│                    CDN / Edge Network                    │
│         (Vercel Edge / Cloudflare / CloudFront)         │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              smartstore-app (Next.js)                    │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Edge Functions (Global Distribution)           │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Next.js Server (SSR/ISR)                       │   │
│  └─────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ API Calls
                     ▼
┌─────────────────────────────────────────────────────────┐
│              smartstore-api (Express.js)                 │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Configuration API                              │   │
│  │  Component Registry                             │   │
│  │  Data API                                       │   │
│  └─────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Redis Cache                                 │
│  - Site configs                                         │
│  - Component metadata                                   │
│  - Cache invalidation                                   │
└─────────────────────────────────────────────────────────┘
```

---

## Performance Considerations

### Optimization Strategies

**1. Configuration Caching**
- Redis cache for site configs
- 5-minute TTL (configurable)
- Cache invalidation on updates

**2. Component Bundling**
- Code splitting by component
- Lazy loading
- Tree shaking

**3. Rendering Strategy**
- SSG for static pages
- ISR for semi-static pages
- SSR only when needed

**4. Asset Optimization**
- Next.js Image component
- Font optimization
- CSS optimization

**5. Edge Caching**
- CDN caching for static assets
- Edge caching for HTML (with ISR)
- Global distribution

### Expected Performance

- **First Load:** < 2s (with SSR)
- **Subsequent Loads:** < 500ms (cached)
- **Preview Mode:** < 1s (iframe optimized)
- **Static Pages:** < 200ms (SSG)

---

## Security Considerations

### Multi-Tenant Security

**1. Site Isolation**
- Verify site ownership
- Prevent cross-site data access
- Isolated component rendering

**2. Configuration Validation**
- Validate configs from API
- Sanitize user inputs
- XSS prevention

**3. Component Security**
- Sandboxed component execution
- Component validation
- Security scanning

**4. Preview Mode Security**
- Preview tokens
- Access control
- Time-limited previews

---

## Cost Analysis

### Infrastructure Costs

**Option A: Vercel (Recommended)**
- Hobby: Free (limited)
- Pro: $20/month per user
- Enterprise: Custom pricing
- Includes: Hosting, CDN, Edge functions

**Option B: Self-Hosted**
- Server: $20-100/month (depends on traffic)
- CDN: $10-50/month (Cloudflare)
- Maintenance: Ongoing

**Option C: AWS Amplify**
- Pay per request
- ~$0.15 per GB served
- Scales automatically

### Cost Comparison (100 sites, 100K requests/month)

| Option | Monthly Cost | Notes |
|--------|-------------|-------|
| Vercel Pro | $20 | Per user, unlimited sites |
| Self-Hosted | $50-150 | Server + CDN |
| AWS Amplify | $15-30 | Pay per GB |
| Current (HTML) | $10-20 | Just API server |

**Recommendation:** Vercel Pro for simplicity and Next.js optimization

---

## Migration Path

### From Current to Next.js Microservice

**Step 1: Parallel Running**
- Deploy `smartstore-app` alongside current system
- Test with preview mode only
- Gradually migrate sites

**Step 2: Preview Migration**
- Use `smartstore-app` for all previews
- Keep current system for public sites
- Validate preview works correctly

**Step 3: Public Site Migration**
- Route public sites to `smartstore-app`
- Keep current system as fallback
- Monitor performance

**Step 4: Full Migration**
- All sites on `smartstore-app`
- Decommission old rendering
- Optimize and improve

---

## Recommendation

### ✅ Recommended: Next.js Microservice (`smartstore-app`)

**Why:**
1. **Best Feature Set** - Supports all requirements (dynamic components, preview, marketplace)
2. **Scalability** - Can scale independently from API
3. **Performance** - Next.js optimizations + SSG/ISR
4. **Developer Experience** - Modern tooling and development workflow
5. **Future-Proof** - Easy to add new features (component marketplace, etc.)
6. **Preview Support** - Perfect for iframe previews
7. **Multi-Tenant** - Single app serves all sites efficiently

**Key Benefits:**
- Separation of concerns (API vs. rendering)
- Independent scaling
- Component marketplace ready
- Better performance with Next.js optimizations
- Preview mode built-in
- Flexible rendering (SSR, SSG, ISR)

**Trade-offs:**
- Additional service to manage (mitigated by using managed platform like Vercel)
- Configuration fetching overhead (mitigated by caching)
- Slightly more complex deployment (mitigated by Next.js deployment platforms)

---

## Conclusion

The **Next.js Microservice (`smartstore-app`)** approach provides the best balance of:
- ✅ Feature completeness
- ✅ Performance
- ✅ Scalability
- ✅ Developer experience
- ✅ Future extensibility

While it adds complexity compared to rendering in the API, the benefits far outweigh the costs, especially considering:
- Component marketplace requirements
- Dynamic component needs
- Preview functionality
- Multi-tenant architecture
- Long-term scalability

**Next Steps:**
1. Review and approve this architecture
2. Set up Next.js project structure
3. Begin Phase 1 implementation
4. Test with preview mode first
5. Gradually migrate to production

---

## References

- Next.js Documentation: https://nextjs.org/docs
- Next.js Multi-Tenancy: https://nextjs.org/docs/advanced-features/multi-zones
- Next.js ISR: https://nextjs.org/docs/basic-features/data-fetching/incremental-static-regeneration
- Vercel Platform: https://vercel.com/docs
- React Server Components: https://react.dev/blog/2023/03/22/react-labs-what-we-have-been-working-on-march-2023#react-server-components


