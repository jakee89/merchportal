"use client"

import Link from "next/link"
import { createContext, useContext, useEffect, useRef, useState } from "react"
import { changeShortlist, getShortlists } from "./actions"
import { comparisonSelection, selectionKey } from "./selection"
import type { Selection, Shortlist } from "./types"
import styles from "./discovery.module.css"

type Discovery = {
  selected: Selection[]
  toggle: (item: Selection) => void
  save: (item: Selection) => void
  clear: () => void
}
const Context = createContext<Discovery | null>(null)
export function useDiscovery() {
  return useContext(Context)
}

export default function DiscoveryProvider({
  children,
  clientId,
}: {
  children: React.ReactNode
  clientId: string
}) {
  const [selected, setSelected] = useState<Selection[]>([])
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState<Selection | null>(null)
  const [lists, setLists] = useState<Shortlist[]>([])
  const [listId, setListId] = useState("")
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const dialog = useRef<HTMLDialogElement>(null)
  const storageKey = `merchportal-compare:${clientId}`
  useEffect(() => {
    try {
      setSelected(
        comparisonSelection(
          JSON.parse(sessionStorage.getItem(storageKey) || "[]"),
        ),
      )
    } catch {
      setSelected([])
    }
    setReady(true)
  }, [storageKey])
  useEffect(() => {
    if (ready) {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(selected))
      } catch {}
    }
  }, [selected, ready, storageKey])
  useEffect(() => {
    if (!saving) return
    dialog.current?.showModal()
    let active = true
    setBusy(true)
    getShortlists()
      .then(({ shortlists }) => {
        if (active) {
          setLists(shortlists)
          setListId(shortlists[0]?.id || "")
          setName("")
        }
      })
      .catch(() => {
        if (active) setError("Could not load your shortlists")
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [saving])

  const toggle = (item: Selection) => {
    setMessage("")
    if (selected.some((value) => selectionKey(value) === selectionKey(item)))
      setSelected(
        selected.filter((value) => selectionKey(value) !== selectionKey(item)),
      )
    else if (selected.length < 4) setSelected([...selected, item])
    else setMessage("Compare up to four products. Remove one to add another.")
  }
  const close = () => {
    dialog.current?.close()
    setSaving(null)
    setError("")
  }
  const submit = async () => {
    if (!saving || (!listId && !name.trim())) return
    setBusy(true)
    setError("")
    try {
      let id = listId
      if (!id) {
        const { shortlists, result_id } = await changeShortlist({
          action: "create",
          name,
        })
        if (!result_id) throw new Error("Shortlist could not be created")
        id = result_id
        setLists(shortlists)
        setListId(id)
      }
      await changeShortlist({
        action: "add",
        id,
        product_id: saving.product_id,
        sku: saving.sku,
      })
      setMessage("Saved to your shortlist")
      close()
    } catch {
      setError(
        "Could not save this product. Check the list name and try again.",
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <Context.Provider
      value={{
        selected,
        toggle,
        clear: () => setSelected([]),
        save: (item) => {
          setError("")
          setSaving(item)
        },
      }}
    >
      {children}
      {(selected.length > 0 || message) && (
        <div className={styles.compareBar} role="status">
          <span>{message || `${selected.length}/4 products selected`}</span>
          {selected.length >= 2 && (
            <Link href="/portal/account/compare">Compare products →</Link>
          )}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSelected([])
                setMessage("")
              }}
            >
              Clear
            </button>
          )}
          {message && (
            <button
              type="button"
              aria-label="Dismiss message"
              onClick={() => setMessage("")}
            >
              ×
            </button>
          )}
        </div>
      )}
      {saving && (
        <dialog
          ref={dialog}
          className={styles.dialog}
          aria-labelledby="shortlist-dialog-title"
          onCancel={(event) => {
            event.preventDefault()
            if (!busy) close()
          }}
        >
          <h2 id="shortlist-dialog-title">Save to shortlist</h2>
          <p>
            {saving.name} · {saving.sku}
          </p>
          <label>
            Choose a list
            <select
              value={listId}
              disabled={busy}
              onChange={(event) => setListId(event.target.value)}
            >
              {lists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
              <option value="">Create a new list</option>
            </select>
          </label>
          {!listId && (
            <label>
              New list name
              <input
                value={name}
                maxLength={80}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
                placeholder="Christmas gifts"
              />
            </label>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.toolbar}>
            <button
              type="button"
              className={styles.primary}
              disabled={busy || (!listId && !name.trim())}
              onClick={submit}
            >
              {busy ? "Saving…" : "Save product"}
            </button>
            <button type="button" disabled={busy} onClick={close}>
              Cancel
            </button>
            <Link href="/portal/account/shortlists" onClick={close}>
              View shortlists
            </Link>
          </div>
        </dialog>
      )}
    </Context.Provider>
  )
}

export function ProductActions({ item }: { item: Selection }) {
  const discovery = useDiscovery()
  if (!discovery || !item.sku) return null
  const selected = discovery.selected.some(
    (value) => selectionKey(value) === selectionKey(item),
  )
  return (
    <div className={styles.actions}>
      <button type="button" onClick={() => discovery.save(item)}>
        Save to list
      </button>
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => discovery.toggle(item)}
      >
        {selected ? "Remove comparison" : "Compare"}
      </button>
    </div>
  )
}
