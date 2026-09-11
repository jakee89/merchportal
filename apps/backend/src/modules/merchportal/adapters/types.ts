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
}

export function asRecords(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== "object") return []

  const object = payload as Record<string, unknown>
  for (const key of ["products", "items", "data", "stock", "price", "prices", "result"]) {
    if (Array.isArray(object[key])) return object[key] as unknown[]
  }

  return [payload]
}
