import { MedusaError } from "@medusajs/framework/utils"

export type QuoteAddress = { line1: string; line2: string; city: string; postal_code: string; country_code: string }
export type QuoteDetails = {
  contact_name: string
  contact_email: string
  phone: string
  company_name: string
  vat_number: string
  billing_address: QuoteAddress
  delivery_address: QuoteAddress
}

function value(input: unknown, max: number) {
  if (typeof input !== "string" || input.length > max) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Check the company and contact details")
  return input.trim()
}

function address(input: any, label: string): QuoteAddress {
  const result = {
    line1: value(input?.line1, 160),
    line2: value(input?.line2 ?? "", 160),
    city: value(input?.city, 100),
    postal_code: value(input?.postal_code, 24),
    country_code: value(input?.country_code, 2).toLowerCase(),
  }
  if (!result.line1 || !result.city || !result.postal_code || !/^[a-z]{2}$/.test(result.country_code)) throw new MedusaError(MedusaError.Types.INVALID_DATA, `Enter a complete ${label} address`)
  return result
}

export function validateQuoteDetails(input: unknown): QuoteDetails {
  const details = input as Record<string, unknown> | null
  const result = {
    contact_name: value(details?.contact_name, 120),
    contact_email: value(details?.contact_email, 254),
    phone: value(details?.phone, 40),
    company_name: value(details?.company_name, 160),
    vat_number: value(details?.vat_number ?? "", 50),
    billing_address: address(details?.billing_address, "billing"),
    delivery_address: address(details?.delivery_address, "delivery"),
  }
  if (!result.contact_name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.contact_email) || !/^[+\d()\s.-]{6,40}$/.test(result.phone) || !result.company_name) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Enter a name, email, phone and company name")
  return result
}
