# MerchPortal Architecture

## Scope

Milestone 1 establishes a Docker-first Medusa v2 monorepo, a Next.js storefront,
PostgreSQL, Redis, Typesense, MinIO, a separate worker process, and recognizable
admin/client shells. Supplier imports and production authentication policy are
deliberately deferred to their dedicated milestones.

## System boundaries

```text
Browser -> Next.js storefront -> Medusa application API -> PostgreSQL
                                      |       |       |
                                    Redis  Typesense  MinIO
                                      |
                              Medusa worker process
```

- PostgreSQL is the source of truth.
- Redis supports sessions, caching, workflows, and rate limiting as modules are added.
- Typesense contains compact, client-safe search documents only.
- MinIO is the development S3-compatible object store.
- The worker runs independently from the HTTP server so imports never block page requests.
- The browser never receives supplier credentials, supplier cost, markup, or margin data.

## Product data boundary

All future supplier integrations must preserve this one-way boundary:

```text
Raw supplier record -> normalized internal catalog -> client-safe catalog projection
```

Supplier-specific code lives in an adapter. Physical supplier SKUs become variants;
decoration choices remain RFQ-line configuration and never become variant combinations.

## Identity and tenancy

Medusa provides customer/authentication primitives. Custom organization, membership,
role, permission, and tenant-aware modules will be added behind backend APIs. Every
client-owned record must carry an organization identifier, and authorization must add
that boundary server-side. Frontend filtering is never considered authorization.

The current `/admin` and `/portal` pages are visual foundation shells, not security
boundaries. The operational Medusa Admin is served by the backend at `/app`.

The upstream retail checkout and country routes are retained under
`src/legacy-storefront` as reference code but are not active routes. MerchPortal will
connect its own catalog and RFQ pages incrementally rather than expose a B2C checkout.

## Deployment assumptions

- Portainer deploys `docker-compose.yml` as one stack.
- Only ports 8000 (storefront), 9000 (Medusa/Admin), and 9001 (MinIO console) are exposed.
- Database, Redis, search, and MinIO API traffic stay inside the Compose network.
- TLS/reverse proxy is external to this first stack. Set browser-facing URLs to their
  final HTTPS origins before exposing it publicly.
- Secrets are supplied by Portainer environment variables; `.env` is never committed.
- Infrastructure images are pinned. The MinIO release includes the October 2025
  privilege-escalation fix; image upgrades must be reviewed rather than floated.

## Supplier documentation authority

- Stricker: `webservice_manual_2025.pdf`, version 4.21 (March 2025).
- midocean: the linked AIG Confluence space, whose Product information and Postman
  resources were updated during 2026.

No endpoint or field behavior will be implemented from memory. The relevant source
pages will be read when Milestone 2 begins.
