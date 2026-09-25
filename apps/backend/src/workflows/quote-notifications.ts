import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "../modules/merchportal"
import { loadEmailSettings, sendPortalEmail } from "../modules/merchportal/email-settings"
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
    const artwork = item.artwork_url ? `${admin}/admin/merchportal/artwork/${encodeURIComponent(item.id)}` : ""
    return [
      `${item.product_name} · ${item.color}${item.variant_size ? ` · ${item.variant_size}` : ""} · ${item.sku || ""} · ${item.quantity} units`,
      ...item.decorations.map((line: any) => `  ${line.method_name} · ${line.position_name} · ${line.print_width_mm && line.print_height_mm ? `${line.print_width_mm} × ${line.print_height_mm} mm` : "size on request"}${line.print_colours ? ` · ${line.print_colours} colours` : ""}${line.print_stitches ? ` · ${line.print_stitches} stitches` : ""}`),
      artwork ? `  Artwork: ${artwork} (staff sign-in required)` : "  No artwork attached",
    ].join("\n")
  })
  const text = [`New quote request ${quote.id}`, ...buyer, `Notes: ${quote.customer_note || "None"}`, ...lines, `Review: ${admin}/app/merchportal/quotes`].join("\n\n")
  const cards = quote.items.map((item: any) => {
    const image = mediaUrl(item.image_url)
    const artwork = item.artwork_url ? `${admin}/admin/merchportal/artwork/${encodeURIComponent(item.id)}` : ""
    const prints = item.decorations.map((line: any) => {
      const guide = mediaUrl(line.position_image_url)
      return `<div style="display:flex;gap:12px;padding:10px 0;border-top:1px solid #e5eaf1">${guide ? `<img src="${escapeHtml(guide)}" width="72" height="72" alt="Print area" style="object-fit:contain;border:1px solid #e5eaf1;border-radius:8px">` : ""}<div><strong>${escapeHtml(line.method_name)} · ${escapeHtml(line.position_name)}</strong><br><span style="color:#52657a">${escapeHtml(line.print_width_mm && line.print_height_mm ? `${line.print_width_mm} × ${line.print_height_mm} mm` : "Print area on request")}${line.print_colours ? ` · ${escapeHtml(line.print_colours)} colours` : ""}${line.print_stitches ? ` · ${escapeHtml(line.print_stitches)} stitches` : ""}</span></div></div>`
    }).join("")
    return `<section style="border:1px solid #dce6f0;border-radius:12px;padding:16px;margin:14px 0"><div style="display:flex;gap:16px">${image ? `<img src="${escapeHtml(image)}" width="110" height="110" alt="Product" style="object-fit:contain;border-radius:8px">` : ""}<div><strong style="font-size:17px">${escapeHtml(item.product_name)}</strong><p style="margin:7px 0;color:#52657a">${escapeHtml(item.color)}${item.variant_size ? ` · ${escapeHtml(item.variant_size)}` : ""} · ${escapeHtml(item.sku || "No SKU")} · ${escapeHtml(item.quantity)} units</p>${item.variant_dimensions ? `<p style="margin:7px 0">${escapeHtml(item.variant_dimensions)}</p>` : ""}</div></div>${prints}<p>${artwork ? `<a href="${escapeHtml(artwork)}" style="color:#086bea;font-weight:700">Download ${escapeHtml(item.artwork_filename || "artwork")}</a> <small>(staff sign-in required)</small>` : "No artwork attached"}</p></section>`
  }).join("")
  const html = `<div style="background:#f5f8fc;padding:24px;font-family:Arial,sans-serif;color:#193047"><div style="max-width:760px;margin:auto;background:white;border:1px solid #dce6f0;border-radius:16px;padding:24px"><p style="color:#086bea;font-weight:700;letter-spacing:.12em">MERCHPORTAL · NEW REQUEST</p><h1 style="margin:0 0 18px">Quote request</h1><p><strong>Company:</strong> ${escapeHtml(details.company_name || "Not supplied")}<br><strong>Contact:</strong> ${escapeHtml(details.contact_name || "Not supplied")}<br><strong>Email:</strong> ${escapeHtml(details.contact_email || "Not supplied")}<br><strong>Phone:</strong> ${escapeHtml(details.phone || "Not supplied")}<br><strong>VAT:</strong> ${escapeHtml(details.vat_number || "Not supplied")}</p><p><strong>Billing:</strong> ${escapeHtml(addressText(details.billing_address) || "Not supplied")}<br><strong>Delivery:</strong> ${escapeHtml(addressText(details.delivery_address) || "Not supplied")}</p>${quote.customer_note ? `<p><strong>Client note:</strong> ${escapeHtml(quote.customer_note)}</p>` : ""}<h2>Products · ${quote.items.length}</h2>${cards}<p><a href="${escapeHtml(`${admin}/app/merchportal/quotes`)}" style="display:inline-block;background:#086bea;color:white;padding:12px 18px;border-radius:8px;text-decoration:none">Open quote requests</a></p><p style="font-size:12px;color:#65758a">Artwork links require a staff login. Images may be hidden by your email app until you allow them.</p></div></div>`
  return { text, html }
}

export async function notifyStaffOfQuote(container: MedusaContainer, quote: any) {
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const settings = await loadEmailSettings(service)
  if (!settings?.encrypted_password) return false
  try {
    const summary = await quoteWithItems(service, quote)
    const email = staffQuoteEmail(summary)
    return await sendPortalEmail(
      service,
      settings.notification_email,
      `New MerchPortal quote request ${quote.id}`,
      email.text,
      false,
      email.html,
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
    return await sendPortalEmail(
      service,
      customer.email,
      `Your MerchPortal quote ${quote.id} is ready`,
      `Your final quote is €${Number(quote.final_total).toFixed(2)} excluding VAT.\n\nOpen https://merchportal.customislandgifts.mt/portal/account/quotes to review it.\n\n${quote.staff_note || ""}`,
    )
  } catch (error) {
    console.error("MerchPortal could not send client quote notification", error instanceof Error ? error.message : "Unknown SMTP error")
    return false
  }
}
