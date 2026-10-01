"use client"

import Link from "next/link"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { compareProducts } from "../discovery/actions"
import { useDiscovery } from "../discovery/provider"
import { selectionKey, validQuantity } from "../discovery/selection"
import type { Comparison } from "../discovery/types"
import styles from "../../../portal-shell.module.css"
import tools from "../discovery/discovery.module.css"

function imageUrl(image?: string) {
  if (!image) return
  if (image.startsWith("/media/")) return `/portal${image}`
  try {
    const url = new URL(image)
    if (url.pathname.startsWith("/media/")) return `/portal${url.pathname}`
  } catch {}
  return image.startsWith("/portal/media/") ? image : undefined
}
const money = (value: number | null) =>
  value === null ? "Quote required" : `€${value.toFixed(2)}`

export default function ComparisonClient() {
  const discovery = useDiscovery()
  const [quantity, setQuantity] = useState(25)
  const [pricedQuantity, setPricedQuantity] = useState(25)
  const [products, setProducts] = useState<Comparison[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const request = useRef(0)
  const signature = discovery?.selected.map(selectionKey).join("|") || ""
  const calculate = async () => {
    const current = ++request.current
    if (!discovery || discovery.selected.length < 2) {
      setProducts([])
      setBusy(false)
      return
    }
    if (!validQuantity(quantity)) {
      setError("Quantity must be between 1 and 100,000")
      return
    }
    setBusy(true)
    setError("")
    try {
      const result = await compareProducts(discovery.selected, quantity)
      if (current === request.current) {
        setProducts(result)
        setPricedQuantity(quantity)
      }
    } catch {
      if (current === request.current)
        setError("Could not calculate this comparison. Please try again.")
    } finally {
      if (current === request.current) setBusy(false)
    }
  }
  useEffect(() => {
    setProducts([])
    calculate()
    return () => {
      request.current++
    }
  }, [signature])
  const rows: Array<{
    name: string
    value: (product: Comparison) => React.ReactNode
  }> = [
    {
      name: `Plain unit price · ${pricedQuantity.toLocaleString()} units`,
      value: (product) => money(product.unit_price),
    },
    {
      name: "Plain product total · excl. VAT",
      value: (product) => money(product.total),
    },
    {
      name: "Selected option / code",
      value: (product) => `${product.color} · ${product.sku}`,
    },
    {
      name: "Stock for this option",
      value: (product) =>
        product.stock === undefined
          ? "Availability on request"
          : product.stock.toLocaleString(),
    },
    {
      name: "Materials",
      value: (product) => product.materials.join(", ") || "Not supplied",
    },
    {
      name: "Dimensions",
      value: (product) => product.dimensions || "Not supplied",
    },
    {
      name: "Printing options",
      value: (product) =>
        product.printing.length ? (
          <ul>
            {product.printing.map((method, index) => (
              <li key={index}>
                <strong>{method.name}</strong>
                <br />
                {method.positions.join("; ")}
              </li>
            ))}
          </ul>
        ) : (
          "No printing data supplied"
        ),
    },
  ]
  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/portal/account">
          <span className={styles.mark}>M</span>Product comparison
        </Link>
        <Link href="/portal/account/shortlists">Shortlists</Link>
      </header>
      <main className={styles.catalogMain}>
        <h1>Compare products</h1>
        <p>
          Choose 2–4 products in the catalog. All prices below use the same
          quantity, for plain products excluding VAT. Configure printing on the
          product page.
        </p>
        <form
          className={tools.toolbar}
          onSubmit={(event) => {
            event.preventDefault()
            calculate()
          }}
        >
          <label>
            Quantity per product{" "}
            <input
              type="number"
              min={1}
              max={100000}
              step={1}
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
            />
          </label>
          <button
            className={tools.primary}
            disabled={busy || (discovery?.selected.length || 0) < 2}
          >
            Update prices
          </button>
          <Link href="/portal/account">Add products</Link>
        </form>
        <div className={tools.toolbar}>
          {discovery?.selected.map((item) => (
            <button
              key={selectionKey(item)}
              type="button"
              onClick={() => discovery.toggle(item)}
            >
              Remove {item.name} · {item.sku} ×
            </button>
          ))}
        </div>
        {busy && <p role="status">Calculating current prices…</p>}
        {error && (
          <p className={tools.error} role="alert">
            {error}
          </p>
        )}
        {(discovery?.selected.length || 0) < 2 && (
          <p>Select at least two products to compare.</p>
        )}
        {products.length > 0 && (
          <div className={tools.comparison} aria-busy={busy}>
            <table>
              <caption>
                Comparison at {pricedQuantity.toLocaleString()} units per
                product
              </caption>
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  {products.map((product) => (
                    <th scope="col" key={selectionKey(product)}>
                      {imageUrl(product.image) && (
                        <Image
                          src={imageUrl(product.image)!}
                          width={300}
                          height={190}
                          alt={product.name}
                          sizes="260px"
                        />
                      )}
                      <Link
                        href={`/portal/account/products/${product.product_id}?sku=${encodeURIComponent(product.sku)}`}
                      >
                        {product.name}
                      </Link>
                      {product.error && (
                        <p className={tools.error}>{product.error}</p>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.name}>
                    <th scope="row">{row.name}</th>
                    {products.map((product) => (
                      <td key={selectionKey(product)}>{row.value(product)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
