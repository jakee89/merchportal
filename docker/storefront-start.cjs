const fs = require("node:fs/promises")
const path = require("node:path")
const { spawn } = require("node:child_process")

async function pruneImageCache(directory, maxBytes = 256 * 1024 * 1024, now = Date.now()) {
  const root = path.resolve(directory)
  const files = []
  const folders = []
  async function visit(folder) {
    for (const entry of await fs.readdir(folder, { withFileTypes: true }).catch((error) => { if (error.code === "ENOENT") return []; throw error })) {
      const target = path.join(folder, entry.name)
      // Never traverse links or leave the designated thumbnail-cache folder.
      if (!target.startsWith(`${root}${path.sep}`) || entry.isSymbolicLink()) continue
      if (entry.isDirectory()) { folders.push(target); await visit(target) }
      else if (entry.isFile()) {
        const stat = await fs.lstat(target).catch(() => undefined)
        if (stat?.isFile()) files.push({ target, size: stat.size, time: stat.mtimeMs })
      }
    }
  }
  await visit(root)
  let bytes = files.reduce((total, file) => total + file.size, 0)
  let removed = 0
  for (const file of files.sort((left, right) => left.time - right.time)) {
    if (bytes <= maxBytes && now - file.time <= 14 * 86400_000) continue
    try { await fs.unlink(file.target); bytes -= file.size; removed++ } catch (error) { if (error.code !== "ENOENT") throw error }
  }
  for (const folder of folders.sort((left, right) => right.length - left.length)) {
    // rmdir removes only empty directories, never recursively. Concurrent Next
    // writes simply leave the directory in place for the next maintenance pass.
    await fs.rmdir(folder).catch((error) => { if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code)) throw error })
  }
  return { bytes, removed }
}

module.exports = { pruneImageCache }

if (require.main === module) {
  const directory = path.resolve(__dirname, "../apps/storefront/.next/cache/images")
  let pruning = false
  const prune = async () => {
    if (pruning) return
    pruning = true
    try { await pruneImageCache(directory) } catch { console.warn("Thumbnail-cache maintenance failed") } finally { pruning = false }
  }
  void prune()
  const timer = setInterval(prune, 60_000)
  timer.unref()
  const child = spawn("pnpm", ["--filter", "@dtc/storefront", "start"], { stdio: "inherit" })
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal))
  child.on("error", () => process.exit(1))
  child.on("exit", (code) => { clearInterval(timer); process.exit(code ?? 1) })
}
