# Stellar Machina — Metering & Settlement API

This service is the off-chain engine of **Stellar Machina**. It sits between the
autonomous agents that consume metered APIs and the on-chain escrow contract that
holds funds. Agents authenticate, their requests are counted, and a settlement
step periodically drains those counters and mirrors the totals on Stellar.

The backend is a compact **Express + TypeScript** application with an in-memory
data store, designed to be easy to read end-to-end and to run with zero external
infrastructure for development.

---

## The job it does

1. **Register services** — API providers describe what they offer and how it's priced.
2. **Authenticate agents** — each incoming call is recognized by its API key.
3. **Meter usage** — successful calls increment per-agent, per-service counters.
4. **Bill and settle** — a settlement pass computes charges and drains the
   outstanding counters, producing the record that the escrow contract settles on-chain.
5. **Stay observable and controllable** — Prometheus metrics, config endpoints,
   webhooks, and an emergency pause switch.

---

## How a request flows

Every request passes through a small, explicit middleware chain (see
`src/middleware/index.ts`) before it reaches a route handler:

```
incoming request
   → assign a request id            (traceability)
   → recognize the API key          (populate the typed request context)
   → pause gate                     (if paused: allow only admin/unpause + reads)
   → route handler                  (services / usage / settlement / …)
   → structured JSON response
```

The request context is a typed `StellarMachinaRequest`, so handlers get the
resolved API key and request id without re-parsing headers.

---

## API surface

Routes are grouped by concern under `src/routes`:

| Group | File | Responsibility |
| --- | --- | --- |
| Meta | `meta.ts` | Service identity, health, and readiness |
| Services | `services.ts` | Register, price, update, and disable metered services |
| API keys | `apiKeys.ts` | Issue and revoke agent credentials |
| Usage | `usage.ts` | Record and query consumption counters |
| Events | `events.ts` | Emitted domain events (registration, settlement, disputes) |
| Config | `config.ts` | Read/update operational policy (limits, windows, allowlist) |
| Admin | `admin.ts` | Privileged operations and the pause switch |
| Webhooks | `webhooks.ts` | Outbound notifications to integrators |
| Metrics | `metrics.ts` | Prometheus exposition endpoint |
| Errors | `errors.ts` | Centralized error shapes |

---

## Observability

The service exposes Prometheus-formatted metrics for scraping, including:

- `agentpay_services_total` — registered services
- `agentpay_api_keys_total` — registered API keys
- `agentpay_usage_requests_total` — outstanding (unsettled) request counters
- `agentpay_paused` — `1` when the backend is paused, `0` otherwise

> The metric names retain their original `agentpay_` prefix on purpose. Renaming
> them is a breaking change for any dashboard or alert that scrapes them, so it's
> being handled as a separate, coordinated migration rather than folded into the
> rebrand.

---

## Data & state

State lives in `src/store/state.ts` as in-memory stores (services, API keys,
usage counters, pause flag). This keeps local development friction-free and the
billing logic transparent. It also means **state is not durable across restarts** —
wiring in a persistent store is a natural next step for a production deployment.

---

## Running it

**Requirements:** Node.js 18+ and npm.

```bash
npm install
npm run dev      # ts-node against src/index.ts
```

For a production-style run:

```bash
npm run build    # tsc → dist/
npm start        # node dist/index.js
```

The listen port is read from the `PORT` environment variable.

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run the server directly from TypeScript |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled server |
| `npm test` | Build, then run the Node built-in test runner |
| `npm run lint` | Lint with ESLint |
| `npm run format` | Check formatting with Prettier |

Tests use Node's built-in `node --test` runner and live beside their subjects
(e.g. `src/routes/usage.test.ts`).

---

## Layout

```
src/
├── index.ts            # app composition + bootstrap
├── types.ts            # shared request/domain types
├── events.ts           # domain event definitions
├── middleware/         # request id, key recognition, pause gate
├── routes/             # one file per API concern
└── store/              # in-memory state
```

## License

Released under the [MIT License](./LICENSE).
