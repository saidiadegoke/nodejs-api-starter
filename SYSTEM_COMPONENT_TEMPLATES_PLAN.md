# System Component Templates Implementation Plan

## Overview

This document outlines all system component templates to be implemented in `smartstore-app`. System components are React implementations that serve as the foundation for custom and composite components.

**Flow**: `smartstore-app` (React impl) → `smartstore-api` (registry) → `smartstore-web` (management)

## Component Types

**Important**: All system components are **standalone React components** with no dependencies on each other. Each component is independently implemented in `smartstore-app/components/smartstore/[name]/index.tsx`.

### 1. **Basic Components** (Simple Config)
Simple components with straightforward configuration. They accept `data` and `settings` props for content and behavior.

**Structure**:
```typescript
interface BasicComponentProps {
  data: { ... } // Component content/configuration
  settings?: { ... } // Behavioral settings
  styles?: React.CSSProperties
  blockId?: string
  blockType?: string
}
```

**Examples**: Text, Image, Video, Spacer, Divider

### 2. **Complex Components** (Rich Config for Templates)
Complex components with extensive configuration options that enable multiple template variants. They are still standalone React components, but their rich config allows creating many different visual/thematic variations.

**Structure**:
```typescript
interface ComplexComponentProps {
  data: { 
    // Rich configuration for theming/variants
    template?: string // Template variant name
    layout?: LayoutConfig // Layout options
    theme?: ThemeConfig // Theming options
    ...extensiveConfig // Many configurable properties
  }
  settings?: { ... }
  styles?: React.CSSProperties
  blockId?: string
  blockType?: string
}
```

**Key Point**: Complex components don't depend on other components. Instead, they have:
- **Rich configuration options** for layout, styling, theming
- **Template variants** (e.g., `hero-center`, `hero-left`, `hero-split`)
- **Flexible theming** (colors, spacing, typography, etc.)

This allows creating many template variations from a single component implementation.

**Examples**: Hero (with variants: center, left, split, minimal), TopNav (with variants: transparent, sticky, centered), Footer (with variants: minimal, multi-column, dark)

## Component List by Category

### Category 1: Content Components (Basic)
Simple content display components with configuration.

#### 1.1 Text
- **Type**: Basic
- **Location**: `components/smartstore/text/index.tsx` ✅ (Already implemented)
- **Config**: 
  - `data`: `{ heading?, subheading?, text?, alignment?, size?, color?, tagType? }`
  - `settings`: `{ richText?, allowHtml?, maxLength? }`
- **Priority**: ✅ Done
- **Notes**: Currently supports heading/subheading/text. Tag type (p, h1-h6, div, span) configuration pending.

#### 1.2 Image
- **Type**: Basic
- **Location**: `components/smartstore/image/index.tsx`
- **Config**:
  - `data`: `{ src, alt, caption?, width?, height?, objectFit?, linkUrl? }`
  - `settings`: `{ lazyLoad?, placeholder?, aspectRatio? }`
- **Priority**: High (P0)
- **Use Cases**: Single image with optional caption and link

#### 1.3 Video
- **Type**: Basic
- **Location**: `components/smartstore/video/index.tsx`
- **Config**:
  - `data`: `{ src, provider? (youtube/vimeo/self-hosted), videoId?, poster?, autoplay?, loop?, muted?, controls? }`
  - `settings`: `{ aspectRatio?, maxWidth? }`
- **Priority**: Medium (P1)
- **Use Cases**: YouTube/Vimeo embeds, self-hosted videos

#### 1.4 Code Block
- **Type**: Basic
- **Location**: `components/smartstore/code/index.tsx`
- **Config**:
  - `data`: `{ code, language? (html/css/js/ts/json), theme?, showLineNumbers? }`
  - `settings`: `{ copyable?, editable? }`
- **Priority**: Low (P2)
- **Use Cases**: Syntax-highlighted code snippets, custom HTML/CSS/JS

#### 1.5 Spacer
- **Type**: Basic
- **Location**: `components/smartstore/spacer/index.tsx`
- **Config**:
  - `data`: `{ height?, width?, responsive? { mobile?, tablet?, desktop? } }`
  - `settings`: `{ unit? (px/rem/vh) }`
- **Priority**: Medium (P1)
- **Use Cases**: Vertical/horizontal spacing between blocks

#### 1.6 Divider
- **Type**: Basic
- **Location**: `components/smartstore/divider/index.tsx`
- **Config**:
  - `data`: `{ style? (solid/dashed/dotted), color?, thickness?, width? }`
  - `settings`: `{ orientation? (horizontal/vertical) }`
- **Priority**: Low (P2)
- **Use Cases**: Visual separators between sections

### Category 2: Navigation Components (Complex)
Navigation components that manage multiple items and layouts.

#### 2.1 TopNav (Top Navigation)
- **Type**: Complex
- **Location**: `components/smartstore/topnav/index.tsx`
- **Config**:
  - `data`: `{ logo?, logoUrl?, links?: [{ label, url, target?, icon? }], ctaButton?, sticky?, transparent?, template? (default/centered/minimal/transparent), theme? (light/dark/custom) }`
  - `settings`: `{ mobileMenuStyle? (drawer/accordion), breakpoint?, position? (static/fixed/sticky) }`
- **Template Variants**: `default`, `centered`, `minimal`, `transparent`, `sticky`, `split` (logo left, nav right)
- **Priority**: High (P0)
- **Use Cases**: Main site navigation header with multiple style options

#### 2.2 Footer
- **Type**: Complex
- **Location**: `components/smartstore/footer/index.tsx`
- **Config**:
  - `data`: `{ logo?, columns?: [{ title, links: [{ label, url }] }], socialLinks?, copyright?, template? (minimal/standard/multi-column/dark), theme? (light/dark/custom), background? }`
  - `settings`: `{ columnsLayout? (2/3/4), responsive?, spacing? }`
- **Template Variants**: `minimal` (simple copyright), `standard` (logo + links), `multi-column` (organized sections), `dark` (dark theme)
- **Priority**: High (P0)
- **Use Cases**: Site footer with multiple layout and theme options

#### 2.3 Breadcrumbs
- **Type**: Basic
- **Location**: `components/smartstore/breadcrumbs/index.tsx`
- **Config**:
  - `data`: `{ items: [{ label, url }], separator? (>/|/•), showHome? }`
  - `settings`: `{ maxItems?, collapse? }`
- **Priority**: Medium (P1)
- **Use Cases**: Navigation breadcrumb trail

#### 2.4 SidebarNav
- **Type**: Complex
- **Location**: `components/smartstore/sidebarnav/index.tsx`
- **Config**:
  - `data`: `{ items: [{ label, url, icon?, children? }], collapsible?, defaultOpen?, template? (default/compact/expanded), theme? }`
  - `settings`: `{ sticky?, width?, position? (left/right) }`
- **Template Variants**: `default`, `compact` (icons only), `expanded` (always open), `minimal`
- **Priority**: Medium (P1)
- **Use Cases**: Sidebar navigation for docs, dashboards with different styles

### Category 3: Layout Components (Complex)
Components that define layout structures and regions.

#### 3.1 Container
- **Type**: Basic
- **Location**: `components/smartstore/container/index.tsx`
- **Config**:
  - `data`: `{ maxWidth?, padding?, fluid? }`
  - `settings`: `{ centered?, responsivePadding? }`
- **Priority**: Medium (P1)
- **Use Cases**: Content wrapper with max-width constraints

#### 3.2 Grid
- **Type**: Complex
- **Location**: `components/smartstore/grid/index.tsx`
- **Config**:
  - `data`: `{ columns?, gap?, items?: ComponentReference[], template? (equal/masonry/cards/list), responsive?: { mobile?, tablet?, desktop? }, spacing? }`
  - `settings`: `{ equalHeight?, alignItems?, justifyContent?, cardStyle? }`
- **Template Variants**: `equal` (equal width columns), `masonry` (Pinterest-style), `cards` (card layout), `list` (vertical list)
- **Priority**: High (P0)
- **Use Cases**: Responsive grid layouts with multiple visual styles

#### 3.3 Section
- **Type**: Complex
- **Location**: `components/smartstore/section/index.tsx`
- **Config**:
  - `data`: `{ background?, padding?, children?: ComponentReference[], template? (default/wide/boxed/full-width/alternating), theme?, spacing? }`
  - `settings`: `{ fullWidth?, backgroundImage?, overlay?, containerMaxWidth? }`
- **Template Variants**: `default`, `wide` (wider container), `boxed` (contained), `full-width` (edge-to-edge), `alternating` (alternating backgrounds)
- **Priority**: High (P0)
- **Use Cases**: Page sections with multiple layout and styling options

#### 3.4 Columns
- **Type**: Complex
- **Location**: `components/smartstore/columns/index.tsx`
- **Config**:
  - `data`: `{ columns?: [{ width?, content?: ComponentReference }], gap?, template? (equal/sidebar/content/asymmetric), responsive? }`
  - `settings`: `{ equalHeight?, reverseOnMobile?, verticalAlign? }`
- **Template Variants**: `equal` (equal width), `sidebar` (narrow + wide), `content` (main + aside), `asymmetric` (custom widths)
- **Priority**: Medium (P1)
- **Use Cases**: Multi-column layouts with different distribution patterns

### Category 4: Marketing Components (Mix)
Marketing and promotional components, both basic and complex.

#### 4.1 Hero
- **Type**: Complex
- **Location**: `components/smartstore/hero/index.tsx`
- **Config**:
  - `data`: `{ headline, subheadline?, backgroundImage?, ctaButtons?: [{ label, url, variant? }], template? (center/left/right/split/minimal/overlay), alignment?, theme? }`
  - `settings`: `{ fullHeight?, overlay?, parallax?, backgroundPosition?, contentMaxWidth? }`
- **Template Variants**: `center` (centered content), `left` (left-aligned), `right` (right-aligned), `split` (content + image side-by-side), `minimal` (simple style), `overlay` (content over image)
- **Priority**: High (P0)
- **Use Cases**: Landing page hero sections with multiple layout and style options

#### 4.2 Image Banner
- **Type**: Complex
- **Location**: `components/smartstore/imagebanner/index.tsx`
- **Config**:
  - `data`: `{ image, overlay?, content?: ComponentReference, template? (overlay/parallax/fixed/split), alignment?, height?, theme? }`
  - `settings`: `{ parallax?, fixed?, overlayOpacity?, backgroundSize?, contentPosition? }`
- **Template Variants**: `overlay` (content over image), `parallax` (parallax scroll), `fixed` (fixed background), `split` (image + content side-by-side)
- **Priority**: High (P0)
- **Use Cases**: Full-width image banners with multiple visual effects and layouts

#### 4.3 CTA (Call to Action)
- **Type**: Basic
- **Location**: `components/smartstore/cta/index.tsx`
- **Config**:
  - `data`: `{ headline, description?, buttonLabel, buttonUrl, buttonVariant?, background? }`
  - `settings`: `{ centered?, compact? }`
- **Priority**: Medium (P1)
- **Use Cases**: Standalone call-to-action blocks

#### 4.4 Features
- **Type**: Complex
- **Location**: `components/smartstore/features/index.tsx`
- **Config**:
  - `data`: `{ title?, items: [{ icon?, title, description }], template? (grid/list/cards/icons-top/icons-left), columns?, spacing? }`
  - `settings`: `{ iconStyle?, iconSize?, cardStyle?, alignment? }`
- **Template Variants**: `grid` (grid layout), `list` (vertical list), `cards` (card-style), `icons-top` (icon above text), `icons-left` (icon beside text)
- **Priority**: Medium (P1)
- **Use Cases**: Feature lists, benefit grids with multiple presentation styles

#### 4.5 Testimonials
- **Type**: Complex
- **Location**: `components/smartstore/testimonials/index.tsx`
- **Config**:
  - `data`: `{ title?, items: [{ quote, author, role?, avatar? }], template? (slider/grid/cards/quote-style), columns?, spacing? }`
  - `settings`: `{ autoplay?, showNavigation?, showPagination?, cardStyle?, showStars? }`
- **Template Variants**: `slider` (carousel), `grid` (static grid), `cards` (card layout), `quote-style` (large quote format)
- **Priority**: Medium (P1)
- **Use Cases**: Customer testimonials, reviews with different display formats

#### 4.6 Pricing
- **Type**: Complex
- **Location**: `components/smartstore/pricing/index.tsx`
- **Config**:
  - `data`: `{ title?, plans: [{ name, price, period?, features: string[], ctaLabel, ctaUrl, featured? }], template? (cards/table/minimal/featured), columns?, spacing? }`
  - `settings`: `{ highlightFeatured?, currency?, cardStyle?, showComparison? }`
- **Template Variants**: `cards` (card layout), `table` (table format), `minimal` (simple list), `featured` (highlighted plan)
- **Priority**: Low (P2)
- **Use Cases**: Pricing tables, subscription plans with multiple presentation styles

### Category 5: Form Components (Mix)
Form and input components.

#### 5.1 Form
- **Type**: Complex
- **Location**: `components/smartstore/form/index.tsx`
- **Config**:
  - `data`: `{ title?, fields: [{ type, label, name, required?, placeholder?, options? }], submitLabel, actionUrl?, method?, template? (default/inline/compact/multi-step), layout? }`
  - `settings`: `{ successMessage?, errorMessage?, redirectUrl?, fieldSpacing?, labelPosition? }`
- **Template Variants**: `default` (standard form), `inline` (horizontal layout), `compact` (minimal spacing), `multi-step` (wizard style)
- **Priority**: High (P0)
- **Use Cases**: Contact forms, newsletter signup, lead capture with different layouts

#### 5.2 Contact Form
- **Type**: Complex (Pre-configured Form template)
- **Location**: `components/smartstore/contactform/index.tsx`
- **Config**:
  - `data`: `{ fields: { name, email, message, phone?, subject? }, template? (default/compact/inline), layout? }`
  - `settings`: `{ emailTo?, subjectPrefix?, fieldOrder? }`
- **Template Variants**: `default` (standard), `compact` (minimal), `inline` (horizontal)
- **Priority**: Medium (P1)
- **Use Cases**: Standard contact form with name/email/message, pre-configured for common use

#### 5.3 Newsletter Signup
- **Type**: Complex
- **Location**: `components/smartstore/newsletter/index.tsx`
- **Config**:
  - `data`: `{ title?, description?, placeholder?, buttonLabel, template? (inline/centered/compact/split), service? (mailchimp/convertkit/custom) }`
  - `settings`: `{ apiKey?, listId?, inputStyle?, buttonStyle? }`
- **Template Variants**: `inline` (input + button inline), `centered` (centered layout), `compact` (minimal), `split` (title/description separate)
- **Priority**: Medium (P1)
- **Use Cases**: Email newsletter subscription with different layouts

### Category 6: E-commerce Components (Complex)
E-commerce specific components.

#### 6.1 Product Card
- **Type**: Complex
- **Location**: `components/smartstore/productcard/index.tsx`
- **Config**:
  - `data`: `{ image, title, price, comparePrice?, badge?, buttonLabel?, template? (default/compact/minimal/detailed), layout? }`
  - `settings`: `{ showWishlist?, showQuickView?, imageAspectRatio?, cardStyle? }`
- **Template Variants**: `default` (standard card), `compact` (minimal info), `minimal` (image + title only), `detailed` (full details)
- **Priority**: Medium (P1)
- **Use Cases**: Product display in catalogs, grids with different card styles

#### 6.2 Product Grid
- **Type**: Complex
- **Location**: `components/smartstore/productgrid/index.tsx`
- **Config**:
  - `data`: `{ title?, products: ProductReference[], template? (grid/masonry/list), columns?, filters?, spacing? }`
  - `settings`: `{ pagination?, sortOptions?, perPage?, cardTemplate? }`
- **Template Variants**: `grid` (standard grid), `masonry` (Pinterest-style), `list` (vertical list)
- **Priority**: Medium (P1)
- **Use Cases**: Product catalog pages with different layout options

#### 6.3 Cart
- **Type**: Complex
- **Location**: `components/smartstore/cart/index.tsx`
- **Config**:
  - `data`: `{ items: CartItem[], template? (sidebar/page/minimal), showShipping?, showTax?, currency? }`
  - `settings`: `{ persistCart?, checkoutUrl?, itemLayout? }`
- **Template Variants**: `sidebar` (slide-out sidebar), `page` (full page), `minimal` (compact)
- **Priority**: Low (P2)
- **Use Cases**: Shopping cart with different display formats

### Category 7: Media Components (Basic)
Media display and gallery components.

#### 7.1 Gallery
- **Type**: Complex
- **Location**: `components/smartstore/gallery/index.tsx`
- **Config**:
  - `data`: `{ images: [{ src, alt, caption? }], template? (grid/masonry/carousel/lightbox), columns?, spacing? }`
  - `settings`: `{ lightbox?, lazyLoad?, aspectRatio?, imageSize? }`
- **Template Variants**: `grid` (standard grid), `masonry` (Pinterest-style), `carousel` (slider), `lightbox` (modal gallery)
- **Priority**: Medium (P1)
- **Use Cases**: Image galleries, portfolios with multiple display modes

#### 7.2 Carousel/Slider
- **Type**: Complex
- **Location**: `components/smartstore/carousel/index.tsx`
- **Config**:
  - `data`: `{ items: ComponentReference[], template? (default/fade/coverflow/thumbnails), autoplay?, interval?, showNavigation?, showPagination? }`
  - `settings`: `{ slidesPerView?, loop?, effect? (slide/fade), transitionSpeed? }`
- **Template Variants**: `default` (standard slider), `fade` (fade transition), `coverflow` (3D effect), `thumbnails` (with thumbnail navigation)
- **Priority**: Medium (P1)
- **Use Cases**: Image sliders, content carousels with different transition effects

### Category 8: Social Components (Basic)
Social media integration components.

#### 8.1 Social Icons
- **Type**: Basic
- **Location**: `components/smartstore/socialicons/index.tsx`
- **Config**:
  - `data`: `{ platforms: [{ name, url, icon? }], size?, spacing? }`
  - `settings`: `{ openNewTab?, showLabels? }`
- **Priority**: Low (P2)
- **Use Cases**: Social media links in header/footer

#### 8.2 Social Feed
- **Type**: Complex
- **Location**: `components/smartstore/socialfeed/index.tsx`
- **Config**:
  - `data`: `{ platform? (instagram/facebook/twitter), username?, limit?, columns? }`
  - `settings`: `{ apiKey?, cacheDuration? }`
  - **Internal Components**: Social Post Cards
- **Priority**: Low (P2)
- **Use Cases**: Instagram feed, Twitter timeline

## Implementation Priority

### Phase 0: Foundation (Current) ✅
- ✅ Text

### Phase 1: Essential Layout & Navigation (P0)
**Timeline**: Weeks 1-2
1. **TopNav** - Critical for all sites
2. **Footer** - Standard on all sites
3. **Image** - Most common content type
4. **Hero** - Landing page standard
5. **Image Banner** - Common marketing component
6. **Grid** - Layout foundation
7. **Section** - Layout container
8. **Form** - Lead capture essential

### Phase 2: Content & Marketing (P1)
**Timeline**: Weeks 3-4
1. **Container** - Content wrapper
2. **Spacer** - Layout spacing
3. **Columns** - Multi-column layouts
4. **Video** - Media content
5. **CTA** - Marketing blocks
6. **Features** - Benefit sections
7. **Testimonials** - Social proof
8. **Contact Form** - Pre-configured form
9. **Newsletter** - Email capture
10. **Gallery** - Image displays
11. **Carousel** - Content sliders
12. **Breadcrumbs** - Navigation aid
13. **SidebarNav** - Secondary navigation

### Phase 3: E-commerce (P1-P2)
**Timeline**: Weeks 5-6
1. **Product Card** - Product display
2. **Product Grid** - Catalog pages
3. **Pricing** - Pricing tables (if needed)

### Phase 4: Advanced & Utilities (P2)
**Timeline**: Weeks 7-8
1. **Code Block** - Developer tools
2. **Divider** - Visual separators
3. **Social Icons** - Social links
4. **Social Feed** - Social integration
5. **Cart** - E-commerce checkout

## Component Registration Process

For each component:

1. **Implement in smartstore-app**:
   ```typescript
   // components/smartstore/[component-name]/index.tsx
   export interface [ComponentName]Props {
     data: { ... }
     settings?: { ... }
     styles?: React.CSSProperties
     blockId?: string
     blockType?: string
   }
   
   export default function [ComponentName]({ data, settings, styles, ... }: [ComponentName]Props) {
     // React implementation
   }
   ```

2. **Register in smartstore-api**:
   - Create migration or use admin endpoint
   - Add to `component_registry` table:
     ```sql
     INSERT INTO component_registry (
       name, type, component_type, category, description, config, is_system
     ) VALUES (
       '[Display Name]',
       'system',
       '[component-name]', -- Must match folder name
       '[category]',
       '[description]',
       '{ "defaultContent": {...}, "defaultSettings": {...}, "schema": {...} }',
       true
     );
     ```

3. **Update smartstore-web**:
   - Component automatically appears in System Components tab
   - Users can create custom/composite components from it

## Template Variants System

Complex components support multiple template variants via the `template` property in their `data` config. This allows creating many visual variations from a single component implementation.

### How Templates Work:
1. Component implementation handles all template variants internally
2. `template` property in `data` selects which variant to render
3. Each variant can have different layouts, styles, and behaviors
4. Users can create custom components with specific template values
5. Multiple template-based custom components can be created from one system component

### Example: Hero Component Templates
- `center` - Centered content with background
- `left` - Left-aligned content
- `right` - Right-aligned content
- `split` - Split layout (content + image side-by-side)
- `minimal` - Minimal style, no background
- `overlay` - Content overlaid on background image

### Example: Form Component Templates
- `default` - Standard vertical form layout
- `inline` - Horizontal form layout
- `compact` - Minimal spacing
- `multi-step` - Wizard-style multi-step form

### Example: Grid Component Templates
- `equal` - Equal width columns
- `masonry` - Pinterest-style masonry layout
- `cards` - Card-style grid with shadows
- `list` - Vertical list layout

## Notes

1. **Component Independence**: All system components are standalone React components with no dependencies on each other. Each is independently implemented.

2. **Component Naming**: 
   - Use kebab-case for folder names (e.g., `image-banner`, `product-card`)
   - Use camelCase for `componentType` in registry (e.g., `imageBanner`, `productCard`)

3. **Template Variants**: Complex components use the `template` property in `data` to switch between visual/thematic variants. This allows creating many template variations from a single component implementation.

4. **Rich Configuration**: Complex components have extensive configuration options (layout, theme, spacing, styling) that enable multiple template variations without code changes.

5. **Responsive**: All components should be responsive by default (mobile-first)

6. **Accessibility**: All components must follow WCAG 2.1 AA standards

7. **Performance**: Lazy loading for images, code splitting for complex components

8. **Customization**: All components should support theme customization (colors, fonts, spacing) via configuration

## Template Builder Integration

Once components are implemented:
- Appear in **System Components** tab
- Can be configured and saved as **Custom Components**
- Can be combined into **Composite Components**
- Can be used in **Pages** via Blocks
- Can be previewed via `smartstore-app` preview system

