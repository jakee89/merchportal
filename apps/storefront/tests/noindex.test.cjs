const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

test("noindex response headers cover all storefront routes without changing image or action settings", async () => {
  const module = { exports: {} }
  const filename = path.join(__dirname, "../next.config.js")
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module,
    process: { env: {} },
    require: (name) => {
      assert.equal(name, "./check-env-variables")
      return () => {}
    },
  })
  const config = module.exports
  const rules = await config.headers()
  assert.equal(rules.length, 1)
  assert.equal(rules[0].source, "/:path*")
  assert.equal(rules[0].headers[0].key, "X-Robots-Tag")
  assert.equal(rules[0].headers[0].value, "noindex, nofollow, nosnippet")
  assert.equal(config.images.minimumCacheTTL, 86400)
  assert.equal(config.experimental.serverActions.bodySizeLimit, "15mb")
})

test("root page metadata prohibits indexing, following links and search snippets", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/app/layout.tsx"),
    "utf8",
  )
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText
  const exports = {}
  vm.runInNewContext(compiled, {
    exports,
    URL,
    require: (name) => {
      if (name === "@lib/util/env")
        return { getBaseURL: () => "https://example.com" }
      if (name === "styles/globals.css" || name === "react/jsx-runtime")
        return {}
      throw new Error(`Unexpected import: ${name}`)
    },
  })
  assert.equal(exports.metadata.robots.index, false)
  assert.equal(exports.metadata.robots.follow, false)
  assert.equal(exports.metadata.robots.nosnippet, true)
  assert.equal(exports.metadata.title.default, "MerchPortal")
})
