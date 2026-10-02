import "server-only"
import { createHmac } from "node:crypto"
import { isIP } from "node:net"
import { headers } from "next/headers"
import { sdk } from "@lib/config"

export async function authProxyHeaders(): Promise<Record<string, string>> {
  const secret = process.env.AUTH_PROXY_SECRET
  if (!secret || secret.length < 32) return {}
  // Nginx overwrites X-Real-IP with the connecting client's address. Do not
  // accept the caller-controlled leftmost X-Forwarded-For entry.
  const ip = (await headers()).get("x-real-ip") || ""
  if (!isIP(ip)) return {}
  const payload = `${Date.now()}|${ip}`
  return { "x-merchportal-auth-ip": `${payload}|${createHmac("sha256", secret).update(payload).digest("hex")}` }
}

export async function loginCustomer(email: string, password: string): Promise<Awaited<ReturnType<typeof sdk.auth.login>>> {
  const result: any = await sdk.client.fetch("/auth/customer/emailpass", { method: "POST", body: { email, password }, headers: await authProxyHeaders(), cache: "no-store" })
  if (result.location) return { location: result.location }
  if (!result.token) throw new Error("Unexpected authentication response")
  if (result.verification_required) return { verification_required: true, verification: result.verification, token: result.token }
  if (result.mfa_challenge) return { mfa_required: true, mfa_challenge: result.mfa_challenge, token: result.token }
  return result.token
}
