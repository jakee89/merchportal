const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

function moduleFile(file, dependencies = {}, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, "../src/app/portal", file), "utf8")
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, URLSearchParams, URL, AbortController, ...globals, require: (name) => {
    if (name in dependencies) return dependencies[name]
    throw new Error(`Unexpected dependency ${name}`)
  } })
  return exports
}
const query = moduleFile("account/catalog-query.ts")
const facet = { categories: [], colors: [], sizes: [], materials: [], brands: [], lead_times: [], print_methods: [], availability: { in_stock: 0, out_of_stock: 0, sustainable: 0 } }
const initial = { products: [{ id: "prod_1", name: "Backpack", color_options: [] }], total: 1, page: 1, page_count: 1, page_size: 24 }
const tick = async () => { for (let index = 0; index < 12; index++) await Promise.resolve() }
function find(node, predicate) {
  if (!node || typeof node !== "object") return
  if (predicate(node)) return node
  for (const child of [node.props?.children].flat(Infinity)) { const result = find(child, predicate); if (result) return result }
}
function harness() {
  const states = [], refs = [], effects = [], timers = new Map(), requests = [], history = [], listeners = {}, assigned = []
  let stateIndex = 0, refIndex = 0, effectIndex = 0, timerId = 0
  const window = { location: { origin: "https://portal.test", search: "", assign: (url) => assigned.push(url) }, history: { replaceState: (_state, _unused, url) => history.push(url) }, addEventListener: (name, callback) => { listeners[name] = callback }, removeEventListener: (name) => delete listeners[name] }
  const exports = moduleFile("account/catalog-explorer.tsx", {
    react: {
      useState: (value) => { const id = stateIndex++; if (!(id in states)) states[id] = value; return [states[id], (next) => { states[id] = typeof next === "function" ? next(states[id]) : next }] },
      useRef: (value) => { const id = refIndex++; if (!(id in refs)) refs[id] = { current: value }; return refs[id] },
      useEffect: (callback, deps) => { const id = effectIndex++; if (!effects[id] || deps.some((value, i) => effects[id].deps[i] !== value)) effects[id] = { callback, deps, run: true } },
    },
    "react/jsx-runtime": { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) },
    "next/link": { default: "Link" }, "./catalog-card": { default: "Card" }, "./catalog-filters": { default: "Filters" },
    "./discovery/search-suggestions": { default: "Search" }, "./discovery/actions": { getFeaturedCollections: async () => ({ collections: [] }) },
    "./discovery/featured-carousel": { default: "Featured" }, "./catalog-query": query, "./filter-label": { filterLabel: (_key, value) => value },
    "../../portal-shell.module.css": { default: new Proxy({}, { get: (_target, name) => name }) },
  }, {
    window, setTimeout: (callback) => { const id = ++timerId; timers.set(id, callback); return id }, clearTimeout: (id) => timers.delete(id),
    fetch: (url, options) => new Promise((resolve) => requests.push({ url, options, resolve })),
  })
  return {
    requests, history, listeners, window, assigned,
    render: () => { stateIndex = refIndex = effectIndex = 0; return exports.default({ initialCatalog: initial, initialQuery: "", backend: "", featured: "Server featured" }) },
    effects: () => { effects.forEach((effect) => { if (effect.run) { effect.run = false; effect.callback() } }) },
    timers: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((callback) => callback()) },
  }
}

test("query normalization strips unrelated fields and retains multi-select filters", () => {
  assert.equal(query.catalogQuery(new URLSearchParams("color=Black&color=Blue&color=Black&secret=unsafe&view=anything&page=2")).toString(), "color=Black&color=Blue&page=2")
  assert.throws(() => query.catalogQuery(new URLSearchParams({ color: "x".repeat(2001) })), /too long/)
})

test("cold browsers receive product cards immediately and fetch filter data separately", async () => {
  const h = harness()
  const tree = h.render()
  assert.equal(find(tree, (node) => node.type === "Card").props.product.name, "Backpack")
  h.effects()
  assert.equal(h.requests.length, 1)
  assert.match(h.requests[0].url, /view=facets/)
  h.requests[0].resolve({ ok: true, json: async () => ({ facets: facet }) })
  await tick()
  assert.ok(find(h.render(), (node) => node.type === "Filters"))
  const page = fs.readFileSync(path.join(__dirname, "../src/app/portal/account/page.tsx"), "utf8")
  assert.doesNotMatch(page, /view=facets|StreamedFilters|retrieveCustomer/)
  assert.match(page, /fields=id,first_name,email/)
})

test("rapid filter clicks batch, fetch cards and counts in parallel, and never accept stale results", async () => {
  const h = harness()
  h.render(); h.effects()
  h.requests[0].resolve({ ok: true, json: async () => ({ facets: facet }) }); await tick()
  let tree = h.render()
  find(tree, (node) => node.type === "Filters").props.onNavigate(new URLSearchParams("color=Black"))
  tree = h.render()
  find(tree, (node) => node.type === "Filters").props.onNavigate(new URLSearchParams("color=Black&material=Cotton"))
  h.timers()
  assert.equal(h.requests.length, 3)
  assert.match(h.requests[1].url, /color=Black&material=Cotton&view=products/)
  assert.match(h.requests[2].url, /view=facets/)
  tree = h.render()
  find(tree, (node) => node.type === "Filters").props.onNavigate(new URLSearchParams("color=Blue"))
  assert.equal(h.requests[1].options.signal.aborted, true)
  h.requests[1].resolve({ ok: true, json: async () => ({ ...initial, products: [{ id: "stale", name: "Stale" }] }) })
  await tick()
  assert.equal(find(h.render(), (node) => node.type === "Card").props.product.id, "prod_1")
  h.timers()
  h.requests[3].resolve({ ok: true, json: async () => ({ ...initial, products: [{ id: "blue", name: "Blue" }] }) })
  await tick()
  assert.equal(find(h.render(), (node) => node.type === "Card").props.product.id, "blue")
  // Product response renders before the still-pending count response.
  assert.equal(find(h.render(), (node) => node.type === "section").props["aria-busy"], false)
  assert.equal(h.history.at(-1), "/portal/account?color=Blue")
})

test("expired sessions redirect, errors do not fabricate cards, and back navigation reloads the requested URL", async () => {
  const h = harness()
  h.render(); h.effects()
  h.requests[0].resolve({ ok: false, status: 401 }); await tick()
  assert.match(h.assigned[0], /portal\/login/)
  assert.equal(find(h.render(), (node) => node.type === "Card").props.product.id, "prod_1")
  h.window.location.search = "?q=92147&page=2"
  h.listeners.popstate()
  assert.match(h.requests[1].url, /q=92147&page=2&view=products/)
})

test("catalog proxy keeps authentication server-side and never publicly caches client prices", async () => {
  const fetches = []
  let auth = {}
  const route = moduleFile("catalog/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => ({ body, ...options }) } },
    "@lib/config": { sdk: { client: { fetch: async (url, options) => { fetches.push({ url, options }); return initial } } } },
    "@lib/data/cookies": { getAuthHeaders: async () => auth }, "../account/catalog-query": query,
  })
  const request = { nextUrl: new URL("https://portal.test/portal/catalog?color=Blue&compact=false&view=products"), signal: new AbortController().signal }
  assert.equal((await route.GET(request)).status, 401)
  assert.equal(fetches.length, 0)
  auth = { authorization: "Bearer private-test-token" }
  const result = await route.GET(request)
  assert.equal(result.headers["Cache-Control"], "private, no-store")
  assert.equal(fetches[0].options.headers.authorization, auth.authorization)
  assert.match(fetches[0].url, /compact=true/)
  assert.doesNotMatch(JSON.stringify(result), /private-test-token/)
})
