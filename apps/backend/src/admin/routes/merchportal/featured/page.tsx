import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Input, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"

type Product = { id: string; name: string; sku?: string; image_url?: string }
type Collection = { label: string; enabled: boolean; product_ids: string[] }
type Response = {
  collections: Collection[]
  can_edit: boolean
  products: Product[]
  selected_products: Product[]
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  })
  const body = await response.json()
  if (!response.ok)
    throw new Error(body.message || "Could not update featured products")
  return body
}

function move<T>(values: T[], index: number, direction: number) {
  const next = [...values]
  const target = index + direction
  if (target < 0 || target >= values.length) return next
  const item = next[index]
  next[index] = next[target]
  next[target] = item
  return next
}

const FeaturedPage = () => {
  const [collections, setCollections] = useState<Collection[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [known, setKnown] = useState<Record<string, Product>>({})
  const [q, setQ] = useState("")
  const [target, setTarget] = useState(0)
  const [canEdit, setCanEdit] = useState(false)
  const [busy, setBusy] = useState("loading")
  const [saved, setSaved] = useState("[]")
  const [error, setError] = useState("")
  const dirty = JSON.stringify(collections) !== saved
  useEffect(() => {
    api<Response>("/admin/merchportal/featured")
      .then((data) => {
        setCollections(data.collections)
        setSaved(JSON.stringify(data.collections))
        setCanEdit(data.can_edit)
        setKnown(
          Object.fromEntries(
            data.selected_products.map((product) => [product.id, product]),
          ),
        )
      })
      .catch((error) => setError(error.message))
      .finally(() => setBusy(""))
  }, [])
  const search = async () => {
    setBusy("search")
    setError("")
    try {
      const data = await api<Response>(
        `/admin/merchportal/featured?q=${encodeURIComponent(q)}`,
      )
      setProducts(data.products)
      setKnown((current) => ({
        ...current,
        ...Object.fromEntries(
          [...data.selected_products, ...data.products].map((product) => [
            product.id,
            product,
          ]),
        ),
      }))
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy("")
    }
  }
  const edit = (index: number, patch: Partial<Collection>) =>
    setCollections((current) =>
      current.map((collection, offset) =>
        offset === index ? { ...collection, ...patch } : collection,
      ),
    )
  const save = async () => {
    setBusy("save")
    setError("")
    try {
      const data = await api<{ collections: Collection[] }>(
        "/admin/merchportal/featured",
        { method: "POST", body: JSON.stringify({ collections }) },
      )
      setCollections(data.collections)
      setSaved(JSON.stringify(data.collections))
      toast.success("Featured collections saved")
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setBusy("")
    }
  }
  return (
    <div className="space-y-4 p-6">
      <Container>
        <Heading level="h1">Featured catalog products</Heading>
        <Text className="mt-2">
          Create up to five labelled carousels, with up to 20 products each.
          Cards use the client’s current selling prices and colour options.
          Disabled or empty collections are hidden.
        </Text>
        <a className="text-ui-fg-interactive" href="/app/merchportal">
          MerchPortal overview →
        </a>
        {error && (
          <Text className="mt-2 text-ui-fg-error" role="alert">
            {error}
          </Text>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            disabled={!canEdit || Boolean(busy) || collections.length >= 5}
            variant="secondary"
            onClick={() => {
              setCollections([
                ...collections,
                { label: "Featured products", enabled: true, product_ids: [] },
              ])
              setTarget(collections.length)
            }}
          >
            Add collection
          </Button>
          <Button
            disabled={!canEdit || Boolean(busy) || !dirty}
            isLoading={busy === "save"}
            onClick={save}
          >
            Save collections
          </Button>
          <Text>
            {busy === "loading"
              ? "Loading…"
              : dirty
                ? "Unsaved changes"
                : "Saved"}
          </Text>
        </div>
        {!canEdit && !busy && (
          <Text>Read-only: administrators manage featured collections.</Text>
        )}
      </Container>
      <Container>
        <Heading level="h2">Find products</Heading>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            search()
          }}
        >
          <Input
            className="max-w-lg"
            value={q}
            maxLength={120}
            placeholder="Product name or exact code"
            aria-label="Find featured products"
            onChange={(event) => setQ(event.target.value)}
          />
          <Button
            variant="secondary"
            disabled={Boolean(busy) || q.trim().length < 2}
          >
            Search
          </Button>
          <select
            className="rounded border p-2"
            aria-label="Collection to add products to"
            value={target}
            onChange={(event) => setTarget(Number(event.target.value))}
          >
            {collections.map((collection, index) => (
              <option key={index} value={index}>
                {collection.label || `Collection ${index + 1}`}
              </option>
            ))}
          </select>
        </form>
        <div className="mt-3 space-y-2">
          {products.map((product) => (
            <div
              key={product.id}
              className="flex items-center justify-between gap-3 rounded border p-3"
            >
              <span>
                {product.name} · {product.sku}
              </span>
              <Button
                size="small"
                disabled={
                  !canEdit ||
                  Boolean(busy) ||
                  !collections[target] ||
                  collections[target].product_ids.length >= 20 ||
                  collections[target].product_ids.includes(product.id)
                }
                onClick={() =>
                  edit(target, {
                    product_ids: [
                      ...collections[target].product_ids,
                      product.id,
                    ],
                  })
                }
              >
                Add
              </Button>
            </div>
          ))}
        </div>
      </Container>
      {collections.map((collection, index) => (
        <Container key={index}>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex-1">
              Carousel label
              <Input
                value={collection.label}
                maxLength={80}
                disabled={!canEdit || Boolean(busy)}
                onChange={(event) => edit(index, { label: event.target.value })}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={collection.enabled}
                disabled={!canEdit || Boolean(busy)}
                onChange={(event) =>
                  edit(index, { enabled: event.target.checked })
                }
              />{" "}
              Visible
            </label>
            <Button
              size="small"
              variant="secondary"
              disabled={!canEdit || Boolean(busy) || !index}
              onClick={() => {
                setCollections(move(collections, index, -1))
                setTarget(0)
              }}
            >
              Move up
            </Button>
            <Button
              size="small"
              variant="secondary"
              disabled={
                !canEdit || Boolean(busy) || index === collections.length - 1
              }
              onClick={() => {
                setCollections(move(collections, index, 1))
                setTarget(0)
              }}
            >
              Move down
            </Button>
            <Button
              size="small"
              variant="secondary"
              disabled={!canEdit || Boolean(busy)}
              onClick={() => {
                if (
                  window.confirm(`Remove “${collection.label}”? Save to apply.`)
                ) {
                  setCollections(
                    collections.filter((_, offset) => offset !== index),
                  )
                  setTarget(0)
                }
              }}
            >
              Remove collection
            </Button>
          </div>
          <Text className="mt-3">
            {collection.product_ids.length}/20 products · shown left to right in
            this order
          </Text>
          <div className="mt-3 space-y-2">
            {collection.product_ids.map((id, offset) => (
              <div
                key={id}
                className="flex flex-wrap items-center gap-3 rounded border p-3"
              >
                {known[id]?.image_url && (
                  <img
                    src={known[id].image_url}
                    alt=""
                    className="h-16 w-16 object-contain"
                    loading="lazy"
                  />
                )}
                <span className="flex-1">
                  {known[id]?.name ||
                    "Product no longer available — remove it before saving"}{" "}
                  · {known[id]?.sku}
                </span>
                <Button
                  size="small"
                  variant="secondary"
                  aria-label="Move product left"
                  disabled={!canEdit || Boolean(busy) || !offset}
                  onClick={() =>
                    edit(index, {
                      product_ids: move(collection.product_ids, offset, -1),
                    })
                  }
                >
                  ←
                </Button>
                <Button
                  size="small"
                  variant="secondary"
                  aria-label="Move product right"
                  disabled={
                    !canEdit ||
                    Boolean(busy) ||
                    offset === collection.product_ids.length - 1
                  }
                  onClick={() =>
                    edit(index, {
                      product_ids: move(collection.product_ids, offset, 1),
                    })
                  }
                >
                  →
                </Button>
                <Button
                  size="small"
                  variant="secondary"
                  disabled={!canEdit || Boolean(busy)}
                  onClick={() =>
                    edit(index, {
                      product_ids: collection.product_ids.filter(
                        (value) => value !== id,
                      ),
                    })
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </Container>
      ))}
    </div>
  )
}

export const config = defineRouteConfig({ label: "Featured products" })
export default FeaturedPage
