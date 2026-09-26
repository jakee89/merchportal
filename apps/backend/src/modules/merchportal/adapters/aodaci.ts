import { MedusaError } from "@medusajs/framework/utils"
import { asRecords, responseJson, type ConnectionResult, type SupplierAdapter, type SupplierFetchContext } from "./types"

const BASE_URL = "https://api.aodaci.com"

export class AodaciAdapter implements SupplierAdapter {
  private token?: string
  private tokenExpiresAt = 0

  constructor(private readonly accessKey: string) {}

  private async authenticate(context?: SupplierFetchContext) {
    if (this.token && Date.now() < this.tokenExpiresAt - 30_000) return this.token
    const response = await fetch(`${BASE_URL}/api/v1/authentication/${encodeURIComponent(this.accessKey)}`, {
      method: "POST",
      headers: { Accept: "application/json" },
      signal: context?.signal ? AbortSignal.any([context.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `AODACi authentication failed (${response.status})`)
    const payload = await response.json() as { accessToken?: string; expiresAtUtc?: string }
    if (!payload.accessToken) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "AODACi authentication did not return a token")
    this.token = payload.accessToken
    this.tokenExpiresAt = payload.expiresAtUtc ? Date.parse(payload.expiresAtUtc) : Date.now() + 240_000
    return this.token
  }

  private async page(path: string, page: number, context?: SupplierFetchContext) {
    const url = new URL(`/api/v1/products${path ? `/${path}` : ""}`, BASE_URL)
    url.search = new URLSearchParams({ culture: "en-EN", page: String(page), pageSize: "500" }).toString()
    const request = async () => fetch(url, {
      headers: { Accept: "application/json", Authorization: `Bearer ${await this.authenticate(context)}` },
      signal: context?.signal ? AbortSignal.any([context.signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
    })
    let response = await request()
    if (response.status === 401) {
      this.token = undefined
      response = await request()
    }
    if (!response.ok) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `AODACi ${path} request failed (${response.status})`)
    return responseJson(response, context) as Promise<unknown>
  }

  private async download(path: string, context?: SupplierFetchContext): Promise<unknown[]> {
    const records: unknown[] = []
    for (let page = 1; ; page += 1) {
      const payload = await this.page(path, page, context)
      const batch = asRecords(payload)
      records.push(...batch)
      const pagination = payload && typeof payload === "object" ? (payload as { pagination?: { totalPages?: number; nextPage?: number | null } }).pagination : undefined
      if (!pagination && batch.length < 500) break
      if (pagination?.totalPages !== undefined && page >= pagination.totalPages) break
      if (pagination && pagination.nextPage == null && pagination.totalPages === undefined) break
      if (!batch.length) break
      if (page >= 1000) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `AODACi ${path} exceeded the expected page limit`)
    }
    return records
  }

  async testConnection(): Promise<ConnectionResult> {
    try {
      await this.authenticate()
      return { ok: true, message: "Connection successful" }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Connection failed" }
    }
  }

  fetchProducts(context?: SupplierFetchContext) { return this.download("", context) }
  fetchPrices(context?: SupplierFetchContext) { return this.download("productprices", context) }
  async fetchStock(context?: SupplierFetchContext) {
    const [stocks, arrivals] = await Promise.all([this.download("stocks", context), this.download("stocksnextentries", context)])
    const bySku = new Map<string, Array<{ date: string; quantity: number }>>()
    for (const record of arrivals) {
      const row = record as { productSKU?: string; date?: string; quantity?: number }
      if (!row.productSKU || !row.date || !Number.isFinite(Number(row.quantity))) continue
      const entries = bySku.get(row.productSKU) || []
      entries.push({ date: row.date, quantity: Number(row.quantity) })
      bySku.set(row.productSKU, entries)
    }
    return stocks.map((record) => {
      const row = record as { productSKU?: string }
      const incoming = bySku.get(row.productSKU || "")?.sort((a, b) => a.date.localeCompare(b.date)) || []
      return { ...row, nextArrivalDate: incoming[0]?.date, nextArrivalQty: incoming[0]?.quantity, secondArrivalDate: incoming[1]?.date, secondArrivalQty: incoming[1]?.quantity }
    })
  }
  fetchDecorations(context?: SupplierFetchContext) { return this.download("printingcomplete", context) }
}
