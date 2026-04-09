# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

FROM base AS builder
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN --mount=type=cache,target=/root/.npm \
    npm run prisma:generate && \
    npm run build

FROM base AS engine-builder
COPY --chown=nodejs:nodejs prisma ./prisma
RUN --mount=type=cache,target=/root/.npm \
    npm run prisma:generate

FROM deps AS prod-deps
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts

FROM base AS production
ENV NODE_ENV=production
WORKDIR /app

COPY --from=prod-deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma
COPY --from=engine-builder --chown=nodejs:nodejs /app/node_modules/.prisma/client ./node_modules/.prisma/client
COPY --chown=nodejs:nodejs package.json ./
COPY --chown=nodejs:nodejs prisma/migrations ./prisma/migrations

USER nodejs
EXPOSE 3000
CMD ["node", "dist/app.js"]  # Или dist/index.js, в зависимости от вашего app.ts