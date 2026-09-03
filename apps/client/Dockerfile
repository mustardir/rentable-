# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/client/package.json ./apps/client/package.json
RUN corepack enable && corepack prepare pnpm@9.12.1 --activate
RUN pnpm install --filter client... --frozen-lockfile

FROM deps AS build
COPY apps/client ./apps/client
RUN pnpm --filter client build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=build --chown=nextjs:nodejs /app/apps/client/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/client/.next/static ./apps/client/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/client/public ./apps/client/public

USER nextjs
EXPOSE 3000
CMD ["node", "apps/client/server.js"]
