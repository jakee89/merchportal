import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { MedusaError } from "@medusajs/framework/utils"

function encryptionKey() {
  if (!process.env.JWT_SECRET) {
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "JWT_SECRET is required for stored credentials")
  }
  return createHash("sha256").update(`merchportal:stored-credentials:${process.env.JWT_SECRET}`).digest()
}

export function encryptStoredSecret(purpose: string, secret: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv)
  cipher.setAAD(Buffer.from(purpose))
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()])
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(":")
}

export function decryptStoredSecret(purpose: string, value: string) {
  const [version, iv, tag, encrypted] = value.split(":")
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Stored credential is invalid")
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"))
  decipher.setAAD(Buffer.from(purpose))
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8")
}
