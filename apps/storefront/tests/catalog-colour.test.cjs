const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

function loadComponent(filename, imports, hooks) {
  const source = fs.readFileSync(path.join(__dirname, "../src/app/portal/account", filename), "utf8")
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
  const exported = {}
  vm.runInNewContext(compiled, {
    exports: exported,
    URL,
    require: (name) => {
      if (name === "react") return hooks
      if (name === "react/jsx-runtime") return {
        jsx: (type, props, key) => ({ type, props, key }),
        jsxs: (type, props, key) => ({ type, props, key }),
      }
      if (name.endsWith(".module.css")) return { default: {} }
      if (Object.hasOwn(imports, name)) return imports[name]
      throw new Error(`Unexpected test import ${name}`)
    },
  })
  return exported.default
}

function findNode(node, predicate) {
  if (!node || typeof node !== "object") return undefined
  if (predicate(node)) return node
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = findNode(child, predicate)
    if (found) return found
  }
}

test("catalogue swatches change image, SKU, stock and price together", () => {
  let selected
  const image = "ProductImage"
  const Card = loadComponent("catalog-card.tsx", {
    "next/link": { default: "Link" },
    "next/navigation": { useRouter: () => ({ prefetch() {} }) },
    "./product-image": { default: image },
    "./makito-colours": { makitoColourHex: () => undefined },
    "./description-text": { descriptionText: (text) => text },
  }, {
    useRef: (value) => ({ current: value }),
    useState: (initial) => [selected || initial, (value) => { selected = value }],
  })
  const product = { id: "p", name: "AIRLINE", sustainable: false, color_options: [
    { name: "Light Green", sku: "92132-119", image_url: "/media/green", price_eur: 1, stock_quantity: 8 },
    { name: "Red", sku: "92132-105", image_url: "/media/red", price_eur: 2, stock_quantity: 7 },
    { name: "Blue", sku: "92132-104", image_url: "/media/blue", price_eur: 3, stock_quantity: 6 },
  ] }
  const render = () => Card({ product, backend: "https://backend.example" })
  for (const option of product.color_options) {
    const tree = render()
    findNode(tree, (node) => node.props?.["aria-label"] === `Show ${option.name}`).props.onClick()
    const changed = render()
    assert.equal(findNode(changed, (node) => node.type === image).props.src, `/portal${option.image_url}`)
    assert.equal(findNode(changed, (node) => node.props?.["aria-label"] === "Available colours").props.children[0].filter((node) => node.props["aria-pressed"]).length, 1)
    assert.equal(findNode(changed, (node) => node.props?.["aria-label"] === "View AIRLINE").props.href, `/portal/account/products/p?sku=${option.sku}`)
    assert.equal(findNode(changed, (node) => node.type === "strong").props.children, `€${option.price_eur.toFixed(2)}/unit`)
  }
})

test("a colour image source change mounts a fresh image instead of retaining the previous bitmap", () => {
  const Image = loadComponent("product-image.tsx", { "next/image": { default: "NextImage" } }, {
    useState: () => [false, () => {}],
    useEffect() {},
  })
  const green = Image({ src: "/portal/media/green", name: "AIRLINE" })
  const red = Image({ src: "/portal/media/red", name: "AIRLINE" })
  assert.equal(green.key, green.props.src)
  assert.equal(red.key, red.props.src)
  assert.notEqual(green.key, red.key)
  assert.equal(red.props.unoptimized, false)
})
