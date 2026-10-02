const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

function load(file, dependencies) {
  const source = fs.readFileSync(path.join(__dirname, "../src/app/portal", file), "utf8")
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, URL, require: (name) => {
    if (name in dependencies) return dependencies[name]
    throw new Error(`Unexpected dependency ${name}`)
  } })
  return exports
}

const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
const styles = { default: {} }
const redirect = (url) => { throw new Error(`redirect:${url}`) }

function harness() {
  let headers = {}, identity = null, error = null
  const requests = []
  const brand = load("portal-brand.tsx", {
    "next/link": { default: "Link" }, react: { cache: (fn) => fn }, "react/jsx-runtime": jsx,
    "@lib/data/cookies": { getAuthHeaders: async () => headers }, "../portal-shell.module.css": styles,
    "@lib/config": { sdk: { client: { fetch: async (url, options) => { requests.push({ url, options }); if (error) throw error; return identity } } } },
  })
  return { brand, requests, set: (auth, me, failure = null) => { headers = auth; identity = me; error = failure } }
}
const valid = { membership: { role: "client_admin" }, organization: { name: "Test company" }, branding: { logo_url: "https://example.com/logo.svg" } }

test("header points to catalog and uses configured logo without exposing auth", async () => {
  const h = harness()
  h.set({ authorization: "Bearer private" }, valid)
  const header = await h.brand.default({ name: "Test company" })
  assert.equal(header.props.href, "/portal/account")
  assert.equal(header.props.children[0].type, "img")
  assert.equal(header.props.children[0].props.src, valid.branding.logo_url)
  assert.equal(header.props.children[1], "Test company")
  assert.equal(h.requests[0].options.cache, "no-store")
  assert.doesNotMatch(JSON.stringify(header), /Bearer private/)
  h.set({ authorization: "Bearer private" }, { ...valid, branding: { logo_url: "" } })
  assert.equal((await h.brand.default({})).props.children[0].type, "span")
})

test("root and login retain valid sessions but show login for missing, expired or revoked sessions", async () => {
  const h = harness()
  const root = load("page.tsx", { "next/navigation": { redirect }, "./portal-brand": h.brand })
  const login = load("login/page.tsx", { "next/navigation": { redirect }, "../portal-brand": h.brand, "next/link": { default: "Link" }, "./auth-form": { default: "AuthForm" }, "../../portal-shell.module.css": styles, "react/jsx-runtime": jsx })
  await assert.rejects(root.default(), /redirect:\/portal\/login/)
  assert.equal(h.requests.length, 0)
  h.set({ authorization: "Bearer valid" }, valid)
  await assert.rejects(root.default(), /redirect:\/portal\/account$/)
  await assert.rejects(login.default({ searchParams: Promise.resolve({ returnTo: "/portal/account/products/pen?sku=91693-132" }) }), /redirect:\/portal\/account\/products\/pen/)
  await assert.rejects(login.default({ searchParams: Promise.resolve({ returnTo: "https://attacker.test" }) }), /redirect:\/portal\/account$/)
  for (const failure of [{ status: 401 }, { statusCode: 403 }]) {
    h.set({ authorization: "Bearer expired" }, null, failure)
    await assert.rejects(root.default(), /redirect:\/portal\/login/)
    assert.equal((await login.default({ searchParams: Promise.resolve({}) })).type, "div")
  }
  h.set({ authorization: "Bearer revoked" }, { membership: null, organization: null })
  await assert.rejects(root.default(), /redirect:\/portal\/login/)
  h.set({ authorization: "Bearer valid" }, null, { status: 500 })
  await assert.rejects(h.brand.getPortalIdentity(), (error) => error.status === 500)
})

test("login return destinations cannot leave the client account", () => {
  const { brand } = harness()
  for (const target of [undefined, "https://attacker.test", "//attacker.test", "/portal/accountant", "/portal/account/../../admin", "/portal/account/\\attacker", "/portal/account\n"]) assert.equal(brand.accountDestination(target), "/portal/account")
  assert.equal(brand.accountDestination("/portal/account?category=Caps"), "/portal/account?category=Caps")
})
