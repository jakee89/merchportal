"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import CatalogCard from "../catalog-card"
import {
  addShortlistToCart,
  changeShortlist,
  getShortlists,
} from "../discovery/actions"
import { validQuantity } from "../discovery/selection"
import type { Shortlist } from "../discovery/types"
import styles from "../../../portal-shell.module.css"
import tools from "../discovery/discovery.module.css"

export default function ShortlistsClient({ brand }: { brand?: React.ReactNode }) {
  const [lists, setLists] = useState<Shortlist[]>([])
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [name, setName] = useState("")
  const [quantity, setQuantity] = useState(25)
  const [busy, setBusy] = useState("loading")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const backend = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || ""
  useEffect(() => {
    getShortlists()
      .then(({ shortlists }) => setLists(shortlists))
      .catch(() => setError("Could not load your shortlists"))
      .finally(() => setBusy(""))
  }, [])
  const mutate = async (input: Record<string, unknown>) => {
    setBusy("saving")
    setError("")
    setMessage("")
    try {
      const { shortlists } = await changeShortlist(input)
      setLists(shortlists)
      if (input.action === "create") setName("")
    } catch {
      setError(
        "Could not update the shortlist. Check the name or refresh and try again.",
      )
    } finally {
      setBusy("")
    }
  }
  const add = async (list: Shortlist) => {
    setBusy(list.id)
    setError("")
    setMessage("")
    try {
      const { results } = await addShortlistToCart(
        list.id,
        selected[list.id] || [],
        quantity,
      )
      const success = new Set(
        results.filter((result) => result.added).map((result) => result.id),
      )
      setSelected((current) => ({
        ...current,
        [list.id]: (current[list.id] || []).filter((id) => !success.has(id)),
      }))
      const failures = results.length - success.size
      setMessage(
        `${success.size} product${success.size === 1 ? "" : "s"} added to the cart.${failures ? ` ${failures} could not be added; check availability, cart capacity and account permissions. Successful items have been deselected to avoid adding them twice.` : ""}`,
      )
      window.dispatchEvent(new Event("portal-cart-updated"))
    } catch {
      setError(
        "Could not add these products. Refresh your shortlist and check the quantity.",
      )
    } finally {
      setBusy("")
    }
  }
  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        {brand || <Link className={styles.brand} href="/portal/account">
          <span className={styles.mark}>M</span>Your shortlists
        </Link>}
        <Link href="/portal/account/quotes">Quote cart →</Link>
      </header>
      <main className={styles.catalogMain}>
        <h1>Saved products</h1>
        <p>
          Your lists are private to your account. Save a colour option from the
          catalog, then add selected products as plain items. Printing can be
          configured from the product page or by editing the cart.
        </p>
        <form
          className={tools.toolbar}
          onSubmit={(event) => {
            event.preventDefault()
            mutate({ action: "create", name })
          }}
        >
          <label>
            New list name{" "}
            <input
              value={name}
              maxLength={80}
              required
              placeholder="Christmas gifts"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button
            disabled={Boolean(busy) || !name.trim() || lists.length >= 20}
          >
            Create list
          </button>
        </form>
        <div className={tools.toolbar}>
          <label>
            Quantity per selected product{" "}
            <input
              type="number"
              value={quantity}
              min={1}
              max={100000}
              step={1}
              onChange={(event) => setQuantity(Number(event.target.value))}
            />
          </label>
          <Link href="/portal/account">Browse catalog →</Link>
        </div>
        {error && (
          <p className={tools.error} role="alert">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        {busy === "loading" && <p role="status">Loading shortlists…</p>}
        {!lists.length && !busy && (
          <p>
            No shortlists yet. Create a named list or use Save to list on a
            catalog product.
          </p>
        )}
        {lists.map((list) => (
          <section key={list.id} className={tools.shortlist}>
            <h2>
              {list.name} · {list.items.length} products
            </h2>
            <div className={tools.toolbar}>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => {
                  const value = window.prompt("New shortlist name", list.name)
                  if (value?.trim())
                    mutate({ action: "rename", id: list.id, name: value })
                }}
              >
                Rename list
              </button>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete “${list.name}”? This removes this shortlist, not products already in your cart.`,
                    )
                  )
                    mutate({ action: "delete", id: list.id })
                }}
              >
                Delete list
              </button>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() =>
                  setSelected((current) => ({
                    ...current,
                    [list.id]: list.items
                      .filter((item) => item.product)
                      .slice(0, 20)
                      .map((item) => item.id),
                  }))
                }
              >
                Select first 20
              </button>
              <button
                type="button"
                onClick={() =>
                  setSelected((current) => ({ ...current, [list.id]: [] }))
                }
              >
                Clear selection
              </button>
              <button
                type="button"
                className={tools.primary}
                disabled={
                  Boolean(busy) ||
                  !selected[list.id]?.length ||
                  !validQuantity(quantity)
                }
                onClick={() => add(list)}
              >
                {busy === list.id
                  ? "Adding…"
                  : `Add selected to cart (${selected[list.id]?.length || 0})`}
              </button>
            </div>
            <div className={tools.listGrid}>
              {list.items.map((item) => (
                <div key={item.id} className={tools.listItem}>
                  <label>
                    <input
                      type="checkbox"
                      disabled={
                        Boolean(busy) ||
                        !item.product ||
                        (!(selected[list.id] || []).includes(item.id) &&
                          (selected[list.id]?.length || 0) >= 20)
                      }
                      checked={(selected[list.id] || []).includes(item.id)}
                      onChange={(event) =>
                        setSelected((current) => ({
                          ...current,
                          [list.id]: event.target.checked
                            ? [...(current[list.id] || []), item.id]
                            : (current[list.id] || []).filter(
                                (id) => id !== item.id,
                              ),
                        }))
                      }
                    />
                    Select {item.sku}
                  </label>
                  {item.product ? (
                    <CatalogCard
                      key={`${item.product_id}:${item.sku}`}
                      product={{
                        ...item.product,
                        color_options: item.product.color_options.filter(
                          (option) => option.sku === item.sku,
                        ),
                        color_option_count: 1,
                        sku: item.sku,
                      }}
                      backend={backend}
                    />
                  ) : (
                    <p>Product no longer available · {item.sku}</p>
                  )}
                  <div className={tools.toolbar}>
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => {
                        setSelected((current) => ({
                          ...current,
                          [list.id]: (current[list.id] || []).filter(
                            (id) => id !== item.id,
                          ),
                        }))
                        mutate({
                          action: "remove",
                          id: list.id,
                          item_id: item.id,
                        })
                      }}
                    >
                      Remove from list
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  )
}
