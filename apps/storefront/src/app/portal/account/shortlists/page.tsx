import { redirect } from "next/navigation"
import { retrieveCustomer } from "@lib/data/customer"
import Shortlists from "./shortlists"
import PortalBrand from "../../portal-brand"
import { Suspense } from "react"

export default async function ShortlistsPage() {
  if (!(await retrieveCustomer()))
    redirect("/portal/login?returnTo=%2Fportal%2Faccount%2Fshortlists")
  return <Shortlists brand={<Suspense fallback={null}><PortalBrand name="Your shortlists" /></Suspense>} />
}
