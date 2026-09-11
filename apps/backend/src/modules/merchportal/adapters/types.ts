export type SyncKind = "catalog" | "price" | "stock"

export type ConnectionResult = {
  ok: boolean
  message: string
}

export interface SupplierAdapter {
  testConnection(): Promise<ConnectionResult>
  fetchProducts(): Promise<unknown[]>
  fetchPrices(): Promise<unknown[]>
  fetchStock(): Promise<unknown[]>
  fetchDecorations?(): Promise<unknown[]>
  fetchDecorationPrices?(): Promise<unknown[]>
}

export function asRecords(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== "object") return []

  const object = payload as Record<string, unknown>
  const recordKeys = new Set(["products", "items", "data", "stock", "price", "prices", "result", "optionalscomplete", "optionalsprice", "stocks", "customizationoptions", "customizationtables"])
  for (const [key, value] of Object.entries(object)) {
    if (recordKeys.has(key.toLowerCase()) && Array.isArray(value)) return value
  }

  return [payload]
}
