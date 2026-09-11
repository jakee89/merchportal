import { asRecords, ConnectionResult, SupplierAdapter } from "./types"

const BASE_URL = "https://api.midocean.com"

export class MidoceanAdapter implements SupplierAdapter {
  constructor(private readonly apiKey: string) {}

  private async request(path: string): Promise<unknown[]> {
    const response = await fetch(new URL(path, BASE_URL), {
      headers: {
        Accept: "text/json",
        "x-Gateway-APIKey": this.apiKey,
      },
      signal: AbortSignal.timeout(120_000),
    })
    if (!response.ok) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `midocean request failed (${response.status})`)
    return asRecords(await response.json())
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

  fetchProducts() {
    return this.request("/gateway/products/2.0?language=en")
  }

  fetchPrices() {
    return this.request("/gateway/pricelist/2.0/")
  }

  fetchStock() {
    return this.request("/gateway/stock/2.0")
  }
}
import { MedusaError } from "@medusajs/framework/utils"
