# Project Status

## Completed

- Initialized the official Medusa v2 monorepo foundation.
- Added a Portainer-ready Compose stack for storefront, backend, worker, PostgreSQL,
  Redis, Typesense, and MinIO.
- Added backend and storefront production container builds and service health checks.
- Added environment variable template and a lightweight backend health endpoint.
- Added responsive, accessible admin and client portal foundation screens.
- Recorded the architectural and supplier-documentation boundaries.
- Verified both production builds, TypeScript checks, Compose configuration, and local
  HTTP responses for the admin and client shells.
- Added Malta/EUR commerce setup, a linked storefront publishable key, Malta tax and
  quotation-delivery configuration.
- Added staff and client roles, company accounts, addresses, branding, and private
  company-code onboarding.
- Added Stricker and midocean adapters, differential raw imports, daily catalog/price
  schedules, hourly stock schedules, connection tests, manual update controls, and
  persistent import history.
- Added an encrypted image proxy so supplier CDN assets remain remote while supplier
  names and CDN paths are not exposed in the client catalog.

## Currently working

- Deployment images are built by GitHub Actions and the current feature release is
  awaiting its Portainer pull and live smoke test.

## Next

- Deploy the new images, run **Configure Malta & EUR**, add supplier API keys, and run
  the two connection tests followed by catalog, price, and stock imports.
- Set the generated publishable key as the GitHub Actions repository variable
  `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`, rebuild once, then test client registration.
- Map imported raw products, prices, and stock into Medusa sellable products after
  sample payload validation from both live supplier accounts.

## Unresolved decisions

- Public hostnames and reverse proxy/TLS configuration on the target server.
- The local Docker daemon is not running, so container startup could not be exercised
  here; Compose validation and both production application builds pass.
- Transactional email provider for verification and password reset.
- Whether supplier credentials will use an external secret manager or application-level
  encryption backed by a server master key.
