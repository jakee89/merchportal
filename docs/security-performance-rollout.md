# Security and catalog rollout

This release does not install an antivirus service or change Odoo.

## Before deploying

- Set `AUTH_MFA_ENCRYPTION_KEY` once to a securely generated 64-character secret in `/opt/merchportal/.env`. Keep it backed up; changing it invalidates existing authenticator secrets. Never commit it.
- Set `AUTH_PROXY_SECRET` to a separate random secret of at least 32 characters in the same environment. Compose supplies it to the backend and storefront. It authenticates client-IP forwarding from server actions. Without it, account limits still work but customer IP limits share the storefront's backend address.
- Keep storefront/backend container ports accessible only through the trusted reverse proxy. The proxy must overwrite `X-Real-IP` and set `X-Forwarded-For` from the connecting address. Do not trust user-supplied forwarded headers on a directly exposed port.

## After deploying

- Each admin enables an authenticator in **My Profile** (`/app/settings/profile`) and saves recovery codes offline. Custom MerchPortal admin routes require MFA for enrolled accounts, including old pre-enrollment sessions. Unenrolled accounts are deliberately not locked out during rollout; enrollment is still required to protect those accounts.
- Run a **Makito stock import**. Dated delivery records now have distinct identities and are shown as incoming, not available stock. No catalog/product duplication or price changes are needed.
- Broad CSP restrictions are report-only. Inspect browser CSP console violations during login, catalog, printing, uploads and admin use before enforcing them. Anti-framing, object blocking and same-origin base URLs are already enforced. HTTPS/HSTS remain the existing proxy's responsibility.

## Limits and caching

- Redis atomically enforces login/MFA limits over 15 minutes: 120 requests per IP, 20 per account/challenge, 10 per account+IP. Reset requests: 30 per IP, 5 per account and pair per hour. Limits are shared across backend instances. Redis failures temporarily refuse new login/reset attempts, not existing sessions or catalog access. Responses include `Retry-After` when limited; reset UI remains non-enumerating.
- Stable catalog filter dictionaries are revision-aware and private. Changing counts are encoded by label index, decoded into the same customer filters. Unknown selected values retain the legacy zero-count representation. Sorting/paging reuse the latest successfully applied count response for up to 30 seconds; changing search/filter conditions refreshes it immediately.
- A dedicated Docker volume preserves public optimized thumbnails across releases. Cache maintenance removes old files after 14 days and trims oldest files to 256 MiB once per minute. This is a periodic budget, not a hard filesystem quota; thumbnails regenerate as needed. Prices, carts and accounts are never publicly cached.

## Artwork protection boundary

Uploads remain private and limited to matching PDF/PNG/JPEG/SVG content, at most 10 MB. Static-artwork checks reject active SVG content, PDF scripts/actions/attachments/encryption, detectable compressed active objects, malformed PNG boundaries and image trailers. Complex chained PDF filters are refused. This is **not antivirus** and cannot guarantee malware-free files or detect every exploit. Keep PDF/image tooling patched and do not treat accepted files as trusted executables.

SQL input remains parameterized. Catalog inputs also have size/type bounds; strings containing quotes are treated as data, not SQL. No finite audit can promise to prevent every injection or other attack.
