const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

function load(filename, imports, hooks) {
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2021 } }).outputText
  const exports = {}
  vm.runInNewContext(compiled, { exports, require: (name) => {
    if (name === "react") return hooks
    if (name === "react/jsx-runtime") return { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) }
    if (name.endsWith(".module.css")) return { default: {} }
    if (Object.hasOwn(imports, name)) return imports[name]
    throw new Error(`Unexpected import ${name}`)
  } })
  return exports
}

function nodes(tree) {
  if (!tree || typeof tree !== "object") return []
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)]
}
function text(node) { return [node?.props?.children].flat(Infinity).map((item) => typeof item === "object" ? text(item) : item ?? "").join("") }
function hooks(initial = {}) {
  let cursor = 0
  const state = { ...initial }
  return { reset: () => { cursor = 0 }, state, useState: (value) => {
    const id = cursor++
    if (!(id in state)) state[id] = value
    return [state[id], (next) => { state[id] = typeof next === "function" ? next(state[id]) : next }]
  }, useMemo: (fn) => fn(), useRef: (value) => ({ current: value }), useEffect() {} }
}
const storefront = path.join(__dirname, "../src/app/portal/account")
const admin = path.join(__dirname, "../../backend/src/admin/routes/merchportal/filters")

test("category navigation expands, searches children and selects a parent-scoped path", () => {
  const react = hooks()
  const Category = load(path.join(storefront, "category-navigation.tsx"), {}, react).default
  const choices = []
  const tree = { roots: [{ value: "Bags", count: 10, children: [{ value: "Bags > Backpacks", label: "Backpacks", count: 6 }, { value: "Bags > Totes", label: "Totes", count: 4 }] }, { value: "School", count: 2, children: [{ value: "School > Backpacks", label: "Backpacks", count: 2 }] }] }
  const render = () => { react.reset(); return Category({ tree, selected: [], choose: (...args) => choices.push(args) }) }
  let view = render()
  assert.equal(nodes(view).filter((node) => node.type === "input" && node.props.type === "checkbox").length, 2)
  nodes(view).find((node) => node.props?.["aria-label"] === "Expand Bags").props.onClick()
  view = render()
  assert.equal(nodes(view).filter((node) => node.type === "input" && node.props.type === "checkbox").length, 4)
  nodes(view).find((node) => node.props?.["aria-label"] === "Find categories").props.onChange({ target: { value: "tote" } })
  view = render()
  const labels = nodes(view).filter((node) => node.type === "label")
  assert.equal(labels.length, 2)
  nodes(labels[1]).find((node) => node.type === "input").props.onChange({ target: { checked: true } })
  assert.equal(JSON.stringify(choices), JSON.stringify([["category", "Bags > Totes", true]]))
})

test("selected chips label availability, prices and category paths clearly", () => {
  const { filterLabel } = load(path.join(storefront, "filter-label.ts"), {}, {})
  assert.equal(filterLabel("in_stock", "true"), "In stock")
  assert.equal(filterLabel("min_price", "5"), "Minimum €5")
  assert.equal(filterLabel("category", "Bags > Totes"), "Category: Bags › Totes")
})

test("Shift-click uses filtered visual order, excludes hidden and accepted proposals and clears ranges", () => {
  const { selectProposal } = load(path.join(admin, "proposal-selection.ts"), {}, {})
  assert.equal(JSON.stringify(selectProposal([0], [0, 3, 5], 5, 0, true)), "[0,3,5]")
  assert.equal(JSON.stringify(selectProposal([0, 3, 5], [0, 3, 5], 5, 0, true)), "[]")
  assert.equal(JSON.stringify(selectProposal([0], [0, 3, 5], 1, 0, true)), "[0]")
})

test("AI proposal search, select-all, bulk parents and preview use only filtered proposals", () => {
  const review = { id: "review", status: "ready", facet_type: "category", progress: "3/3", groups: [
    { id: 0, target_value: "Bags > Backpacks", reason: "Useful family", sources: [{ supplier_id: "s", supplier_name: "Stricker", source_value: "Laptop bags" }], count: 10 },
    { id: 1, target_value: "Writing > Pens", reason: "Useful family", sources: [{ supplier_id: "m", supplier_name: "Makito", source_value: "Ballpens" }], count: 5 },
    { id: 2, target_value: "Bags > Totes", reason: "Useful family", sources: [{ supplier_id: "s", supplier_name: "Stricker", source_value: "Shopping bags" }], count: 5, protected: true },
  ] }
  const react = hooks({ 2: review, 8: "all" })
  const selection = load(path.join(admin, "proposal-selection.ts"), {}, {})
  const draft = load(path.join(admin, "category-draft.ts"), {}, {})
  const rules = load(path.join(admin, "../../../../modules/merchportal/facet-taxonomy-rules.ts"), {}, {})
  const AiReview = load(path.join(admin, "ai-review.tsx"), { "@medusajs/ui": { Button: "Button", Container: "Container", Heading: "Heading", Input: "Input", Text: "Text", toast: {} }, "./proposal-selection": selection, "./category-draft": draft, "./mapping-preview": { default: "Preview" }, "../../../../modules/merchportal/facet-taxonomy-rules": rules }, react).default
  const render = () => { react.reset(); return AiReview({ type: "category", supplierId: "", reviews: [], options: [], onChange: async () => {} }) }
  let view = render()
  nodes(view).find((node) => node.props?.["aria-label"] === "Search AI proposals").props.onChange({ target: { value: "Stricker" } })
  view = render()
  nodes(view).find((node) => node.type === "Button" && text(node) === "Select all shown").props.onClick()
  assert.equal(JSON.stringify(react.state[3]), "[0,2]")
  view = render()
  nodes(view).find((node) => node.props?.["aria-label"] === "Bulk parent department").props.onChange({ target: { value: "Travel" } })
  view = render()
  nodes(view).find((node) => node.type === "Button" && text(node).startsWith("Assign parent")).props.onClick()
  assert.equal(react.state[4][0], "Travel > Backpacks")
  assert.equal(react.state[4][2], undefined)
  view = render()
  nodes(view).find((node) => node.type === "Button" && text(node) === "Preview 2 groups").props.onClick()
  view = render()
  const preview = nodes(view).find((node) => node.type === "Preview")
  assert.equal(preview.props.groups.length, 2)
  assert.equal(preview.props.groups[0].target_value, "Travel > Backpacks")
  assert.equal(preview.props.groups.some((group) => group.target_value.includes("Pens")), false)
})
