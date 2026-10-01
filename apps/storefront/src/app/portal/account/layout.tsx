import UsageTracker from "./usage-tracker"
import DiscoveryProvider from "./discovery/provider"
import { getAuthHeaders } from "@lib/data/cookies"
import { createHash } from "node:crypto"

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const headers = await getAuthHeaders()
  if (!headers.authorization) return <>{children}</>
  // This opaque key only isolates comparison storage. Backend endpoints
  // remain authoritative for authentication and company membership.
  const sessionKey = createHash("sha256").update(headers.authorization).digest("hex").slice(0, 32)
  return <DiscoveryProvider key={sessionKey} clientId={sessionKey}><UsageTracker />{children}</DiscoveryProvider>
}
