"use client"

import Link from "next/link"
import { useEffect, useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { Suggestions } from "./types"
import styles from "./discovery.module.css"

export default function SearchSuggestions({
  initialValue = "",
}: {
  initialValue?: string
}) {
  const [value, setValue] = useState(initialValue)
  const [result, setResult] = useState<Suggestions>({
    products: [],
    categories: [],
  })
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const router = useRouter()
  const wrapper = useRef<HTMLDivElement>(null)
  const request = useRef(0)
  const listId = useId()
  useEffect(() => {
    setValue(initialValue)
    setOpen(false)
  }, [initialValue])
  useEffect(() => {
    const version = ++request.current
    setResult({ products: [], categories: [] })
    setActive(-1)
    if (value.trim().length < 2) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/portal/suggestions?q=${encodeURIComponent(value.trim())}`,
          { signal: controller.signal, credentials: "same-origin" },
        )
        if (!response.ok) return
        const data: Suggestions = await response.json()
        if (version === request.current && !controller.signal.aborted)
          setResult(data)
      } catch {
        /* Search submission remains available when suggestions fail. */
      }
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [value])
  const choices = [
    ...result.products.map((product) => ({
      name: product.name,
      detail: product.sku || "Product",
      href: `/portal/account/products/${encodeURIComponent(product.id)}${product.sku ? `?sku=${encodeURIComponent(product.sku)}` : ""}`,
    })),
    ...result.categories.map((category) => ({
      name: category,
      detail: "Category",
      href: `/portal/account?category=${encodeURIComponent(category)}`,
    })),
  ]
  const visible = open && choices.length > 0
  return (
    <div
      ref={wrapper}
      className={styles.suggest}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setOpen(false)
      }}
    >
      <input
        name="q"
        value={value}
        maxLength={120}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={listId}
        aria-activedescendant={
          visible && active >= 0 ? `${listId}-${active}` : undefined
        }
        aria-label="Search catalogue"
        placeholder="Search products or codes"
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setValue(event.target.value)
          setOpen(true)
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false)
            setActive(-1)
          }
          if (event.key === "ArrowDown" && choices.length) {
            event.preventDefault()
            setOpen(true)
            setActive((active + 1) % choices.length)
          }
          if (event.key === "ArrowUp" && choices.length) {
            event.preventDefault()
            setOpen(true)
            setActive((active - 1 + choices.length) % choices.length)
          }
          if (event.key === "Enter" && visible && active >= 0) {
            event.preventDefault()
            setOpen(false)
            router.push(choices[active].href)
          }
        }}
      />
      {visible && (
        <div
          id={listId}
          role="listbox"
          aria-label="Search suggestions"
          className={styles.suggestions}
        >
          {choices.map((choice, index) => (
            <Link
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              key={choice.href}
              prefetch={false}
              href={choice.href}
              onClick={() => setOpen(false)}
            >
              {choice.name}
              <small>{choice.detail}</small>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
