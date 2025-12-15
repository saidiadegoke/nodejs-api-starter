# Multi-stage build for Node.js API
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package.json ./
COPY package-lock.json* ./

# Install dependencies - use npm install if no lockfile exists
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev; \
    else \
      npm install --only=production; \
    fi && \
    npm cache clean --force

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

EXPOSE 5010

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5010/health || exit 1

CMD ["npm", "start"]