# Ledger Immutability Checkpoint — Test Database Setup

## Prerequisites

- Docker and Docker Compose installed
- Node.js 18+ and npm

## Quick Start

### 1. Start the PostgreSQL Test Database

```bash
# Start the isolated test database (port 5433)
docker-compose -f docker-compose.test.yml up -d

# Verify it's running and healthy
docker-compose -f docker-compose.test.yml ps
```

**Expected output:**
```
NAME                      IMAGE              STATUS
fortress_postgres_test    postgres:16-alpine  Up (healthy)
```

### 2. Run Database Migrations

The migrations include the **Fortress Guard triggers** for ledger immutability.

```bash
cd apps/api

# Load environment
export $(cat ../../.env.test | xargs)

# Run migrations against test database
npm run prisma:migrate:deploy
```

### 3. Run the Checkpoint Tests

```bash
cd apps/api

# Load test environment
export $(cat ../../.env.test | xargs)

# Run the immutability checkpoint tests
npm test -- --runInBand ledger-immutability.integration.spec.ts
```

**Expected output (all 12 tests pass):**
```
PASS  test/ledger-immutability.integration.spec.ts
  Fortress Ledger Immutability (PostgreSQL Triggers)
    ✓ rejects UPDATE to posted journal entry fields (description)
    ✓ rejects UPDATE to posted journal entry fields (reference)
    ✓ rejects UPDATE to posted journal entry fields (currency)
    ✓ rejects UPDATE to posted journal entry fields (status)
    ✓ rejects DELETE of posted journal entry
    ✓ rejects UPDATE to journal line (direction)
    ✓ rejects UPDATE to journal line (amountKobo)
    ✓ rejects DELETE of journal line
    ✓ allows legitimate reversal: sets reversedById once
    ✓ rejects second reversal: reversedById cannot be set twice
    ✓ rejects reversal of already-reversed entry
    ✓ rolls back entire transaction if trigger constraint fails

Tests: 12 passed, 12 total
Test Suites: 1 passed, 1 total
```

### 4. Clean Up

```bash
# Stop and remove the test database
docker-compose -f docker-compose.test.yml down -v
```

---

## What Gets Tested

The **Fortress Guard PostgreSQL triggers** enforce:

1. **Journal Entry Immutability** — No edits to posted entries (except `reversedById`)
2. **Journal Entry Protection** — No deletes of posted entries
3. **Journal Line Immutability** — No edits or deletes of journal lines
4. **Reversal Protocol** — Only 1:1 reversal links allowed (original ↔ reversal entry)
5. **Transaction Safety** — Full rollback on constraint violation

---

## Test Database Details

| Property | Value |
|----------|-------|
| Host | `localhost` |
| Port | `5433` |
| User | `fortress` |
| Password | `fortress_test_password` |
| Database | `fortress_test` |
| Container | `fortress_postgres_test` |
| Network | `fortress_test` |

---

## Troubleshooting

### Database connection refused

```bash
# Check if container is running
docker ps | grep fortress_postgres_test

# View container logs
docker logs fortress_postgres_test

# Restart the container
docker-compose -f docker-compose.test.yml restart postgres_test
```

### Migrations fail

```bash
# Ensure migrations are up-to-date
cd apps/api
npm run prisma:generate
npm run prisma:migrate:deploy
```

### Tests timeout

Increase the timeout in `.env.test`:
```bash
TEST_TIMEOUT=60000  # 60 seconds
```

---

## Next Steps

Once checkpoint tests pass:

1. ✅ Update issue #23 with passing status
2. 🔄 Create issue #24 for FX/Investment phase
3. 📝 Document the checkpoint completion
