// Bounded, process-local cache for read-only data. Never cache authentication or cart writes.
export class ReadCache {
  private entries = new Map<string, { expires: number; value: unknown }>()
  private pending = new Map<string, Promise<unknown>>()
  private generation = 0

  constructor(private maximumEntries = 64) {}

  async get<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(key)
    if (cached && cached.expires > Date.now()) {
      this.entries.delete(key)
      this.entries.set(key, cached)
      return cached.value as T
    }
    this.entries.delete(key)
    const pending = this.pending.get(key)
    if (pending) return pending as Promise<T>
    const generation = this.generation
    const request = Promise.resolve().then(load).then((value) => {
      if (generation === this.generation) {
        for (const [entryKey, entry] of this.entries) if (entry.expires <= Date.now()) this.entries.delete(entryKey)
        if (this.entries.size >= this.maximumEntries) this.entries.delete(this.entries.keys().next().value!)
        this.entries.set(key, { value, expires: Date.now() + ttl })
      }
      return value
    }).finally(() => {
      if (this.pending.get(key) === request) this.pending.delete(key)
    })
    this.pending.set(key, request)
    return request
  }

  clear() {
    this.generation++
    this.entries.clear()
    this.pending.clear()
  }
}

export const portalReadCache = new ReadCache()
export const portalSourceCache = new ReadCache(2)
export const portalPreparedCatalogCache = new ReadCache(4)
