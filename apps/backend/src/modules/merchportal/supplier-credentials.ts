import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { MedusaError } from "@medusajs/framework/utils"

type SupplierCode = "stricker" | "midocean"
type SupplierConfiguration = { encrypted_api_key?: string } & Record<string, unknown>

function encryptionKey() {
  if (!process.env.JWT_SECRET) {
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "JWT_SECRET is required for supplier credentials")
  }
  return createHash("sha256").update(`merchportal:supplier-credentials:${process.env.JWT_SECRET}`).digest()
}

export function encryptSupplierCredential(code: SupplierCode, credential: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv)
  cipher.setAAD(Buffer.from(code))
  const encrypted = Buffer.concat([cipher.update(credential, "utf8"), cipher.final()])
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(":")
}

export function decryptSupplierCredential(code: SupplierCode, value: string) {
  const [version, iv, tag, encrypted] = value.split(":")
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Stored supplier credential is invalid")
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"))
  decipher.setAAD(Buffer.from(code))
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8")
}

export function supplierCredentialStatus(code: SupplierCode, configuration?: SupplierConfiguration | null) {
  return Boolean(configuration?.encrypted_api_key || (code === "stricker" ? process.env.STRICKER_ACCESS_KEY : process.env.MIDOCEAN_API_KEY))
}

export function resolveSupplierCredential(code: SupplierCode, configuration?: SupplierConfiguration | null) {
  if (configuration?.encrypted_api_key) return decryptSupplierCredential(code, configuration.encrypted_api_key)
  return code === "stricker" ? process.env.STRICKER_ACCESS_KEY : process.env.MIDOCEAN_API_KEY
}
