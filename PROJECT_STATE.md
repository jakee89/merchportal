# Project State

## Product

MerchPortal is a Docker-first B2B merchandise portal built on Medusa v2 and Next.js. It has a private, organization-scoped client catalog and a staff-operated supplier-import and catalog-publishing flow.

## Implemented

- Malta/EUR setup, staff and client roles, organizations, private company-code onboarding, client-specific pricing, and supplier image proxying.
- Stricker and midocean connection tests; catalog, price, and stock imports; scheduled updates; import history.
- Client catalog browsing/filtering, product configuration, artwork upload, and saved product configurations.
- Staff setup, supplier controls, organization creation, pricing-rule controls, catalog publishing, and import monitoring.
- Supplier operations include live progress, error alerts, retry controls, and a catalog preview that imports source data without publishing client-facing catalog changes.
- Supplier updates use a Redis-backed queue and a dedicated worker container. The web backend runs in server mode so long catalog publishing does not block portal traffic.

## Current gaps

- Saved product configurations do not yet flow into a client quote request, staff quote, approval, payment/order, or fulfillment workflow.
- The public `/portal` landing page remains a static discovery shell; catalog access begins at `/portal/account` after sign-in.

## Deployment

- The Portainer image release requires a pull and live smoke test. Public hostnames, reverse-proxy/TLS, transactional email, and supplier-secret storage approach remain unresolved.
- MinIO services pull from the official Quay registry (`quay.io/minio/*`), not Docker Hub.
- Portainer deployments must run both the `backend` and `worker` services. Manual catalog updates queue on Redis; scheduled supplier updates run in the worker.
- The Medusa admin dashboard uses its own browser origin for API requests. Do not set `admin.backendUrl` from a build-time environment variable: a `localhost` value breaks remote admin login.
- Storefront image builds use GitHub Actions variables for public origins and the publishable API key. Set `NEXT_PUBLIC_MEDUSA_BACKEND_URL`, `NEXT_PUBLIC_BASE_URL`, and `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` in the repository before building production images.
