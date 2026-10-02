# Multi-stage build for NestJS API
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat curl
WORKDIR /app

# Stage 1: Build TypeScript NestJS code
FROM base AS builder
WORKDIR /app
COPY package.json package-lock.json* tsconfig*.json nest-cli.json* ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production runner image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5269

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 apiuser

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder --chown=apiuser:nodejs /app/dist ./dist
COPY --from=builder --chown=apiuser:nodejs /app/docs ./docs
COPY --from=builder --chown=apiuser:nodejs /app/scripts ./scripts
COPY --chown=apiuser:nodejs . .

RUN mkdir -p uploads && \
    chown -R apiuser:nodejs uploads

USER apiuser

EXPOSE 5269

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f "http://localhost:${PORT}/health" || exit 1

CMD ["npm", "start"]

