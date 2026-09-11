import { asRecords, ConnectionResult, SupplierAdapter } from "./types"
import { MedusaError } from "@medusajs/framework/utils"

const BASE_URL = "https://ws.stricker-europe.com"

export class StrickerAdapter implements SupplierAdapter {
  constructor(private readonly accessKey: string) {}

  private async download(data: string): Promise<unknown[]> {
    const url = new URL("/downloads/v1ssl/file", BASE_URL)
    url.search = new URLSearchParams({
      AccessKey: this.accessKey,
      data,
      lang: "EN",
      extension: "json",
    }).toString()

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(120_000),
    })
    if (!response.ok) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `Stricker request failed (${response.status})`)
    return asRecords(await response.json())
  }

  async testConnection(): Promise<ConnectionResult> {
    const url = new URL("/api/v1ssl/Authenticateclient", BASE_URL)
    url.searchParams.set("AccessKey", this.accessKey)
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    return {
      ok: response.ok,
      message: response.ok ? "Connection successful" : `Connection failed (${response.status})`,
    }
  }

  fetchProducts() {
    return this.download("optionalscomplete")
  }

  fetchPrices() {
    return this.download("optionalsPrice")
  }

  fetchStock() {
    return this.download("stocks")
  }
}
