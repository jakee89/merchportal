"use server"

import { sdk } from "@lib/config"
import { getAuthHeaders } from "@lib/data/cookies"
import { login, signup, type CustomerAuthState } from "@lib/data/customer"
import { redirect } from "next/navigation"

function registrationDetails(formData: FormData) {
  const field = (name: string, max: number, required = true) => {
    const raw = formData.get(name)
    const value = typeof raw === "string" ? raw.trim() : ""
    if (value.length > max || (required && !value)) throw new Error("Check your company, contact and address details")
    return value
  }
  const billing = { line1: field("portal_billing_line1", 160), line2: field("portal_billing_line2", 160, false), city: field("portal_billing_city", 100), postal_code: field("portal_billing_postal_code", 24), country_code: field("portal_billing_country_code", 2).toLowerCase() }
  const delivery = formData.has("portal_same_delivery") ? billing : { line1: field("portal_delivery_line1", 160), line2: field("portal_delivery_line2", 160, false), city: field("portal_delivery_city", 100), postal_code: field("portal_delivery_postal_code", 24), country_code: field("portal_delivery_country_code", 2).toLowerCase() }
  const phone = field("phone", 40)
  if (!/^[+\d()\s.-]{6,40}$/.test(phone) || !/^[a-z]{2}$/.test(billing.country_code) || !/^[a-z]{2}$/.test(delivery.country_code)) throw new Error("Check the phone number and countries")
  if (field("password", 256).length < 12) throw new Error("Use a password of at least 12 characters")
  field("first_name", 60)
  field("last_name", 60)
  return { company_name: field("portal_company_name", 160), vat_number: field("portal_vat_number", 50, false), billing_address: billing, delivery_address: delivery }
}

async function joinCompany(formData: FormData, token?: string, details?: ReturnType<typeof registrationDetails>): Promise<CustomerAuthState> {
  const joinCode = String(formData.get("join_code") || "").trim()
  if (!joinCode && !details) return { state: "error", error: "Company code is required" }
  try {
    await sdk.client.fetch(joinCode ? "/portal-api/join" : "/portal-api/register-company", {
      method: "POST",
      body: joinCode ? { join_code: joinCode } : details,
      headers: token ? { authorization: `Bearer ${token}` } : await getAuthHeaders(),
      cache: "no-store",
    })
    return { state: "success" }
  } catch (error) {
    return { state: "error", error: String(error) }
  }
}

async function recordLogin(token?: string) {
  try {
    await sdk.client.fetch("/portal-api/usage", { method: "POST", body: { logins: 1 }, headers: token ? { authorization: `Bearer ${token}` } : await getAuthHeaders(), cache: "no-store" })
  } catch {
    // Analytics must never prevent a customer from signing in.
  }
}

export async function portalSignup(_state: CustomerAuthState, formData: FormData): Promise<CustomerAuthState> {
  let details: ReturnType<typeof registrationDetails>
  try {
    details = registrationDetails(formData)
    formData.set("portal_business_details", JSON.stringify({ ...details, join_code: String(formData.get("join_code") || "").trim() }))
  } catch (error) {
    return { state: "error", error: error instanceof Error ? error.message : "Check your registration details" }
  }
  const result = await signup(null, formData)
  if (result?.state !== "success") return result
  const joined = await joinCompany(formData, result.token, details)
  if (joined?.state !== "success") return joined
  try {
    const headers = result.token ? { authorization: `Bearer ${result.token}` } : await getAuthHeaders()
    const { customer } = await sdk.store.customer.retrieve({}, headers)
    await sdk.store.customer.update({ phone: String(formData.get("phone") || ""), company_name: details.company_name, metadata: { ...(customer.metadata || {}), merchportal_business: details } }, {}, headers)
  } catch {
    return { state: "error", error: "Account created, but business details could not be saved. Please sign in and complete them in the quote cart." }
  }
  await recordLogin(result.token)
  redirect("/portal/account")
}

export async function portalLogin(_state: CustomerAuthState, formData: FormData): Promise<CustomerAuthState> {
  const result = await login(null, formData)
  if (result?.state !== "success") return result
  const headers = result.token ? { authorization: `Bearer ${result.token}` } : await getAuthHeaders()
  const { customer } = await sdk.store.customer.retrieve({}, headers)
  const saved = customer.metadata?.merchportal_business
  if (saved && typeof saved === "object") {
    const details = saved as ReturnType<typeof registrationDetails> & { join_code?: string }
    const companyForm = new FormData()
    if (details.join_code) companyForm.set("join_code", details.join_code)
    const joined = await joinCompany(companyForm, result.token, details)
    if (joined?.state !== "success") return joined
  }
  await recordLogin(result.token)
  redirect("/portal/account")
}
