# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
RUN corepack enable && corepack prepare pnpm@9.12.1 --activate
RUN pnpm install --filter @fortress-fund/api... --frozen-lockfile=false

FROM deps AS build
COPY . .
RUN pnpm --filter @fortress-fund/api prisma generate
RUN pnpm --filter @fortress-fund/api build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S nodejs && adduser -S nestjs -G nodejs

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/prisma ./apps/api/prisma

USER nestjs
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
