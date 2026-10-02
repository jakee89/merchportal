import { redirect } from "next/navigation"
import { getPortalIdentity } from "./portal-brand"

export default async function PortalPage() {
  const identity = await getPortalIdentity()
  redirect(identity?.organization && identity.membership ? "/portal/account" : "/portal/login")
}
