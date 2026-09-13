import { asRecords, ConnectionResult, responseJson, SupplierAdapter, SupplierFetchContext } from "./types"
import { MedusaError } from "@medusajs/framework/utils"

const BASE_URL = "https://api.midocean.com"

export class MidoceanAdapter implements SupplierAdapter {
  constructor(private readonly apiKey: string) {}

  private async request(path: string, context?: SupplierFetchContext): Promise<unknown[]> {
    return asRecords(await this.requestPayload(path, context))
  }

  private async requestPayload(path: string, context?: SupplierFetchContext): Promise<any> {
    const response = await fetch(new URL(path, BASE_URL), {
      headers: {
        Accept: "text/json",
        "x-Gateway-APIKey": this.apiKey,
      },
      signal: context?.signal ? AbortSignal.any([context.signal, AbortSignal.timeout(300_000)]) : AbortSignal.timeout(300_000),
    })
    if (!response.ok) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `midocean request failed (${response.status})`)
    return responseJson(response, context)
  }

  async testConnection(): Promise<ConnectionResult> {
    try {
      await this.request("/gateway/stock/2.0")
      return { ok: true, message: "Connection successful" }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Connection failed",
      }
    }
  }

  fetchProducts(context?: SupplierFetchContext) {
    return this.request("/gateway/products/2.0?language=en", context)
  }

  fetchPrices(context?: SupplierFetchContext) {
    return this.request("/gateway/pricelist/2.0", context)
  }

  fetchStock(context?: SupplierFetchContext) {
    return this.request("/gateway/stock/2.0", context)
  }

  async fetchDecorations(context?: SupplierFetchContext) {
    const payload = await this.requestPayload("/gateway/printdata/1.0", context)
    const descriptions = Array.isArray(payload?.printing_technique_descriptions) ? payload.printing_technique_descriptions : []
    const names = new Map<string, string>(descriptions.map((item: any) => [String(item.id), item.name?.find?.((name: any) => name.en)?.en || item.name?.[0]?.en || String(item.id)]))
    return asRecords(payload).map((product: any) => ({
      ...product,
      printing_positions: Array.isArray(product.printing_positions)
        ? product.printing_positions.map((position: any) => ({
            ...position,
            printing_techniques: Array.isArray(position.printing_techniques)
              ? position.printing_techniques.map((technique: any) => ({
                  ...technique,
                  name: technique.name || names.get(String(technique.id)) || String(technique.id),
                }))
              : [],
          }))
        : [],
    }))
  }

  fetchDecorationPrices(context?: SupplierFetchContext) {
    return this.request("/gateway/printpricelist/2.0", context)
  }
}
