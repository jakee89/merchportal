import { decryptStoredSecret, encryptStoredSecret } from "./secret-crypto"

type SupplierCode = "stricker" | "midocean"
type SupplierConfiguration = { encrypted_api_key?: string } & Record<string, unknown>

export function encryptSupplierCredential(code: SupplierCode, credential: string) {
  return encryptStoredSecret(`supplier:${code}`, credential)
}

export function decryptSupplierCredential(code: SupplierCode, value: string) {
  return decryptStoredSecret(`supplier:${code}`, value)
}

export function supplierCredentialStatus(code: SupplierCode, configuration?: SupplierConfiguration | null) {
  return Boolean(configuration?.encrypted_api_key || (code === "stricker" ? process.env.STRICKER_ACCESS_KEY : process.env.MIDOCEAN_API_KEY))
}

export function resolveSupplierCredential(code: SupplierCode, configuration?: SupplierConfiguration | null) {
  if (configuration?.encrypted_api_key) return decryptSupplierCredential(code, configuration.encrypted_api_key)
  return code === "stricker" ? process.env.STRICKER_ACCESS_KEY : process.env.MIDOCEAN_API_KEY
}
