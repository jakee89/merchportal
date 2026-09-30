const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

const source = fs.readFileSync(path.join(__dirname, "../src/lib/util/decoration-size.ts"), "utf8")
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const exportsObject = {}
vm.runInNewContext(compiled, { exports: exportsObject })
const { uniquePrintSizes, selectedPrintSize, printDimensionLimits, boundedPrintDimension, validPrintDimensions } = exportsObject

test("shows one button per dimension pair while preserving the selected supplier pricing code", () => {
  const sizes = [
    { id: "DUV1-01-F", pricing_code: "DUV1-01-F", width_mm: 50, height_mm: 6 },
    { id: "DUV1-02-F", pricing_code: "DUV1-02-F", width_mm: 50, height_mm: 6 },
    { id: "DUV1-03-F", pricing_code: "DUV1-03-F", width_mm: 50, height_mm: 6 },
    { id: "DUV1-04-F", pricing_code: "DUV1-04-F", width_mm: 55, height_mm: 6 },
  ]
  for (const size of sizes) {
    const selection = { sizeId: size.id, pricingCode: size.pricing_code }
    const visible = uniquePrintSizes(sizes, selection)
    assert.equal(visible.length, 2)
    assert.equal(visible.filter((item) => item === selectedPrintSize(visible, selection)).length, 1)
    assert.ok(visible.includes(size))
  }
  const saved = { sizeId: "", pricingCode: "DUV1-02-F" }
  assert.equal(selectedPrintSize(uniquePrintSizes(sizes, saved), saved).id, "DUV1-02-F")
})

test("constrains typed and incremented artwork dimensions to the supplied Midocean limits", () => {
  const limits = printDimensionLimits({ max_width_mm: 180, max_height_mm: 160 })
  assert.equal(boundedPrintDimension("1800", limits.width), "180")
  assert.equal(boundedPrintDimension("160.1", limits.height), "160")
  assert.equal(boundedPrintDimension("55.5", limits.width), "55.5")
  assert.equal(boundedPrintDimension("", limits.width), "")
  assert.equal(validPrintDimensions("1800", "160", limits), false)
  assert.equal(validPrintDimensions("180", "160", limits), true)
  assert.equal(validPrintDimensions("", "160", limits), false)
  assert.equal(validPrintDimensions("NaN", "160", limits), false)
  assert.equal(validPrintDimensions("180", "-1", limits), false)
})

test("uses the smaller of a technique-size limit and the physical position limit", () => {
  const limits = printDimensionLimits({ max_width_mm: 55, max_height_mm: 6 }, { id: "size", width_mm: 50, height_mm: 10 })
  assert.equal(limits.width, 50)
  assert.equal(limits.height, 6)
  assert.equal(validPrintDimensions("51", "6", limits), false)
})
