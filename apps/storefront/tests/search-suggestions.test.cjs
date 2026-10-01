const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined
  if (predicate(node)) return node
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = find(child, predicate)
    if (found) return found
  }
}

function harness() {
  const states = [],
    refs = [],
    effects = [],
    timers = new Map(),
    requests = [],
    navigations = []
  let stateIndex = 0,
    refIndex = 0,
    effectIndex = 0,
    nextTimer = 0
  const exported = {}
  const source = fs.readFileSync(
    path.join(
      __dirname,
      "../src/app/portal/account/discovery/search-suggestions.tsx",
    ),
    "utf8",
  )
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText
  vm.runInNewContext(code, {
    exports: exported,
    AbortController,
    setTimeout: (callback, delay) => {
      const id = ++nextTimer
      timers.set(id, { callback, delay })
      return id
    },
    clearTimeout: (id) => timers.delete(id),
    fetch: (url, options) =>
      new Promise((resolve) => requests.push({ url, options, resolve })),
    require: (name) => {
      if (name === "react")
        return {
          useState: (value) => {
            const i = stateIndex++
            if (!(i in states)) states[i] = value
            return [
              states[i],
              (next) => {
                states[i] = typeof next === "function" ? next(states[i]) : next
              },
            ]
          },
          useRef: (value) => {
            const i = refIndex++
            if (!(i in refs)) refs[i] = { current: value }
            return refs[i]
          },
          useId: () => "suggestions-test",
          useEffect: (callback, deps) => {
            const i = effectIndex++,
              previous = effects[i]
            if (
              !previous ||
              deps.some((value, j) => !Object.is(value, previous.deps[j]))
            ) {
              previous?.cleanup?.()
              effects[i] = { deps, callback, pending: true }
            }
          },
        }
      if (name === "react/jsx-runtime")
        return {
          jsx: (type, props, key) => ({ type, props, key }),
          jsxs: (type, props, key) => ({ type, props, key }),
        }
      if (name === "next/link") return { default: "Link" }
      if (name === "next/navigation")
        return { useRouter: () => ({ push: (url) => navigations.push(url) }) }
      if (name.endsWith(".module.css")) return { default: {} }
      throw new Error(`Unexpected import ${name}`)
    },
  })
  return {
    requests,
    navigations,
    timers,
    render() {
      stateIndex = 0
      refIndex = 0
      effectIndex = 0
      const tree = exported.default({ initialValue: "" })
      for (const effect of effects)
        if (effect.pending) {
          effect.pending = false
          effect.cleanup = effect.callback()
        }
      return tree
    },
    runTimer() {
      const [id, timer] = [...timers][0]
      timers.delete(id)
      assert.equal(timer.delay, 250)
      return timer.callback()
    },
  }
}

test("typing suggestions debounce, abort previous work and ignore stale responses", async () => {
  const app = harness()
  let tree = app.render()
  find(tree, (node) => node.type === "input").props.onChange({
    target: { value: "b" },
  })
  app.render()
  assert.equal(app.timers.size, 0)
  tree = app.render()
  find(tree, (node) => node.type === "input").props.onChange({
    target: { value: "back" },
  })
  app.render()
  assert.equal(app.requests.length, 0)
  const first = app.runTimer()
  tree = app.render()
  find(tree, (node) => node.type === "input").props.onChange({
    target: { value: "backpack" },
  })
  app.render()
  assert.equal(app.requests[0].options.signal.aborted, true)
  const second = app.runTimer()
  app.requests[1].resolve({
    ok: true,
    json: async () => ({
      products: [{ id: "prod_1", name: "Backpack", sku: "92147-131" }],
      categories: ["Backpacks"],
    }),
  })
  await second
  app.requests[0].resolve({
    ok: true,
    json: async () => ({
      products: [{ id: "prod_old", name: "Old result" }],
      categories: [],
    }),
  })
  await first
  tree = app.render()
  assert.equal(
    find(tree, (node) => node.props?.role === "option").props.children[0],
    "Backpack",
  )
  assert.equal(
    find(tree, (node) => node.type === "input").props["aria-expanded"],
    true,
  )
})

test("keyboard suggestions keep the chosen SKU and Enter still submits normally without a highlighted choice", async () => {
  const app = harness()
  let tree = app.render()
  find(tree, (node) => node.type === "input").props.onChange({
    target: { value: "92147" },
  })
  app.render()
  const loading = app.runTimer()
  app.requests[0].resolve({
    ok: true,
    json: async () => ({
      products: [{ id: "prod_1", name: "Backpack", sku: "92147-131" }],
      categories: [],
    }),
  })
  await loading
  tree = app.render()
  let prevented = false
  find(tree, (node) => node.type === "input").props.onKeyDown({
    key: "Enter",
    preventDefault: () => {
      prevented = true
    },
  })
  assert.equal(prevented, false)
  find(tree, (node) => node.type === "input").props.onKeyDown({
    key: "ArrowDown",
    preventDefault() {},
  })
  tree = app.render()
  find(tree, (node) => node.type === "input").props.onKeyDown({
    key: "Enter",
    preventDefault: () => {
      prevented = true
    },
  })
  assert.equal(prevented, true)
  assert.equal(
    app.navigations[0],
    "/portal/account/products/prod_1?sku=92147-131",
  )
  tree = app.render()
  assert.equal(
    find(tree, (node) => node.type === "input").props["aria-expanded"],
    false,
  )
})
