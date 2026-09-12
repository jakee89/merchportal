"use client"

import { useEffect, useMemo, useState } from "react"
import styles from "../../../../portal-shell.module.css"
import { savePortalConfiguration, uploadPortalArtwork } from "../actions"

type PriceBreak = { quantity: number; unit_price_eur: number; next_colour_price_eur?: number }
type Position = { id: string; name: string; max_width_mm?: number; max_height_mm?: number; max_colours?: number; image_url?: string }
type Method = { id: string; name: string; positions: Position[]; price_breaks: PriceBreak[]; price_ranges?: Array<{ area_from_cm2?: number; area_to_cm2?: number; price_breaks: PriceBreak[] }>; setup_price_eur?: number; handling_price_breaks?: PriceBreak[]; pricing_type?: string; next_colour_cost_indicator?: boolean }
type Variant = { id: string; sku?: string; title: string; color: string; size?: string; images: string[]; stock_quantity?: number; price_eur?: number; price_breaks?: Array<{ quantity: number; price_eur: number }>; future_stock?: Array<{ date: string; quantity: number }>; color_code?: string; ean?: string; pantone?: string; dimensions?: string }
type Line = { key: number; positionId: string; methodId: string; colours: number; width: string; height: string }
type Props = { productId: string; productName: string; productImages: string[]; backend: string; variants: Variant[]; methods: Method[] }

function mediaUrl(backend: string, value?: string) {
  if (!value) return
  try { const parsed = new URL(value); if (parsed.pathname.startsWith("/media/")) return `${backend.replace(/\/$/, "")}${parsed.pathname}` } catch {}
  return /^https?:\/\//i.test(value) ? value : `${backend.replace(/\/$/, "")}${value}`
}

export default function Configurator({ productId, productName, productImages, backend, variants, methods }: Props) {
  const [variantId, setVariantId] = useState(variants[0]?.id || "")
  const [quantity, setQuantity] = useState(25)
  const [lines, setLines] = useState<Line[]>([])
  const [artwork, setArtwork] = useState<File>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const variant = variants.find((item) => item.id === variantId) || variants[0]
  const gallery = useMemo(() => [...(variant?.images || []), ...productImages].filter((item, index, all) => item && all.indexOf(item) === index), [productImages, variant?.images])
  const [activeImage, setActiveImage] = useState(gallery[0] || "")
  useEffect(() => setActiveImage(gallery[0] || ""), [gallery])
  const positions = useMemo(() => methods.flatMap((method) => method.positions.map((position) => ({ ...position, methodId: method.id }))).reduce<Position[]>((items, position) => items.some((item) => item.id === position.id) ? items : [...items, position], []), [methods])
  const productBreaks = variant?.price_breaks || []
  const productUnitPrice = [...productBreaks].filter((item) => item.quantity <= quantity).sort((a, b) => b.quantity - a.quantity)[0]?.price_eur ?? productBreaks[0]?.price_eur ?? variant?.price_eur

  const updateLine = (key: number, update: Partial<Line>) => setLines((items) => items.map((item) => item.key === key ? { ...item, ...update } : item))
  const linePrice = (line: Line) => {
    const method = methods.find((item) => item.id === line.methodId)
    if (!method) return { unit: 0, setup: 0, pending: false }
    const pricingType = method.pricing_type?.toLowerCase() || ""
    const area = Number(line.width) && Number(line.height) ? Number(line.width) * Number(line.height) / 100 : undefined
    const range = method.price_ranges?.filter((item) => area !== undefined && area >= (item.area_from_cm2 || 0) && area <= (item.area_to_cm2 || Infinity)).sort((a, b) => (b.area_from_cm2 || 0) - (a.area_from_cm2 || 0))[0]
    if (pricingType.includes("area") && area === undefined) return { unit: 0, setup: method.setup_price_eur || 0, pending: true }
    const breaks = range?.price_breaks?.length ? range.price_breaks : method.price_breaks
    const selected = [...breaks].filter((item) => item.quantity <= quantity).sort((a, b) => b.quantity - a.quantity)[0] || breaks[0]
    if (!selected) return { unit: 0, setup: method.setup_price_eur || 0, pending: true }
    const byColour = pricingType.includes("colour") || pricingType.includes("color")
    const unit = byColour ? method.next_colour_cost_indicator && selected.next_colour_price_eur !== undefined ? selected.unit_price_eur + selected.next_colour_price_eur * (line.colours - 1) : selected.unit_price_eur * line.colours : selected.unit_price_eur
    const handling = [...(method.handling_price_breaks || [])].filter((item) => item.quantity <= quantity).sort((a, b) => b.quantity - a.quantity)[0]?.unit_price_eur || 0
    return { unit: unit + handling, setup: (method.setup_price_eur || 0) * (byColour ? line.colours : 1), pending: false }
  }
  const pricedLines = lines.map((line) => {
    const method = methods.find((item) => item.id === line.methodId)
    return { line, price: linePrice(line), method, position: method?.positions.find((item) => item.id === line.positionId) || positions.find((item) => item.id === line.positionId) }
  })
  const decorationUnit = pricedLines.reduce((sum, item) => sum + item.price.unit, 0)
  const setup = pricedLines.reduce((sum, item) => sum + item.price.setup, 0)
  const total = productUnitPrice === undefined ? undefined : (productUnitPrice + decorationUnit) * quantity + setup

  const fileContent = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error("Could not read the artwork file")); reader.onload = () => resolve(String(reader.result).split(",")[1] || ""); reader.readAsDataURL(file) })
  const save = async () => {
    if (!variant) return
    if (lines.some((line) => !line.positionId || !line.methodId)) return setMessage("Choose a position and print technology for every print line")
    if (artwork && artwork.size > 10 * 1024 * 1024) return setMessage("Artwork must be smaller than 10 MB")
    setBusy(true); setMessage("")
    try {
      let uploaded: { id: string; filename: string } | undefined
      if (artwork) { const result = await uploadPortalArtwork({ filename: artwork.name, mime_type: artwork.type, content: await fileContent(artwork) }); uploaded = result.file }
      const result = await savePortalConfiguration(productId, { variant_id: variant.id, quantity, color: variant.color, decorations: lines.map((line) => ({ branding_method: line.methodId, print_position: line.positionId, print_colours: line.colours, print_width_mm: line.width ? Number(line.width) : undefined, print_height_mm: line.height ? Number(line.height) : undefined })), artwork_file_id: uploaded?.id, artwork_filename: uploaded?.filename })
      setMessage(result.configuration.branding_price_pending ? "Configuration saved. One or more printing prices will be confirmed in the final quote." : `Configuration saved. Estimated total €${result.configuration.estimated_total.toFixed(2)}.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save configuration") } finally { setBusy(false) }
  }

  return <>
    <section className={styles.productHero}>
      <div className={styles.productGallery}><button type="button" className={styles.detailVisual} onClick={() => activeImage && window.open(mediaUrl(backend, activeImage), "_blank")} aria-label="Open full-size product image">{activeImage ? <img src={mediaUrl(backend, activeImage)} alt={productName} /> : <span>No image available</span>}</button>{gallery.length > 1 && <div className={styles.thumbnails}>{gallery.map((image, index) => <button className={image === activeImage ? styles.activeThumbnail : ""} type="button" key={`${image}-${index}`} onClick={() => setActiveImage(image)}><img loading="lazy" src={mediaUrl(backend, image)} alt={`${productName} view ${index + 1}`} /></button>)}</div>}</div>
      <div className={styles.productBuyPanel}>
        <h2>Choose colour and option</h2><p className={styles.selectedColour}>{variant?.color || "Standard"}</p>
        <div className={styles.detailSwatches}>{variants.map((item) => <button key={item.id} type="button" className={item.id === variant?.id ? styles.activeDetailSwatch : ""} onClick={() => setVariantId(item.id)}><span>{item.color}</span>{item.size && item.size !== "Standard" && <small>{item.size}</small>}</button>)}</div>
        <dl className={styles.variantFacts}><div><dt>SKU</dt><dd>{variant?.sku || "—"}</dd></div>{variant?.ean && <div><dt>EAN</dt><dd>{variant.ean}</dd></div>}{variant?.pantone && <div><dt>Pantone</dt><dd>{variant.pantone}</dd></div>}{variant?.dimensions && <div><dt>Dimensions</dt><dd>{variant.dimensions}</dd></div>}</dl>
        <h3>Plain product price <small>excl. VAT</small></h3>{productBreaks.length ? <table className={styles.priceTable}><thead><tr><th>Quantity</th><th>Unit price</th></tr></thead><tbody>{productBreaks.map((item) => <tr key={item.quantity}><td>{item.quantity}+</td><td>€{item.price_eur.toFixed(2)}</td></tr>)}</tbody></table> : <p>Price on request</p>}
        <div className={styles.stockPanel}><strong>{variant?.stock_quantity === undefined ? "Availability on request" : `${variant.stock_quantity.toLocaleString()} available now`}</strong>{variant?.future_stock?.map((item) => <span key={`${item.date}-${item.quantity}`}>{item.quantity.toLocaleString()} incoming — {new Date(item.date).toLocaleDateString()}</span>)}</div>
      </div>
    </section>
    <section className={styles.configurator}>
      <div className={styles.configForm}><span className={styles.eyebrow}>Configure printing</span><label>Quantity<input type="number" min="1" max="100000" value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.min(100000, Number(event.target.value) || 1)))} /></label>
        {methods.length ? <>{pricedLines.map(({ line, method, position, price }, index) => { const compatible = methods.filter((item) => item.positions.some((candidate) => candidate.id === line.positionId)); const pricingType = method?.pricing_type?.toLowerCase() || ""; return <div className={styles.printLine} key={line.key}><div className={styles.printLineHeading}><strong>Print {index + 1}</strong><button type="button" onClick={() => setLines((items) => items.filter((item) => item.key !== line.key))}>Remove</button></div><label>Print position<select value={line.positionId} onChange={(event) => updateLine(line.key, { positionId: event.target.value, methodId: "", colours: 1, width: "", height: "" })}><option value="">Choose position</option>{positions.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>{line.positionId && <label>Print technology<select value={line.methodId} onChange={(event) => updateLine(line.key, { methodId: event.target.value })}><option value="">Choose technology</option>{compatible.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}{position?.image_url && <img className={styles.printAreaImage} src={mediaUrl(backend, position.image_url)} alt={`${position.name} print area`} />}{position && <p className={styles.helper}>{position.max_width_mm && position.max_height_mm ? `Maximum area ${position.max_width_mm} × ${position.max_height_mm} mm. ` : ""}{position.max_colours ? `Maximum ${position.max_colours} colours.` : ""}</p>}{method && (position?.max_colours || pricingType.includes("colour") || pricingType.includes("color")) && <label>Print colours<input type="number" min="1" max={position?.max_colours || 10} value={line.colours} onChange={(event) => updateLine(line.key, { colours: Math.max(1, Math.min(position?.max_colours || 10, Number(event.target.value) || 1)) })} /></label>}{method && (position?.max_width_mm || position?.max_height_mm || pricingType.includes("area")) && <div className={styles.dimensionInputs}><label>Width (mm)<input type="number" min="1" max={position?.max_width_mm} value={line.width} onChange={(event) => updateLine(line.key, { width: event.target.value })} /></label><label>Height (mm)<input type="number" min="1" max={position?.max_height_mm} value={line.height} onChange={(event) => updateLine(line.key, { height: event.target.value })} /></label></div>}{method && <p className={styles.linePrice}>{price.pending ? "Printing price to be confirmed" : `€${price.unit.toFixed(2)} each${price.setup ? ` + €${price.setup.toFixed(2)} setup` : ""}`}</p>}</div>})}<button className={styles.addPrint} type="button" onClick={() => setLines((items) => [...items, { key: Date.now(), positionId: "", methodId: "", colours: 1, width: "", height: "" }])}>+ Add print position</button></> : <p className={styles.notice}>No customisation information is available for this product.</p>}
        <label>Artwork (optional)<input type="file" accept=".pdf,.png,.jpg,.jpeg,.svg,application/pdf,image/png,image/jpeg,image/svg+xml" onChange={(event) => setArtwork(event.target.files?.[0])} /></label><p className={styles.helper}>PDF, SVG, PNG or JPG · maximum 10 MB.</p>
      </div>
      <aside className={styles.priceSummary}><h2>Estimate</h2><div><span>Plain product</span><strong>{productUnitPrice === undefined ? "On request" : `€${productUnitPrice.toFixed(2)} × ${quantity}`}</strong></div>{pricedLines.map(({ line, method, price }, index) => <div key={line.key}><span>{method?.name || `Print ${index + 1}`}</span><strong>{price.pending ? "To confirm" : `€${price.unit.toFixed(2)} × ${quantity}`}</strong></div>)}{setup > 0 && <div><span>Setup charges</span><strong>€{setup.toFixed(2)}</strong></div>}<div className={styles.estimateTotal}><span>Estimated total</span><strong>{total === undefined ? "On request" : `€${total.toFixed(2)}`}</strong></div>{total !== undefined && <p className={styles.helper}>€{(total / quantity).toFixed(2)} per unit equivalent · excl. VAT</p>}<button className={styles.primary} type="button" disabled={busy || !variant} onClick={save}>{busy ? "Saving…" : "Save configuration"}</button>{message && <p className={styles.configMessage} aria-live="polite">{message}</p>}</aside>
    </section>
  </>
}
