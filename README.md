# ZIMT CLI

The secret ingredient for production-ready NestJS applications.

---

## Why it exists

Bootstrapping a NestJS project with Prisma, Docker, JWT auth, and proper RBAC involves 30+ files and hours of wiring. ZIMT handles all of it in seconds, then gets out of your way. Start blank, add what you need.

---

## Quick start

```bash
npm install -g zimt-cli

zimt init my-api
cd my-api
cp .env.example .env
npm run prisma:migrate
npm run start:dev
```

Server running at `http://localhost:4000`. Health check: `GET /health`.

---

## Commands

| Command | What it does | Flags |
|---------|-------------|-------|
| `zimt init [name]` | Create a blank NestJS project | `--pm npm\|yarn\|pnpm\|bun` |
| `zimt new [name]` | Alias for `zimt init` | `--pm` |
| `zimt auth` | Add JWT auth, user module, RBAC to existing project | — |
| `zimt create auth` | Alias for `zimt auth` | — |
| `zimt generate <name>` | Generate CRUD resource from a name | `--parent <resource>` |
| `zimt g <name>` | Alias for `zimt generate` | `--parent` |
| `zimt p <name>` | Alias for `zimt generate` | `--parent` |
| `zimt generate create "<SQL>"` | Generate resource from SQL CREATE TABLE | `--parent <resource>` |
| `zimt p create "<SQL>"` | Alias for SQL generation | `--parent` |
| `zimt r <entity>` | Add Redis cache-aside layer to a service | `--ttl <seconds>` |
| `zimt cache <entity>` | Alias for `zimt r` | `--ttl` |

---

## Generated project structure

After `zimt init my-api`:

```
my-api/
├── src/
│   ├── app.module.ts       # Root module (PrismaModule imported)
│   ├── app.controller.ts   # GET /health
│   ├── app.service.ts
│   ├── main.ts
│   └── prisma/
│       ├── prisma.module.ts
│       └── prisma.service.ts
├── prisma/
│   └── schema.prisma
├── Dockerfile
├── docker-compose.yml      # PostgreSQL 16
├── .env.example
└── package.json
```

After `zimt auth`:

```
src/
├── auth/               # JWT strategy, guards, decorators, login/signup/refresh
├── user/               # User CRUD, RBAC-protected endpoints
├── crypto/             # bcrypt helpers
├── db/user/            # Repository interface + Prisma implementation
└── logger/             # File logger + request logging middleware
```

After `zimt generate orders` or `zimt p create "CREATE TABLE orders (...)"`:

```
src/orders/
├── orders.module.ts
├── orders.controller.ts
├── orders.service.ts
├── orders.repository.ts
├── orders.repository.interface.ts
├── dto/
│   ├── create-orders.dto.ts
│   └── update-orders.dto.ts
├── entities/
│   └── orders.entity.ts
├── orders.service.spec.ts
└── orders.controller.spec.ts
test/orders/
└── orders.e2e-spec.ts
```

---

## Package manager support

Auto-detected from lockfile in the current directory:

| Lockfile | Detected PM |
|----------|-------------|
| `bun.lockb` | bun |
| `pnpm-lock.yaml` | pnpm |
| `yarn.lock` | yarn |
| `package-lock.json` | npm |

Override with `--pm`: `zimt init my-app --pm pnpm`

---

## Requirements

- Node.js ≥ 20.0.0
- One of: npm, yarn, pnpm, or bun
- Docker (optional, for local database)
- PostgreSQL (via Docker or external)

---

## Contributing

Issues and PRs welcome at [github.com/olucens/zimt-cli](https://github.com/olucens/zimt-cli).

Set `NPM_TOKEN` in your repository secrets for automated npm publishing via CI/CD.
