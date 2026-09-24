export type SyncKind = "catalog" | "price" | "stock"

export type ConnectionResult = {
  ok: boolean
  message: string
}

export type SupplierFetchContext = {
  signal?: AbortSignal
  onDownloadProgress?: (receivedBytes: number, totalBytes?: number) => Promise<void>
}

export interface SupplierAdapter {
  testConnection(): Promise<ConnectionResult>
  fetchProducts(context?: SupplierFetchContext): Promise<unknown[]>
  fetchPrices(context?: SupplierFetchContext): Promise<unknown[]>
  fetchStock(context?: SupplierFetchContext): Promise<unknown[]>
  fetchDecorations?(context?: SupplierFetchContext): Promise<unknown[]>
  fetchDecorationPrices?(context?: SupplierFetchContext): Promise<unknown[]>
}

export async function responseJson(response: Response, context?: SupplierFetchContext) {
  if (!response.body) return response.json()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  const total = Number(response.headers.get("content-length")) || undefined
  let received = 0
  let lastReported = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.byteLength
    if (context?.onDownloadProgress && (received - lastReported >= 1_000_000 || received === total)) {
      lastReported = received
      await context.onDownloadProgress(received, total)
    }
  }
  await context?.onDownloadProgress?.(received, total)
  const bytes = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder().decode(bytes))
}

export function asRecords(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== "object") return []

  const object = payload as Record<string, unknown>
  const recordKeys = new Set(["products", "items", "data", "print_data", "printing_data", "stock", "price", "prices", "result", "optionalscomplete", "optionalsprice", "stocks", "customizationoptions", "customizationtables"])
  for (const [key, value] of Object.entries(object)) {
    if (recordKeys.has(key.toLowerCase()) && Array.isArray(value)) return value
    if (key.toLowerCase() === "data" && value && typeof value === "object") return asRecords(value)
  }

  return [payload]
}
