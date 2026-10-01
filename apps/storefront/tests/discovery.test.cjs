const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

function load(filename, imports = {}) {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/app/portal/account/discovery", filename),
    "utf8",
  )
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const exported = {}
  vm.runInNewContext(code, {
    exports: exported,
    require: (name) => {
      if (name in imports) return imports[name]
      throw new Error(`Unexpected import: ${name}`)
    },
  })
  return exported
}

const selection = load("selection.ts")
const selected = [
  { product_id: "prod_1", sku: "BAG-01", name: "Backpack" },
  { product_id: "prod_2", sku: "BAG-02", name: "Travel bag" },
]
const plain = (value) => JSON.parse(JSON.stringify(value))
function actions(fetch) {
  return load("actions.ts", {
    "@lib/config": { sdk: { client: { fetch } } },
    "@lib/data/cookies": {
      getAuthHeaders: async () => ({
        authorization: "Bearer scoped-customer-token",
      }),
    },
    "./selection": selection,
  })
}
function detail(id, sku) {
  return {
    product: {
      id,
      name: id === "prod_1" ? "Backpack" : "Travel bag",
      materials: ["Cotton"],
      images: ["/media/product"],
      variants: [
        {
          id: `variant_${id}`,
          sku,
          color: "Blue",
          images: ["/media/blue"],
          stock_quantity: 12,
          dimensions: "30 × 40 cm",
        },
      ],
      decoration_options: [
        {
          name: "Screen",
          positions: [{ name: "Front", max_width_mm: 100, max_height_mm: 80 }],
        },
      ],
    },
  }
}

test("comparison selection is bounded, deduplicated and validates persisted values", () => {
  assert.equal(
    selection.comparisonSelection([...selected, selected[0]]).length,
    2,
  )
  assert.equal(
    selection.comparisonSelection(
      Array.from({ length: 8 }, (_, i) => ({
        product_id: `prod_${i}`,
        sku: `${i}`,
        name: "Product",
      })),
    ).length,
    4,
  )
  assert.equal(
    selection.comparisonSelection([
      { product_id: "../../private", sku: "x", name: "X" },
      null,
    ]).length,
    0,
  )
  for (const value of [0, -1, 1.2, 100001, NaN])
    assert.equal(selection.validQuantity(value), false)
  assert.equal(selection.validQuantity(2000), true)
})

test("comparison uses authenticated server price previews at identical quantity, never catalog from-prices", async () => {
  const requests = []
  const api = actions(async (url, options) => {
    requests.push({ url, options })
    const id = url.includes("prod_1") ? "prod_1" : "prod_2"
    if (options.method !== "POST")
      return detail(id, id === "prod_1" ? "BAG-01" : "BAG-02")
    return { configuration: { base_unit_price: 7.5, estimated_total: 15000 } }
  })
  const compared = await api.compareProducts(selected, 2000)
  assert.equal(compared.length, 2)
  assert.equal(compared[0].unit_price, 7.5)
  assert.equal(compared[0].total, 15000)
  assert.deepEqual(plain(compared[0].printing), [
    { name: "Screen", positions: ["Front · 100 × 80 mm"] },
  ])
  for (const { options } of requests)
    assert.equal(options.headers.authorization, "Bearer scoped-customer-token")
  const writes = requests.filter(({ options }) => options.method === "POST")
  assert.equal(writes.length, 2)
  for (const { options } of writes) {
    assert.equal(options.body.quantity, 2000)
    assert.equal(options.body.preview_only, true)
    assert.equal(options.body.color, "Blue")
    assert.equal(options.body.decorations, undefined)
  }
})

test("comparison rejects invalid quantities and preserves an unavailable column without inventing a price", async () => {
  const api = actions(async (url) => {
    if (url.includes("prod_2")) throw new Error("Unavailable")
    if (url.includes("include_related")) return detail("prod_1", "BAG-01")
    return { configuration: { base_unit_price: null, estimated_total: null } }
  })
  await assert.rejects(api.compareProducts(selected, 0), /quantity/)
  await assert.rejects(api.compareProducts(selected.slice(0, 1), 25), /2–4/)
  const compared = await api.compareProducts(selected, 25)
  assert.equal(compared[0].unit_price, null)
  assert.equal(compared[1].total, null)
  assert.ok(compared[1].error)
})

test("shortlist cart additions check the owned list, preserve its SKU, report partial failure and never auto-retry", async () => {
  const requests = []
  const items = [
    {
      id: "item1",
      product_id: "prod_1",
      sku: "BAG-01",
      product: { id: "prod_1" },
    },
    {
      id: "item2",
      product_id: "prod_2",
      sku: "BAG-02",
      product: { id: "prod_2" },
    },
  ]
  const api = actions(async (url, options) => {
    requests.push({ url, options })
    if (url.includes("discovery"))
      return { shortlists: [{ id: "my-list", items }] }
    if (options.method === "POST") {
      if (url.includes("prod_2")) throw new Error("Cart limit")
      return { configuration: { id: "cart-item" } }
    }
    return detail(
      url.includes("prod_1") ? "prod_1" : "prod_2",
      url.includes("prod_1") ? "BAG-01" : "BAG-02",
    )
  })
  assert.deepEqual(
    plain(await api.addShortlistToCart("my-list", ["item1", "item2"], 50)),
    {
      results: [
        { id: "item1", added: true },
        { id: "item2", added: false },
      ],
    },
  )
  const writes = requests.filter(({ options }) => options.method === "POST")
  assert.equal(writes.length, 2)
  assert.equal(writes[0].options.body.quantity, 50)
  assert.equal(writes[0].options.body.preview_only, undefined)
  await assert.rejects(
    api.addShortlistToCart("other-list", ["item1"], 25),
    /no longer available/,
  )
  await assert.rejects(
    api.addShortlistToCart("my-list", ["item1", "item1"], 25),
    /Select/,
  )
  assert.equal(
    requests.filter(({ options }) => options.method === "POST").length,
    2,
  )
})

test("shared product controls isolate browser storage without another customer lookup or exposing the bearer token", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/app/portal/account/layout.tsx"), "utf8")
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const exported = {}
  const token = "Bearer private-test-session"
  vm.runInNewContext(code, { exports: exported, require: (name) => {
    if (name === "node:crypto") return require(name)
    if (name === "@lib/data/cookies") return { getAuthHeaders: async () => ({ authorization: token }) }
    if (name === "./usage-tracker") return { default: "UsageTracker" }
    if (name === "./discovery/provider") return { default: "Provider" }
    if (name === "react/jsx-runtime") return { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) }
    throw new Error(`Unexpected shared account lookup: ${name}`)
  } })
  const tree = await exported.default({ children: "Product page" })
  assert.equal(tree.type, "Provider")
  assert.equal(tree.props.clientId.length, 32)
  assert.equal(JSON.stringify(tree).includes(token), false)
  assert.equal(tree.key, tree.props.clientId)
})
