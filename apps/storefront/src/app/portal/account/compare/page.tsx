import { redirect } from "next/navigation"
import { retrieveCustomer } from "@lib/data/customer"
import Comparison from "./comparison"

export default async function ComparisonPage() {
  if (!(await retrieveCustomer()))
    redirect("/portal/login?returnTo=%2Fportal%2Faccount%2Fcompare")
  return <Comparison />
}
