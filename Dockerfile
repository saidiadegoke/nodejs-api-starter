# Multi-stage build for Node.js API
FROM node:23-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

# Create app user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 apiuser

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
  CMD node -e "require('http').get('http://localhost:5000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

CMD ["npm", "start"]