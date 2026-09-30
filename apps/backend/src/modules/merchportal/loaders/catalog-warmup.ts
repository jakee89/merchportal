import type { LoaderOptions } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { catalogRevision, catalogSources } from "../catalog-data"
import { warmActiveCatalogs } from "../catalog-prepared"

export default async function catalogWarmup({ container }: LoaderOptions) {
  if (process.env.NODE_ENV !== "production" || process.env.MEDUSA_WORKER_MODE === "worker") return
  // Reuse this module's existing connection; do not create another database pool.
  const manager = container.resolve(ContainerRegistrationKeys.MANAGER) as any
  const scope = { resolve: () => manager.getConnection().getKnex() }
  let running = false
  const warm = async () => {
    if (running) return
    running = true
    try {
      const revision = await catalogRevision(scope)
      await catalogSources(scope, revision.source)
      await warmActiveCatalogs()
    } catch {
      // Warm-up is optional and must never prevent startup, migrations or sign-in.
      container.resolve(ContainerRegistrationKeys.LOGGER).warn("Catalogue warm-up unavailable; requests will load it on demand")
    } finally {
      running = false
    }
  }
  setTimeout(() => { void warm() }, 10_000).unref()
  // Detect worker imports in the server process and warm the new raw snapshot.
  setInterval(() => { void warm() }, 60_000).unref()
}
