const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")
const { createHmac } = require("node:crypto")

test("server-action authentication forwards a signed IP and preserves login outcomes", async () => {
  const secret = "s".repeat(64)
  let result = { token: "test-token" }
  const calls = []
  const sdk = { client: { fetch: async (url, init) => { calls.push({ url, init }); return result } } }
  const dependencies = { "server-only": {}, "node:crypto": require("node:crypto"), "node:net": require("node:net"), "next/headers": { headers: async () => new Map([["x-real-ip", "203.0.113.1"], ["x-forwarded-for", "spoofed"]]) }, "@lib/config": { sdk } }
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/lib/data/auth-proxy.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, process: { env: { AUTH_PROXY_SECRET: secret } }, require: (name) => dependencies[name] })
  assert.equal(await exports.loginCustomer("test@example.com", "test-password"), "test-token")
  const [time, ip, signature] = calls[0].init.headers["x-merchportal-auth-ip"].split("|")
  assert.equal(ip, "203.0.113.1")
  assert.equal(signature, createHmac("sha256", secret).update(`${time}|${ip}`).digest("hex"))
  assert.equal(calls[0].init.cache, "no-store")
  result = { token: "pending", verification_required: true, verification: { email: "test@example.com" } }
  assert.equal((await exports.loginCustomer("test@example.com", "test-password")).verification_required, true)
  result = { token: "pending", mfa_challenge: { id: "challenge" } }
  assert.equal((await exports.loginCustomer("test@example.com", "test-password")).mfa_required, true)
  result = {}
  await assert.rejects(exports.loginCustomer("test@example.com", "test-password"), /Unexpected authentication/)
})
