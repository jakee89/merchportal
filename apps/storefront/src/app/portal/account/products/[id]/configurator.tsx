"use client"

import { useEffect, useMemo, useState } from "react"
import styles from "../../../../portal-shell.module.css"
import Link from "next/link"
import { previewPortalConfiguration, savePortalConfiguration, uploadPortalArtwork } from "../actions"

type PriceBreak = { quantity: number; unit_price_eur: number; next_colour_price_eur?: number }
type PriceTable = { code: string; option_code?: string; max_colours?: number; max_area_cm2?: number; max_stitches?: number; price_by_color: boolean; price_by_area: boolean; price_by_stitches?: boolean; price_breaks: PriceBreak[] }
type SizeOption = { id: string; label: string; width_mm: number; height_mm: number; pricing_code?: string }
type Position = {
  id: string
  name: string
  max_width_mm?: number
  max_height_mm?: number
  max_colours?: number
  handling_price_eur?: number
  image_url?: string
  images?: Array<{ variant_color?: string; url: string }>
  size_options?: SizeOption[]
}
type Method = {
  id: string
  name: string
  positions: Position[]
  price_breaks: PriceBreak[]
  price_ranges?: Array<{ area_from_cm2?: number; area_to_cm2?: number; price_breaks: PriceBreak[] }>
  setup_price_eur?: number
  handling_price_breaks?: PriceBreak[]
  pricing_type?: string
  next_colour_cost_indicator?: boolean
  colour_mode?: "full_colour" | "spot_colour" | "colourless"
  price_tables?: PriceTable[]
}
type Variant = {
  id: string
  sku?: string
  title: string
  color: string
  size?: string
  images: string[]
  stock_quantity?: number
  price_eur?: number
  price_breaks?: Array<{ quantity: number; price_eur: number }>
  future_stock?: Array<{ date: string; quantity: number }>
  color_code?: string
  color_hex?: string
  ean?: string
  pantone?: string
  dimensions?: string
}
type Line = { key: number; positionId: string; methodId: string; sizeId: string; pricingCode: string; colours: number; stitches: number; width: string; height: string }
type Props = { productId: string; productName: string; productImages: string[]; backend: string; variants: Variant[]; methods: Method[]; initialSku?: string }

function mediaUrl(backend: string, value?: string) {
  if (!value) return
  if (value.startsWith("/media/")) return `/portal${value}`
  try {
    const parsed = new URL(value)
    if (parsed.pathname.startsWith("/media/")) return `/portal${parsed.pathname}`
  } catch {}
  return /^https?:\/\//i.test(value) ? value : `${backend.replace(/\/$/, "")}${value}`
}

function SafeImage({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  if (!src || failed) return <span className={styles.imageUnavailable}>Image unavailable</span>
  return <img className={className} src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
}

function colourMode(method?: Method) {
  if (method?.colour_mode === "full_colour") return "Full colour (CMYK)"
  if (method?.colour_mode === "colourless") return "Colourless"
  if (method?.colour_mode === "spot_colour") return "Spot colours"
  const value = `${method?.name || ""} ${method?.pricing_type || ""}`.toLowerCase()
  if (/laser|engraving|emboss|deboss/.test(value)) return "Colourless"
  if (/digital|sublimation|dtf|uv|full.?colou?r|process/.test(value)) return "Full colour (CMYK)"
  return "Spot colours"
}

export default function Configurator({ productId, productName, productImages, backend, variants, methods, initialSku }: Props) {
  const [variantId, setVariantId] = useState(variants.find((item) => item.sku === initialSku)?.id || variants[0]?.id || "")
  const [quantity, setQuantity] = useState(25)
  const [lines, setLines] = useState<Line[]>([])
  const [artwork, setArtwork] = useState<File>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [verified, setVerified] = useState<{ base_unit_price: number | null; estimated_total: number | null; branding_price_pending: boolean; decoration_lines: Array<{ unit_price_eur: number | null; setup_price_eur: number | null; price_pending: boolean }> }>()
  const [verificationStatus, setVerificationStatus] = useState<"checking" | "ready" | "error">("checking")
  const [verificationError, setVerificationError] = useState("")
  const variant = variants.find((item) => item.id === variantId) || variants[0]
  const gallery = useMemo(() => [...(variant?.images || []), ...productImages].filter((item, index, all) => item && all.indexOf(item) === index), [productImages, variant?.images])
  const [activeImage, setActiveImage] = useState(gallery[0] || "")
  useEffect(() => setActiveImage(gallery[0] || ""), [gallery])

  const positions = useMemo(() => methods.flatMap((method) => method.positions).reduce<Position[]>((all, candidate) => {
    const current = all.find((item) => item.id === candidate.id)
    if (!current) return [...all, { ...candidate }]
    current.image_url ||= candidate.image_url
    current.images = [...(current.images || []), ...(candidate.images || [])].filter((item, index, list) => list.findIndex((other) => other.url === item.url && other.variant_color === item.variant_color) === index)
    current.size_options = [...(current.size_options || []), ...(candidate.size_options || [])].filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index)
    return all
  }, []), [methods])
  const methodChoices = useMemo(() => {
    const grouped = new Map<string, { name: string; methods: Method[] }>()
    for (const method of methods) {
      const key = method.name.trim().toLocaleLowerCase()
      const group = grouped.get(key)
      if (group) group.methods.push(method)
      else grouped.set(key, { name: method.name, methods: [method] })
    }
    return Array.from(grouped.entries()).map(([key, group]) => ({ key, ...group }))
  }, [methods])
  const productBreaks = variant?.price_breaks || []
  const productUnitPrice = [...productBreaks].filter((item) => item.quantity <= quantity).sort((a, b) => b.quantity - a.quantity)[0]?.price_eur ?? (productBreaks.length ? undefined : variant?.price_eur)
  const displayedBasePrice = verified ? verified.base_unit_price : productUnitPrice

  const compatibleMethods = (positionId: string) => methods.filter((method) => method.positions.some((position) => position.id === positionId))
  const compatibleChoices = (positionId: string) => methodChoices.filter((choice) => choice.methods.some((method) => method.positions.some((position) => position.id === positionId)))
  const choiceForMethod = (methodId: string) => methodChoices.find((choice) => choice.methods.some((method) => method.id === methodId))
  const sizeChoices = (line: Line) => {
    const method = methods.find((item) => item.id === line.methodId)
    const sizes = method?.positions.find((position) => position.id === line.positionId)?.size_options || []
    return sizes.filter((size, index) => sizes.findIndex((other) => other.width_mm === size.width_mm && other.height_mm === size.height_mm && other.pricing_code === size.pricing_code) === index).map((size) => ({ ...size, methodId: line.methodId }))
  }
  const selectedPosition = (line: Line) => methods.find((item) => item.id === line.methodId)?.positions.find((item) => item.id === line.positionId) || positions.find((item) => item.id === line.positionId)
  const positionImage = (position?: Position) => {
    const exact = position?.images?.find((image) => image.variant_color && [variant?.color, variant?.color_code].filter(Boolean).some((value) => value?.toLowerCase() === image.variant_color?.toLowerCase()))
    return mediaUrl(backend, exact?.url || position?.images?.[0]?.url || position?.image_url)
  }
  const updateLine = (key: number, update: Partial<Line>) => setLines((items) => items.map((item) => item.key === key ? { ...item, ...update } : item))
  const firstStitchTier = (method?: Method) => Array.from(new Set((method?.price_tables || []).filter((table) => table.price_by_stitches && table.max_stitches).map((table) => Number(table.max_stitches)))).sort((left, right) => left - right)[0] || 0
  const choosePosition = (line: Line, positionId: string) => {
    const method = compatibleMethods(positionId)[0]
    const position = method?.positions.find((item) => item.id === positionId) || positions.find((item) => item.id === positionId)
    const size = position?.size_options?.[0]
    updateLine(line.key, { positionId, methodId: method?.id || "", sizeId: size?.id || "", pricingCode: size?.pricing_code || method?.id || "", colours: 1, stitches: firstStitchTier(method), width: String(size?.width_mm || position?.max_width_mm || ""), height: String(size?.height_mm || position?.max_height_mm || "") })
  }
  const chooseMethod = (line: Line, choiceKey: string) => {
    const method = methodChoices.find((item) => item.key === choiceKey)?.methods.find((item) => item.positions.some((position) => position.id === line.positionId))
    if (!method) return
    const methodId = method.id
    const position = method.positions.find((item) => item.id === line.positionId)
    const size = position?.size_options?.[0]
    updateLine(line.key, { methodId, sizeId: size?.id || "", pricingCode: size?.pricing_code || methodId, colours: 1, stitches: firstStitchTier(method), width: String(size?.width_mm || position?.max_width_mm || ""), height: String(size?.height_mm || position?.max_height_mm || "") })
  }
  const chooseSize = (line: Line, size: SizeOption & { methodId: string }) => updateLine(line.key, { methodId: size.methodId, sizeId: size.id, pricingCode: size.pricing_code || size.id, colours: 1, stitches: firstStitchTier(methods.find((item) => item.id === size.methodId)), width: String(size.width_mm), height: String(size.height_mm) })

  const pricedLines = lines.map((line) => {
    const method = methods.find((item) => item.id === line.methodId)
    return { line, method, position: selectedPosition(line) }
  })
  const decorations = lines.map((line) => ({ branding_method: line.methodId, print_position: line.positionId, pricing_code: line.pricingCode, print_colours: line.colours, print_stitches: line.stitches || undefined, print_width_mm: line.width ? Number(line.width) : undefined, print_height_mm: line.height ? Number(line.height) : undefined }))
  const selectionKey = JSON.stringify({ variant_id: variant?.id, quantity, decorations })
  useEffect(() => {
    if (!variant || lines.some((line) => !line.positionId || !line.methodId)) { setVerified(undefined); setVerificationStatus("checking"); return }
    let cancelled = false
    setVerified(undefined)
    setVerificationStatus("checking")
    setVerificationError("")
    const timer = window.setTimeout(() => previewPortalConfiguration(productId, { variant_id: variant.id, quantity, color: variant.color, decorations })
      .then((result) => { if (!cancelled) { setVerified(result.configuration); setVerificationStatus("ready") } })
      .catch((error) => { if (!cancelled) { setVerificationStatus("error"); setVerificationError(error instanceof Error ? error.message : "Could not verify this configuration") } }), 450)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [productId, selectionKey])

  const fileContent = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Could not read the artwork file"))
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "")
    reader.readAsDataURL(file)
  })
  const save = async () => {
    if (!variant) return
    if (lines.some((line) => !line.positionId || !line.methodId)) return setMessage("Choose a position and print technology for every print line")
    if (artwork && artwork.size > 10 * 1024 * 1024) return setMessage("Artwork must be smaller than 10 MB")
    setBusy(true)
    setMessage("")
    try {
      let uploaded: { id: string; filename: string } | undefined
      if (artwork) {
        const result = await uploadPortalArtwork({ filename: artwork.name, mime_type: artwork.type, content: await fileContent(artwork) })
        uploaded = result.file
      }
      const result = await savePortalConfiguration(productId, { variant_id: variant.id, quantity, color: variant.color, decorations, artwork_file_id: uploaded?.id, artwork_filename: uploaded?.filename })
      setMessage(result.configuration.branding_price_pending ? "Added to cart · Quote required for one or more prices." : `Added to cart · Estimated total €${result.configuration.estimated_total?.toFixed(2)}.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save configuration")
    } finally {
      setBusy(false)
    }
  }

  return <>
    <section className={styles.productHero}>
      <div className={styles.productGallery}>
        <button type="button" className={styles.detailVisual} onClick={() => activeImage && window.open(mediaUrl(backend, activeImage), "_blank")} aria-label="Open full-size product image"><SafeImage src={mediaUrl(backend, activeImage)} alt={productName} /></button>
        {gallery.length > 1 && <div className={styles.thumbnails}>{gallery.map((image, index) => <button className={image === activeImage ? styles.activeThumbnail : ""} type="button" key={`${image}-${index}`} onClick={() => setActiveImage(image)}><SafeImage src={mediaUrl(backend, image)} alt={`${productName} view ${index + 1}`} /></button>)}</div>}
      </div>
      <div className={styles.productBuyPanel}>
        <h2>Choose colour and option</h2>
        <p className={styles.selectedColour}>{variants.length} options · Selected: <strong>{variant?.color || "—"}</strong>{variant?.size && variant.size !== "Standard" ? ` · ${variant.size}` : ""}</p>
        <div className={styles.variantChoices} role="group" aria-label="Available colours and variants">{variants.map((item) => <button type="button" key={item.id} className={item.id === variant?.id ? styles.activeVariantChoice : ""} aria-pressed={item.id === variant?.id} title={`${item.color}${item.size && item.size !== "Standard" ? ` · ${item.size}` : ""}`} onClick={() => setVariantId(item.id)}><span className={styles.variantChoiceImage}>{item.color_hex ? <span className={styles.variantColour} style={{ backgroundColor: item.color_hex }} /> : <SafeImage src={mediaUrl(backend, item.images?.[0])} alt="" />}</span><span><strong>{item.color}</strong>{item.size && item.size !== "Standard" && <small>{item.size}</small>}</span></button>)}</div>
        {variants.length > 12 && <label className={styles.variantSelectFallback}>Find an option<select value={variant?.id || ""} onChange={(event) => setVariantId(event.target.value)}>{variants.map((item) => <option key={item.id} value={item.id}>{item.color}{item.size && item.size !== "Standard" ? ` · ${item.size}` : ""}{item.sku ? ` · ${item.sku}` : ""}</option>)}</select></label>}
        <dl className={styles.variantFacts}><div><dt>SKU</dt><dd>{variant?.sku || "—"}</dd></div>{variant?.ean && <div><dt>EAN</dt><dd>{variant.ean}</dd></div>}{variant?.pantone && <div><dt>Pantone</dt><dd>{variant.pantone}</dd></div>}{variant?.dimensions && <div><dt>Dimensions</dt><dd>{variant.dimensions}</dd></div>}</dl>
        <h3>Plain product price <small>excl. VAT</small></h3>{productBreaks.some((item) => item.price_eur > 0) ? <table className={styles.priceTable}><thead><tr><th>Quantity</th><th>Unit price</th></tr></thead><tbody>{productBreaks.filter((item) => item.price_eur > 0).map((item) => <tr key={item.quantity}><td>{item.quantity}+</td><td>€{item.price_eur.toFixed(2)}</td></tr>)}</tbody></table> : <p>Price on request</p>}
        <div className={styles.stockPanel}><strong>{variant?.stock_quantity === undefined ? "Availability on request" : `${variant.stock_quantity.toLocaleString()} available now`}</strong>{variant?.future_stock?.map((item) => <span key={`${item.date}-${item.quantity}`}>{item.quantity.toLocaleString()} incoming — {new Date(item.date).toLocaleDateString()}</span>)}</div>
      </div>
    </section>
    <section className={styles.configurator}>
      <div className={styles.configForm}><span className={styles.eyebrow}>Configure printing</span><label>Quantity<input type="number" min="1" max="100000" value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.min(100000, Number(event.target.value) || 1)))} /></label>
        {methods.length ? <>{pricedLines.map(({ line, method, position }, index) => {
          const price = verified?.decoration_lines[index]
          const compatible = compatibleChoices(line.positionId)
          const sizes = sizeChoices(line)
          const stitchTiers = Array.from(new Set((method?.price_tables || []).filter((table) => table.price_by_stitches && table.max_stitches).map((table) => Number(table.max_stitches)))).sort((left, right) => left - right)
          return <div className={styles.printLine} key={line.key}>
            <div className={styles.printLineHeading}><strong>Print position {index + 1}</strong><button type="button" onClick={() => setLines((items) => items.filter((item) => item.key !== line.key))}>Remove</button></div>
            <div className={styles.positionCards}>{positions.filter((item) => item.id === line.positionId || !lines.some((other) => other.key !== line.key && other.positionId === item.id)).map((item) => <button type="button" key={item.id} className={item.id === line.positionId ? styles.activePositionCard : ""} aria-pressed={item.id === line.positionId} onClick={() => choosePosition(line, item.id)}><SafeImage src={positionImage(item)} alt={`${item.name} print area`} /><strong>{item.name}</strong>{item.max_width_mm && item.max_height_mm && <span>W {item.max_width_mm} × H {item.max_height_mm} mm</span>}</button>)}</div>
            {line.positionId && <label>Technique<select value={choiceForMethod(line.methodId)?.key || ""} onChange={(event) => chooseMethod(line, event.target.value)}>{compatible.map((item) => <option value={item.key} key={item.key}>{item.name}</option>)}</select></label>}
            {method && <label>Colour mode<input value={colourMode(method)} readOnly /></label>}
            {sizes.length > 0 && <div className={styles.sizeOptions}><span>Print size (W × H)</span><div>{sizes.map((size) => <button type="button" key={`${size.methodId}:${size.id}`} className={Number(line.width) === size.width_mm && Number(line.height) === size.height_mm ? styles.activeSizeOption : ""} onClick={() => chooseSize(line, size)}>{size.label}</button>)}</div></div>}
            {position && !sizes.length && <p className={styles.helper}>{position.max_width_mm && position.max_height_mm ? `Maximum area ${position.max_width_mm} × ${position.max_height_mm} mm. ` : ""}{position.max_colours ? `Maximum ${position.max_colours} colours.` : ""}</p>}
            {method && colourMode(method) === "Spot colours" && <label>Number of print colours<select value={line.colours} onChange={(event) => updateLine(line.key, { colours: Number(event.target.value) })}>{Array.from({ length: position?.max_colours || 1 }, (_, colourIndex) => colourIndex + 1).map((count) => <option value={count} key={count}>{count}</option>)}</select></label>}
            {stitchTiers.length > 0 && <label>Stitch count<select value={line.stitches} onChange={(event) => updateLine(line.key, { stitches: Number(event.target.value) })}>{stitchTiers.map((count) => <option value={count} key={count}>Up to {count.toLocaleString()} stitches</option>)}</select></label>}
            {method && <p className={styles.linePrice}>{verificationStatus === "checking" ? "Checking supplier price…" : !price || price.price_pending ? "Quote required" : `€${price.unit_price_eur?.toFixed(2)} each${price.setup_price_eur ? ` + €${price.setup_price_eur.toFixed(2)} setup` : ""}`}</p>}
          </div>
        })}{lines.length < positions.length && <button className={styles.addPrint} type="button" onClick={() => setLines((items) => [...items, { key: Date.now(), positionId: "", methodId: "", sizeId: "", pricingCode: "", colours: 1, stitches: 0, width: "", height: "" }])}>+ Add print position</button>}</> : <p className={styles.notice}>No customisation information is available for this product.</p>}
        <label>Artwork (optional)<input type="file" accept=".pdf,.png,.jpg,.jpeg,.svg,application/pdf,image/png,image/jpeg,image/svg+xml" onChange={(event) => setArtwork(event.target.files?.[0])} /></label><p className={styles.helper}>PDF, SVG, PNG or JPG · maximum 10 MB.</p>
      </div>
      <aside className={styles.priceSummary}>
        <h2>Estimate for {quantity.toLocaleString()} units</h2>
        <div><span>Plain product</span><strong>{displayedBasePrice === undefined || displayedBasePrice === null || !Number.isFinite(displayedBasePrice) || displayedBasePrice <= 0 ? "Quote required" : `€${displayedBasePrice.toFixed(2)} × ${quantity} = €${(displayedBasePrice * quantity).toFixed(2)}`}</strong></div>
        {pricedLines.map(({ line, method }, index) => {
          const price = verified?.decoration_lines[index]
          return <div key={line.key}><span>{method?.name || `Print ${index + 1}`}</span><strong>{!price || price.price_pending || price.unit_price_eur === null ? "Quote required" : `€${price.unit_price_eur.toFixed(2)} × ${quantity}${price.setup_price_eur ? ` + €${price.setup_price_eur.toFixed(2)} setup` : ""} = €${(price.unit_price_eur * quantity + (price.setup_price_eur || 0)).toFixed(2)}`}</strong></div>
        })}
        <div className={styles.estimateTotal}><span>Estimated total · excl. VAT</span><strong>{verificationStatus === "checking" ? "Checking…" : verified?.estimated_total === null || !verified ? "Quote required" : `€${verified.estimated_total.toFixed(2)}`}</strong></div>
        {verified?.base_unit_price === null && <p className={styles.helper}>The plain-product price is unavailable for this option. We’ll confirm the full amount in your quote.</p>}
        {verificationError && <p className={styles.helper} role="alert">{verificationError}</p>}
        {verified?.estimated_total !== null && verified?.estimated_total !== undefined && <p className={styles.helper}>€{(verified.estimated_total / quantity).toFixed(2)} per unit equivalent. Final price confirmed by staff.</p>}
        <button className={styles.primary} type="button" disabled={busy || !variant || verificationStatus === "error"} onClick={save}>{busy ? "Adding…" : "Add to quote cart"}</button>
        {message && <p className={styles.configMessage} aria-live="polite">{message} <Link href="/portal/account/quotes">Review cart →</Link></p>}
      </aside>
    </section>
  </>
}
