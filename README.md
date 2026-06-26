# Fortress Fund

A modern production-grade digital banking, savings, investment, and wealth management platform.

## Technology Stack

- Next.js 15
- TypeScript
- Tailwind CSS
- NestJS
- PostgreSQL
- Prisma
- Redis
- Docker
- Nginx
- Prometheus
- Grafana

## Monorepo Structure

- `apps/` - frontend and backend applications
- `packages/` - shared libraries and modules
- `infrastructure/` - infrastructure as code and service configurations
- `docs/` - architecture and product documentation
- `scripts/` - operational and automation scripts

## Domain

Production domain: `https://fortress-fund.com`

## Infrastructure (Milestone 1)

The repository includes production-style container orchestration and observability setup:

- `docker-compose.yml`
  - Reverse proxy with Nginx
  - App services (`client`, `admin`, `api`)
  - Stateful services (`postgres`, `redis`)
  - Monitoring stack (`prometheus`, `grafana`)
- `infrastructure/nginx/`
  - Main Nginx runtime config
  - Proxy/site config routing `fortress-fund.com` traffic
- `infrastructure/prometheus/`
  - Prometheus scrape config
- `infrastructure/grafana/`
  - Provisioned Prometheus datasource
  - Provisioned dashboard provider
  - Default platform overview dashboard

## Local Run (Infrastructure)

1. Copy environment values if needed:

```bash
cp .env.example .env
```

2. Start the infrastructure and app stack:

```bash
docker compose up -d --build
```

3. Verify service endpoints:

- App: `http://localhost/`
- Admin: `http://localhost/admin/`
- API: `http://localhost/api/`
- Prometheus: `http://localhost/prometheus/`
- Grafana: `http://localhost/grafana/`

## Notes

- This milestone focuses on infrastructure and observability foundations while preserving the existing monorepo layout.
- Subsequent milestones will implement backend auth/ledger services and frontend fintech product experiences.
