# Multi-stage build for SmartStore API
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install curl for health checks
RUN apk add --no-cache curl

# Create app user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 apiuser

# Copy node_modules from deps stage
COPY --from=deps --chown=apiuser:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=apiuser:nodejs . .

# Create uploads directory with proper permissions
RUN mkdir -p uploads && chown -R apiuser:nodejs uploads

USER apiuser

EXPOSE 4050

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:4050/health || exit 1

CMD ["npm", "start"]
