import { redirect } from "next/navigation"
import { retrieveCustomer } from "@lib/data/customer"
import Shortlists from "./shortlists"

export default async function ShortlistsPage() {
  if (!(await retrieveCustomer()))
    redirect("/portal/login?returnTo=%2Fportal%2Faccount%2Fshortlists")
  return <Shortlists />
}
