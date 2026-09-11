# Project State

## Product

MerchPortal is a Docker-first B2B merchandise portal built on Medusa v2 and Next.js. It has a private, organization-scoped client catalog and a staff-operated supplier-import and catalog-publishing flow.

## Implemented

- Malta/EUR setup, staff and client roles, organizations, private company-code onboarding, client-specific pricing, and supplier image proxying.
- Stricker and midocean connection tests; catalog, price, and stock imports; scheduled updates; import history.
- Client catalog browsing/filtering, product configuration, artwork upload, and saved product configurations.
- Staff setup, supplier controls, organization creation, pricing-rule controls, catalog publishing, and import monitoring.

## Current gaps

- Saved product configurations do not yet flow into a client quote request, staff quote, approval, payment/order, or fulfillment workflow.
- The public `/portal` landing page remains a static discovery shell; catalog access begins at `/portal/account` after sign-in.

## Deployment

- The Portainer image release requires a pull and live smoke test. Public hostnames, reverse-proxy/TLS, transactional email, and supplier-secret storage approach remain unresolved.
