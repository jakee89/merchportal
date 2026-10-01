import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "../modules/merchportal"
import { loadEmailSettings } from "../modules/merchportal/email-settings"
import { renderEmailTemplate, sendTemplatedPortalEmail } from "../modules/merchportal/email-templates"
import { quoteWithItems } from "./quote-cart"

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character)
}

function mediaUrl(value: unknown) {
  if (typeof value !== "string" || !/^\/media\/[A-Za-z0-9_.-]+$/.test(value)) return ""
  const site = (process.env.STOREFRONT_URL || "https://merchportal.customislandgifts.mt").replace(/\/$/, "")
  return `${site}/portal${value}`
}

function addressText(value: any) {
  return [value?.line1, value?.line2, value?.city, value?.postal_code, value?.country_code?.toUpperCase()].filter(Boolean).join(", ")
}

export function staffQuoteEmail(quote: any) {
  const admin = (process.env.ADMIN_URL || "https://api.merchportal.customislandgifts.mt").replace(/\/$/, "")
  const details = quote.contact_details || {}
  const buyer = [
    `Company: ${details.company_name || "Not supplied"}`,
    `Contact: ${details.contact_name || "Not supplied"}`,
    `Email: ${details.contact_email || "Not supplied"}`,
    `Phone: ${details.phone || "Not supplied"}`,
    `VAT: ${details.vat_number || "Not supplied"}`,
    `Billing: ${addressText(details.billing_address) || "Not supplied"}`,
    `Delivery: ${addressText(details.delivery_address) || "Not supplied"}`,
  ]
  const lines = quote.items.map((item: any) => {
    const artworks = item.artwork_files?.length ? item.artwork_files : item.artwork_url ? [{ filename: item.artwork_filename || "artwork" }] : []
    return [
      `${item.product_name} · ${item.color}${item.variant_size ? ` · ${item.variant_size}` : ""} · ${item.sku || ""} · ${item.quantity} units`,
      ...item.decorations.map((line: any) => `  ${line.method_name} · ${line.position_name} · ${line.print_width_mm && line.print_height_mm ? `${line.print_width_mm} × ${line.print_height_mm} mm` : "size on request"}${line.print_colours ? ` · ${line.print_colours} colours` : ""}${line.print_stitches ? ` · ${line.print_stitches} stitches` : ""}`),
      ...artworks.map((file: any, index: number) => `  Artwork ${index + 1}: ${file.filename} — ${admin}/admin/merchportal/artwork/${encodeURIComponent(item.id)}?file=${index} (staff sign-in required)`),
      ...(!artworks.length ? ["  No artwork attached"] : []),
    ].join("\n")
  })
  const text = [`New quote request ${quote.id}`, ...buyer, `Notes: ${quote.customer_note || "None"}`, ...lines, `Review: ${admin}/app/merchportal/quotes`].join("\n\n")
  const cards = quote.items.map((item: any) => {
    const image = mediaUrl(item.image_url)
    const artworks = item.artwork_files?.length ? item.artwork_files : item.artwork_url ? [{ filename: item.artwork_filename || "artwork" }] : []
    const artworkHtml = artworks.length ? `<p><strong>Artwork files · ${artworks.length}</strong><br>${artworks.map((file: any, index: number) => `<a href="${escapeHtml(`${admin}/admin/merchportal/artwork/${encodeURIComponent(item.id)}?file=${index}`)}" style="color:#086bea;font-weight:700">Download ${escapeHtml(file.filename)}</a>`).join("<br>")}<br><small>Staff sign-in required</small></p>` : "<p>No artwork attached</p>"
    const prints = item.decorations.map((line: any) => {
      const guide = mediaUrl(line.position_image_url)
      return `<div style="display:flex;gap:12px;padding:10px 0;border-top:1px solid #e5eaf1">${guide ? `<img src="${escapeHtml(guide)}" width="72" height="72" alt="Print area" style="object-fit:contain;border:1px solid #e5eaf1;border-radius:8px">` : ""}<div><strong>${escapeHtml(line.method_name)} · ${escapeHtml(line.position_name)}</strong><br><span style="color:#52657a">${escapeHtml(line.print_width_mm && line.print_height_mm ? `${line.print_width_mm} × ${line.print_height_mm} mm` : "Print area on request")}${line.print_colours ? ` · ${escapeHtml(line.print_colours)} colours` : ""}${line.print_stitches ? ` · ${escapeHtml(line.print_stitches)} stitches` : ""}</span></div></div>`
    }).join("")
    return `<section style="border:1px solid #dce6f0;border-radius:12px;padding:16px;margin:14px 0"><div style="display:flex;gap:16px">${image ? `<img src="${escapeHtml(image)}" width="110" height="110" alt="Product" style="object-fit:contain;border-radius:8px">` : ""}<div><strong style="font-size:17px">${escapeHtml(item.product_name)}</strong><p style="margin:7px 0;color:#52657a">${escapeHtml(item.color)}${item.variant_size ? ` · ${escapeHtml(item.variant_size)}` : ""} · ${escapeHtml(item.sku || "No SKU")} · ${escapeHtml(item.quantity)} units</p>${item.variant_dimensions ? `<p style="margin:7px 0">${escapeHtml(item.variant_dimensions)}</p>` : ""}</div></div>${prints}${artworkHtml}</section>`
  }).join("")
  const variables = {
    quote_id: String(quote.id), company_name: details.company_name || "Not supplied", contact_name: details.contact_name || "Not supplied",
    contact_email: details.contact_email || "Not supplied", phone: details.phone || "Not supplied", vat_number: details.vat_number || "Not supplied",
    billing_address: addressText(details.billing_address) || "Not supplied", delivery_address: addressText(details.delivery_address) || "Not supplied",
    customer_note: quote.customer_note || "None", item_count: String(quote.items.length), quote_items_html: cards, review_url: `${admin}/app/merchportal/quotes`,
  }
  return { text, html: renderEmailTemplate("staff-quote-request", variables).html, variables }
}

export async function notifyStaffOfQuote(container: MedusaContainer, quote: any) {
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const settings = await loadEmailSettings(service)
  if (!settings?.encrypted_password) return false
  try {
    const summary = await quoteWithItems(service, quote)
    const email = staffQuoteEmail(summary)
    return await sendTemplatedPortalEmail(
      service,
      "staff-quote-request",
      settings.notification_email,
      email.variables,
      email.text,
    )
  } catch (error) {
    console.error("MerchPortal could not send staff quote notification", error instanceof Error ? error.message : "Unknown SMTP error")
    return false
  }
}

export async function notifyCustomerOfFinalQuote(container: MedusaContainer, quote: any) {
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const settings = await loadEmailSettings(service)
  if (!settings?.encrypted_password) return false
  try {
    const customers = container.resolve(Modules.CUSTOMER) as any
    const customer = await customers.retrieveCustomer(quote.actor_id)
    if (!customer?.email) return false
    const origin = (process.env.STOREFRONT_URL || "https://merchportal.customislandgifts.mt").replace(/\/$/u, "")
    const quotesUrl = `${origin}/portal/account/quotes`
    return await sendTemplatedPortalEmail(
      service,
      "client-quote-ready",
      customer.email,
      { quote_id: String(quote.id), final_total: Number(quote.final_total).toFixed(2), quotes_url: quotesUrl, staff_note: quote.staff_note || "" },
      `Your final quote is €${Number(quote.final_total).toFixed(2)} excluding VAT.\n\nOpen ${quotesUrl} to review it.\n\n${quote.staff_note || ""}`,
    )
  } catch (error) {
    console.error("MerchPortal could not send client quote notification", error instanceof Error ? error.message : "Unknown SMTP error")
    return false
  }
}
