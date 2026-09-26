import { createHash } from "node:crypto"
import { MedusaError } from "@medusajs/framework/utils"
import { responseJson, type ConnectionResult, type SupplierAdapter, type SupplierFetchContext } from "./types"

const baseUrl = "https://apis.makito.es"
const tokens = new Map<string, { token: string; expiresAt: number }>()

function credentials(value: string) {
  try {
    const parsed = JSON.parse(value) as { clientId?: string; clientSecret?: string }
    if (parsed.clientId && parsed.clientSecret) return parsed
  } catch {}
  throw new MedusaError(MedusaError.Types.INVALID_DATA, "Makito Client ID and Client Secret are not configured")
}

export async function makitoToken(credential: string, signal?: AbortSignal, forceRefresh = false) {
  const key = createHash("sha256").update(credential).digest("hex")
  if (forceRefresh) tokens.delete(key)
  const cached = tokens.get(key)
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token
  const response = await fetch(`${baseUrl}/access/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(credentials(credential)),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `Makito authentication failed (${response.status})`)
  const payload = await response.json() as { token?: string }
  if (!payload.token) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Makito authentication returned no token")
  const encoded = payload.token.split(".")[1]
  let expiresAt = Date.now() + 20 * 60_000
  try {
    const exp = Number(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")).exp)
    if (Number.isFinite(exp)) expiresAt = exp * 1000
  } catch {}
  tokens.set(key, { token: payload.token, expiresAt })
  return payload.token
}

export class MakitoAdapter implements SupplierAdapter {
  constructor(private readonly credential: string) { credentials(credential) }

  private async download(path: string, field: string, context?: SupplierFetchContext) {
    const request = async () => fetch(`${baseUrl}${path}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${await makitoToken(this.credential, context?.signal)}` },
      signal: context?.signal ? AbortSignal.any([context.signal, AbortSignal.timeout(180_000)]) : AbortSignal.timeout(180_000),
    })
    let response = await request()
    if (response.status === 401) {
      tokens.delete(createHash("sha256").update(this.credential).digest("hex"))
      response = await request()
    }
    if (!response.ok) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `Makito ${field} request failed (${response.status})`)
    const payload = await responseJson(response, context) as Record<string, unknown>
    const records = Array.isArray(payload) ? payload : payload?.[field]
    if (!Array.isArray(records)) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `Makito ${field} feed has an unexpected format`)
    return { payload, records }
  }

  async testConnection(): Promise<ConnectionResult> {
    try {
      await makitoToken(this.credential)
      return { ok: true, message: "Connection successful" }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Connection failed" }
    }
  }

  async fetchProducts(context?: SupplierFetchContext) {
    const products = (await this.download("/catalog/files?format=JSON&lang=en", "products", context)).records
    return products.map((item) => {
      const product = item as { ref?: string; variants?: Array<{ variant_colorcode?: string; variant_image?: string }> }
      return { ...product, variants: (product.variants || []).map((variant) => {
        let material: string | undefined
        try {
          const segments = new URL(variant.variant_image || "").pathname.split("/")
          if (segments[3] === String(product.ref) && /^\d+$/u.test(segments[4] || "")) material = segments[4]
        } catch {}
        return { ...variant, variant_material: material }
      }) }
    })
  }

  async fetchPrices(context?: SupplierFetchContext) {
    return (await this.download("/price-list/files?format=JSON", "priceList", context)).records
  }

  async fetchStock(context?: SupplierFetchContext) {
    return (await this.download("/stock/files?format=JSON", "stocks", context)).records
  }

  async fetchDecorations(context?: SupplierFetchContext) {
    const { payload, records } = await this.download("/print-config/files?format=JSON&lang=en", "products", context)
    const positions = new Map(((payload.positions || []) as Array<{ id: string }>).map((item) => [String(item.id), item]))
    const techniques = new Map(((payload.techniques || []) as Array<{ id: string }>).map((item) => [String(item.id), item]))
    return records.map((item) => {
      const product = item as { id: string; areas?: Array<{ position?: string; techniques?: string }> }
      return {
        ...product,
        productCode: String(product.id),
        position_lookup: (product.areas || []).map((area) => positions.get(String(area.position))).filter(Boolean),
        technique_lookup: [...new Set((product.areas || []).flatMap((area) => [...String(area.techniques || "").matchAll(/\b\d{5,}(?=\()/gu)].map((match) => match[0])))].map((id) => techniques.get(id)).filter(Boolean),
      }
    })
  }

  async fetchDecorationPrices(context?: SupplierFetchContext) {
    return (await this.download("/print-price-list/files?format=JSON", "printPriceList", context)).records
  }
}
