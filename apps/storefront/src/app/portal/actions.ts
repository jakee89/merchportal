"use server"

import { sdk } from "@lib/config"
import { getAuthHeaders } from "@lib/data/cookies"
import { login, signup, type CustomerAuthState } from "@lib/data/customer"
import { redirect } from "next/navigation"

async function joinCompany(formData: FormData, token?: string): Promise<CustomerAuthState> {
  const joinCode = String(formData.get("join_code") || "").trim()
  if (!joinCode) return { state: "error", error: "Company code is required" }
  try {
    await sdk.client.fetch("/portal-api/join", {
      method: "POST",
      body: { join_code: joinCode },
      headers: token ? { authorization: `Bearer ${token}` } : await getAuthHeaders(),
      cache: "no-store",
    })
    return { state: "success" }
  } catch (error) {
    return { state: "error", error: String(error) }
  }
}

export async function portalSignup(_state: CustomerAuthState, formData: FormData): Promise<CustomerAuthState> {
  const result = await signup(null, formData)
  if (result?.state !== "success") return result
  const joined = await joinCompany(formData, result.token)
  if (joined?.state !== "success") return joined
  redirect("/portal/account")
}

export async function portalLogin(_state: CustomerAuthState, formData: FormData): Promise<CustomerAuthState> {
  const result = await login(null, formData)
  if (result?.state !== "success") return result
  const joinCode = String(formData.get("join_code") || "").trim()
  if (joinCode) {
    const joined = await joinCompany(formData, result.token)
    if (joined?.state !== "success") return joined
  }
  redirect("/portal/account")
}
