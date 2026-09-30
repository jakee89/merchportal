import { ReadCache } from "../read-cache"

describe("bounded read cache", () => {
  afterEach(() => jest.useRealTimers())

  it("shares concurrent loads but isolates company and revision keys", async () => {
    const cache = new ReadCache()
    const load = jest.fn().mockResolvedValue({ price: 10 })
    const [first, second] = await Promise.all([cache.get("org-a:rev-1", 1000, load), cache.get("org-a:rev-1", 1000, load)])
    expect(first).toBe(second)
    expect(load).toHaveBeenCalledTimes(1)
    expect(await cache.get("org-b:rev-1", 1000, async () => ({ price: 20 }))).toEqual({ price: 20 })
    expect(await cache.get("org-a:rev-2", 1000, async () => ({ price: 30 }))).toEqual({ price: 30 })
  })

  it("expires values, bounds memory and retries failed reads", async () => {
    jest.useFakeTimers()
    const cache = new ReadCache(2)
    const load = jest.fn().mockResolvedValue(1)
    await cache.get("a", 1000, load)
    await cache.get("b", 1000, load)
    await cache.get("c", 1000, load)
    await cache.get("a", 1000, load)
    expect(load).toHaveBeenCalledTimes(4)
    jest.advanceTimersByTime(1001)
    await cache.get("a", 1000, load)
    expect(load).toHaveBeenCalledTimes(5)
    await expect(cache.get("fail", 1000, async () => { throw new Error("offline") })).rejects.toThrow("offline")
    expect(await cache.get("fail", 1000, async () => 2)).toBe(2)
  })

  it("does not resurrect old data when invalidated during a download", async () => {
    const cache = new ReadCache()
    let finish!: (value: string) => void
    const old = cache.get("a", 1000, () => new Promise<string>((resolve) => { finish = resolve }))
    await Promise.resolve()
    cache.clear()
    expect(await cache.get("a", 1000, async () => "new")).toBe("new")
    finish("old")
    await old
    expect(await cache.get("a", 1000, async () => "unexpected")).toBe("new")
  })
})
