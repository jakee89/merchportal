const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

const source = fs.readFileSync(path.join(__dirname, "../src/lib/util/decoration-image.ts"), "utf8")
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const exportsObject = {}
vm.runInNewContext(compiled, { exports: exportsObject })
const { decorationImage } = exportsObject

test("changes print guides with the selected SKU and prefers exact over generic", () => {
  const position = { images: [
    { url: "generic" },
    { variant_sku: "99164-104", variant_color: "Blue", url: "blue" },
    { variant_sku: "99164-123", variant_color: "Light grey", url: "grey" },
  ] }
  assert.equal(decorationImage(position, { sku: "99164-104", color: "Blue" }).url, "blue")
  assert.equal(decorationImage(position, { sku: "99164-123", color: "Light grey" }).url, "grey")
  assert.equal(decorationImage(position, { sku: "99164-103", color: "Black" }).url, "generic")
})

test("matches Midocean colour codes and case-insensitive supplier SKU bindings", () => {
  const position = { images: [{ variant_color: "03", url: "black" }, { variant_color: "04", url: "blue" }] }
  assert.equal(decorationImage(position, { sku: "MO6783-04", color: "Blue", color_code: "04" }).url, "blue")
  assert.equal(decorationImage({ images: [{ variant_sku: " SKU-BLUE ", url: "blue" }] }, { sku: "sku-blue" }).url, "blue")
})

test("never presents another SKU's guide as a match or treats undefined SKUs as exact", () => {
  const position = { image_url: "black", images: [{ variant_color: "Black", url: "black" }] }
  assert.equal(decorationImage(position, { color: "Blue" }).url, undefined)
  assert.equal(decorationImage({ images: [{ variant_sku: "other", variant_color: "Blue", url: "other" }] }, { sku: "selected", color: "Blue" }).url, undefined)
})

test("identifies genuinely generic guides without inventing colour image URLs", () => {
  assert.equal(decorationImage({ image_url: "generic" }, { color: "Blue" }).generic, true)
  assert.equal(decorationImage({ images: [{ variant_color: "Blue", url: "blue" }] }, { color: "Blue" }).generic, false)
})

test("gallery fills its column with proportional, uncropped images", () => {
  const css = fs.readFileSync(path.join(__dirname, "../src/app/portal-shell.module.css"), "utf8")
  const frame = css.match(/\.detailVisual \{([^}]+)\}/)[1]
  const image = css.match(/\.detailVisual img \{([^}]+)\}/)[1]
  assert.match(frame, /width: 100%/)
  assert.match(frame, /aspect-ratio: 1/)
  assert.match(frame, /padding: 0/)
  assert.match(image, /height: 100%/)
  assert.match(image, /object-fit: contain/)
})
