import { createHmac, timingSafeEqual } from "node:crypto"
import { MedusaError } from "@medusajs/framework/utils"

function secret() {
  if (!process.env.JWT_SECRET) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Artwork signing is not configured")
  return process.env.JWT_SECRET
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(`merchportal-artwork:${payload}`).digest("base64url")
}

export function signArtwork(fileId: string, filename: string, actorId: string, organizationId: string) {
  const payload = Buffer.from(JSON.stringify({ fileId, filename, actorId, organizationId, expiresAt: Date.now() + 60 * 60 * 1000 })).toString("base64url")
  return `${payload}.${signature(payload)}`
}

export function verifyArtwork(token: string | undefined, fileId: string | undefined, filename: string | undefined, actorId: string, organizationId: string) {
  if (!token || !fileId || !filename || token.length > 2000) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Upload artwork again before adding it to the cart")
  const [payload, supplied] = token.split(".")
  if (!payload || !supplied || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]+$/.test(supplied)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Artwork proof is invalid")
  const expected = Buffer.from(signature(payload))
  const actual = Buffer.from(supplied)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Artwork proof is invalid")
  let claim: any
  try { claim = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) } catch { throw new MedusaError(MedusaError.Types.INVALID_DATA, "Artwork proof is invalid") }
  if (claim.fileId !== fileId || claim.filename !== filename || claim.actorId !== actorId || claim.organizationId !== organizationId || !Number.isFinite(claim.expiresAt) || claim.expiresAt < Date.now()) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Upload artwork again before adding it to the cart")
}
