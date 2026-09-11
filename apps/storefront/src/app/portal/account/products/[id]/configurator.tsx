"use client"

import { useMemo, useState } from "react"
import styles from "../../../../portal-shell.module.css"
import { savePortalConfiguration, uploadPortalArtwork } from "../actions"

type Position = {
  id: string
  name: string
  max_width_mm?: number
  max_height_mm?: number
  max_colours?: number
}
type Method = {
  id: string
  name: string
  positions: Position[]
  price_breaks: Array<{ quantity: number; unit_price_eur: number }>
  setup_price_eur?: number
}
type Variant = {
  id: string
  title: string
  color: string
  stock_quantity?: number
  price_eur: number
}

export default function Configurator({
  productId,
  variants,
  methods,
}: {
  productId: string
  variants: Variant[]
  methods: Method[]
}) {
  const [variantId, setVariantId] = useState(variants[0]?.id || "")
  const [quantity, setQuantity] = useState(25)
  const [methodId, setMethodId] = useState("")
  const [positionId, setPositionId] = useState("")
  const [artwork, setArtwork] = useState<File>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const variant = variants.find((item) => item.id === variantId) || variants[0]
  const method = methods.find((item) => item.id === methodId)
  const position = method?.positions.find((item) => item.id === positionId)
  const branding = useMemo(() => {
    const options = (method?.price_breaks || []).filter(
      (item) => item.quantity <= quantity,
    )
    return (
      options.sort((left, right) => right.quantity - left.quantity)[0] ||
      method?.price_breaks?.[0]
    )
  }, [method, quantity])
  const brandingPending = Boolean(method) && !branding
  const total =
    ((variant?.price_eur || 0) + (branding?.unit_price_eur || 0)) * quantity +
    (method?.setup_price_eur || 0)

  const fileContent = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () =>
        reject(new Error("Could not read the artwork file"))
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "")
      reader.readAsDataURL(file)
    })

  const save = async () => {
    if (!variant) return
    if (method && !positionId) return setMessage("Choose a print position")
    if (artwork && artwork.size > 10 * 1024 * 1024)
      return setMessage("Artwork must be smaller than 10 MB")
    setBusy(true)
    setMessage("")
    try {
      let uploaded: { id: string; filename: string } | undefined
      if (artwork) {
        const result = await uploadPortalArtwork({
          filename: artwork.name,
          mime_type: artwork.type,
          content: await fileContent(artwork),
        })
        uploaded = result.file
      }
      const result = await savePortalConfiguration(productId, {
        variant_id: variant.id,
        quantity,
        color: variant.color,
        branding_method: methodId || undefined,
        print_position: positionId || undefined,
        artwork_file_id: uploaded?.id,
        artwork_filename: uploaded?.filename,
      })
      setMessage(
        result.configuration.branding_price_pending
          ? `Configuration saved. Product estimate EUR ${result.configuration.estimated_total.toFixed(2)}; branding will be confirmed in your final quote.`
          : `Configuration saved. Estimated total EUR ${result.configuration.estimated_total.toFixed(2)}.`,
      )
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not save configuration",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.configurator}>
      <div className={styles.configForm}>
        <span className={styles.eyebrow}>Configure your product</span>
        <label>
          Colour and option
          <select
            value={variantId}
            onChange={(event) => setVariantId(event.target.value)}
          >
            {variants.map((item) => (
              <option key={item.id} value={item.id}>
                {item.color} · {item.title}
                {item.stock_quantity !== undefined
                  ? ` · ${item.stock_quantity} available`
                  : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quantity
          <input
            type="number"
            min="1"
            max="100000"
            value={quantity}
            onChange={(event) =>
              setQuantity(
                Math.max(1, Math.min(100000, Number(event.target.value) || 1)),
              )
            }
          />
        </label>
        <label>
          Branding method
          <select
            value={methodId}
            onChange={(event) => {
              setMethodId(event.target.value)
              setPositionId("")
            }}
          >
            <option value="">Plain product</option>
            {methods.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        {method && (
          <label>
            Print position
            <select
              value={positionId}
              onChange={(event) => setPositionId(event.target.value)}
            >
              <option value="">Choose a position</option>
              {method.positions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {position && (
          <p className={styles.helper}>
            {position.max_width_mm && position.max_height_mm
              ? `Maximum artwork: ${position.max_width_mm} × ${position.max_height_mm} mm. `
              : ""}
            {position.max_colours
              ? `Up to ${position.max_colours} colours.`
              : ""}
          </p>
        )}
        <label>
          Artwork (optional)
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.svg,application/pdf,image/png,image/jpeg,image/svg+xml"
            onChange={(event) => setArtwork(event.target.files?.[0])}
          />
        </label>
        <p className={styles.helper}>
          PDF, PNG, JPG or SVG · maximum 10 MB. Artwork stays private.
        </p>
      </div>
      <aside className={styles.priceSummary}>
        <h2>Live estimate</h2>
        <div>
          <span>Product unit price</span>
          <strong>EUR {(variant?.price_eur || 0).toFixed(2)}</strong>
        </div>
        {method && (
          <div>
            <span>Branding</span>
            <strong>
              {branding
                ? `EUR ${branding.unit_price_eur.toFixed(2)} each`
                : "To be confirmed"}
            </strong>
          </div>
        )}
        {method?.setup_price_eur ? (
          <div>
            <span>Setup</span>
            <strong>EUR {method.setup_price_eur.toFixed(2)}</strong>
          </div>
        ) : null}
        <div className={styles.estimateTotal}>
          <span>Estimated total</span>
          <strong>EUR {total.toFixed(2)}</strong>
        </div>
        {brandingPending && (
          <p className={styles.helper}>
            The product total is live. Branding is excluded until its supplier
            price is available and will be confirmed before ordering.
          </p>
        )}
        <button
          className={styles.primary}
          type="button"
          disabled={busy || !variant}
          onClick={save}
        >
          {busy ? "Saving…" : "Save configuration"}
        </button>
        {message && (
          <p className={styles.configMessage} aria-live="polite">
            {message}
          </p>
        )}
      </aside>
    </section>
  )
}
