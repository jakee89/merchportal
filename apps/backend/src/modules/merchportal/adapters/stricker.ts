import { asRecords, ConnectionResult, responseJson, SupplierAdapter, SupplierFetchContext } from "./types"
import { MedusaError } from "@medusajs/framework/utils"

const BASE_URL = "https://ws.stricker-europe.com"

export class StrickerAdapter implements SupplierAdapter {
  constructor(private readonly accessKey: string) {}

  private async download(data: string, context?: SupplierFetchContext): Promise<unknown[]> {
    const url = new URL("/downloads/v1ssl/file", BASE_URL)
    url.search = new URLSearchParams({
      AccessKey: this.accessKey,
      data,
      lang: "EN",
      extension: "json",
    }).toString()

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: context?.signal ? AbortSignal.any([context.signal, AbortSignal.timeout(300_000)]) : AbortSignal.timeout(300_000),
    })
    if (!response.ok) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `Stricker request failed (${response.status})`)
    return asRecords(await responseJson(response, context))
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

  fetchProducts(context?: SupplierFetchContext) {
    return this.download("optionalscomplete", context)
  }

  fetchPrices(context?: SupplierFetchContext) {
    return this.download("optionalsPrice", context)
  }

  fetchStock(context?: SupplierFetchContext) {
    return this.download("stocks", context)
  }

  async fetchDecorations(context?: SupplierFetchContext) {
    return this.download("customizationOptions", context)
  }

  fetchDecorationPrices(context?: SupplierFetchContext) {
    return this.download("customizationTables", context)
  }
}
