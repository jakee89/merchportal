# Portal performance

## Read path

- PostgreSQL's existing full-text and trigram indexes still handle plurals and misspellings. Code searches use a sorted SKU index and never expand to fuzzy neighbours.
- Read-only source snapshots are shared across companies. Prepared selling-price catalogues are separately keyed by company and data/settings revision, with at most four cached catalogues. Inverted facet indexes shortlist candidates; the existing same-variant price, size, colour and stock checks remain authoritative.
- Revision checks are shared for one second. Imports, stock/price updates, supplier priorities, pricing rules and soft-deleted filter maps invalidate reads through their database timestamps, including updates made by another process. Explicit filter/reset invalidation also clears in-flight cache generations.
- Server processes warm the shared lightweight snapshot ten seconds after startup and check for import changes every minute. Warming uses the module's existing database connection, is single-flight, and cannot prevent startup when a read fails. Worker/development processes do not warm it. Authenticated requests register recently used company catalogues for revision-aware warming.
- Product/source lookups run in parallel. Raw product and decoration reads are cached; selling prices are calculated separately for the authenticated company. Membership and cart/quote writes are never cached.
- Similar products and the cart badge stream independently of the main product configurator. The existing product endpoint supports `include_related=false` and `related_only=true`; its default response is unchanged.
- Supplier images use the existing encrypted media proxy and a bounded 32 MiB shared download cache. Next.js generates responsive WebP images and caches derivatives. PDFs and oversized images retain streaming behaviour. Original images remain available through product zoom.
- Search submissions use client navigation, with loading placeholders. Product cards only prefetch on link hover/focus, rather than preloading every configurator in view.

## Catalogue follow-up

- The storefront requests compact product cards first using `view=products&compact=true`; this skips all facet calculation. The existing filter sidebar streams separately through `view=facets&compact=true`. Default API responses remain compatible.
- Compact cards omit unused search/filter metadata, not displayed prices, descriptions, stock or colour choices. Compact facets encode each value/count as a pair. Large lists render 40 values initially and append more on scroll in the existing scroll area; searches still inspect every value and no filter values are discarded.
- Page/sort changes reuse the same facet response. Sidebar state is retained across client navigation, including its search and expanded state. No CSS or catalogue-card layout is changed.
- Responses are retained for five minutes, facets for ten, revision-keyed sources/metadata/prepared company catalogues for an hour. Revision checks and membership checks are unchanged; old source/settings revisions are never used for a new revision. Existing cache entry limits are unchanged.
- Every minute the server warms up to four recently used company catalogues, sequentially, using existing shared services/connections. Inactive company warmers expire after 15 minutes. A new revision is built before being cached; failures leave request-driven loading available, never serving an older revision as current. First access to a new company/revision can still be cold.
- Product/source detail caches are retained for five minutes under their source revision. Selling prices remain calculated per company; cart and quote writes still use fresh authoritative data.

AI filter review requests keep GPT-6.1 Sol with medium reasoning, constrain names to 1–80 characters and use non-empty groups with IDs restricted to the current batch. Reviews use 100-value batches; invalid/truncated outputs retry at most twice with smaller batches. Completed batches are retained and failed reviews can resume unfinished values. Refusals/content-filter interruptions are not automatically retried. Nothing is mapped before staff approval.

## Deployment and checks

Apply `Migration20260930150000` through the existing deployment migration step. It only adds revision and similar-product indexes; it does not rewrite supplier data. No supplier re-import is required.

Before deployment, targeted tests cover candidate-versus-original result/facet parity over 200 combined filters, exact codes, priorities, company pricing, revoked memberships, cache expiry/invalidation/concurrency, image streaming and print selection/dimension regressions. Both application TypeScript checks and production builds must pass.

After deployment, use a signed-in browser to measure cold and repeated catalogue, filtered/search and product requests. Compare `Server-Timing` metadata/catalog/facets/total values, browser navigation timings, image bytes, and server CPU/memory during an import. Check two differently priced companies and a revoked membership. Verify WebP thumbnails, full-size zoom, print-guide colour switching, cart editing and quote totals.

A local synthetic benchmark of 50,000 products measured about 363 ms to build the indexes once, then 0.03 ms per exact-code candidate/facet/filter pass versus 4.42 ms scanning all products. These figures exclude database access, authentication, rendering and network latency; they are not a live-site speed guarantee. An unfiltered cold catalogue still loads and prepares its full lightweight snapshot, and broad searches still process their matching candidates.
