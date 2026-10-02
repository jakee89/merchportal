const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const path = require("node:path")
const os = require("node:os")
const { pruneImageCache } = require("../../../docker/storefront-start.cjs")

test("thumbnail maintenance bounds size and age without touching sibling data", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "merchportal-image-cache-test-"))
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const cache = path.join(directory, "images")
  await fs.mkdir(path.join(cache, "hash"), { recursive: true })
  const now = Date.now()
  for (const [name, age] of [["old.webp", 15 * 86400_000], ["older.webp", 2000], ["new.webp", 0]]) {
    const file = path.join(cache, "hash", name)
    await fs.writeFile(file, Buffer.alloc(8))
    await fs.utimes(file, new Date(now - age), new Date(now - age))
  }
  await fs.writeFile(path.join(directory, "private-artwork.pdf"), "keep")
  assert.deepEqual(await pruneImageCache(cache, 10, now), { bytes: 8, removed: 2 })
  assert.deepEqual(await fs.readdir(path.join(cache, "hash")), ["new.webp"])
  assert.equal(await fs.readFile(path.join(directory, "private-artwork.pdf"), "utf8"), "keep")
})
