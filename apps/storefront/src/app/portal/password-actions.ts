"use server"

import { sdk } from "@lib/config"

export type PasswordState = { status: "success" | "error"; message: string } | null

export async function requestPasswordReset(_state: PasswordState, form: FormData): Promise<PasswordState> {
  const email = String(form.get("email") || "").trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { status: "error", message: "Enter a valid email address." }
  try {
    await sdk.auth.resetPassword("customer", "emailpass", { identifier: email })
  } catch {
    // Do not reveal whether this email is registered.
  }
  return { status: "success", message: "If this address has an account, you will receive a password-reset link shortly." }
}

export async function setNewPassword(_state: PasswordState, form: FormData): Promise<PasswordState> {
  const email = String(form.get("email") || "").trim().toLowerCase()
  const token = String(form.get("token") || "")
  const password = String(form.get("password") || "")
  const confirmation = String(form.get("confirmation") || "")
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !token || token.length > 4096) return { status: "error", message: "This reset link is invalid. Request a new one." }
  if (password.length < 12) return { status: "error", message: "Use a password of at least 12 characters." }
  if (password !== confirmation) return { status: "error", message: "Passwords do not match." }
  try {
    await sdk.auth.updateProvider("customer", "emailpass", { email, password }, token)
    return { status: "success", message: "Password updated. You can now sign in." }
  } catch {
    return { status: "error", message: "This reset link has expired or is invalid. Request a new one." }
  }
}
