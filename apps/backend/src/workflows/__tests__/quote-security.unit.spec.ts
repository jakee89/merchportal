import { validateQuoteDetails } from "../../modules/merchportal/quote-details"
import { signArtwork, verifyArtwork } from "../../modules/merchportal/artwork-proof"
import { validateArtwork } from "../upload-artwork"
import { staffQuoteEmail } from "../quote-notifications"
import { limitCustomerAction } from "../../modules/merchportal/request-limits"

const details = { contact_name: "Jane Doe", contact_email: "jane@example.com", phone: "+356 2123 4567", company_name: "Example Ltd", vat_number: "MT12345678", billing_address: { line1: "1 Main St", line2: "", city: "Valletta", postal_code: "VLT 1000", country_code: "MT" }, delivery_address: { line1: "2 Dock Rd", line2: "", city: "Marsa", postal_code: "MRS 1000", country_code: "mt" } }

describe("quote and artwork security", () => {
  const previousSecret = process.env.JWT_SECRET
  beforeEach(() => { process.env.JWT_SECRET = "test-artwork-secret" })
  afterAll(() => { if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret })

  it("validates B2B details without silently truncating them", () => {
    expect(validateQuoteDetails(details).billing_address.country_code).toBe("mt")
    expect(() => validateQuoteDetails({ ...details, contact_name: "x".repeat(121) })).toThrow()
    expect(() => validateQuoteDetails({ ...details, contact_email: "invalid" })).toThrow()
    expect(() => validateQuoteDetails({ ...details, billing_address: { ...details.billing_address, line1: "" } })).toThrow()
  })

  it("binds uploaded artwork to the exact customer, company and filename", () => {
    const proof = signArtwork("file-1", "logo.svg", "buyer-1", "company-1")
    expect(() => verifyArtwork(proof, "file-1", "logo.svg", "buyer-1", "company-1")).not.toThrow()
    expect(() => verifyArtwork(proof, "file-1", "logo.svg", "buyer-2", "company-1")).toThrow()
    expect(() => verifyArtwork(proof, "file-1", "logo.svg", "buyer-1", "company-2")).toThrow()
    expect(() => verifyArtwork(proof, "file-2", "logo.svg", "buyer-1", "company-1")).toThrow()
  })

  it("accepts a normal SVG and rejects active SVG content and renamed files", () => {
    const file = (svg: string) => ({ filename: "logo.svg", mime_type: "image/svg+xml", content: Buffer.from(svg).toString("base64") })
    expect(validateArtwork(file('<svg xmlns="http://www.w3.org/2000/svg"><style>.a{fill:red}</style><use href="#shape"/></svg>')).length).toBeGreaterThan(0)
    expect(() => validateArtwork(file('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'))).toThrow()
    expect(() => validateArtwork(file('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toThrow()
    expect(() => validateArtwork({ ...file('<svg></svg>'), filename: "logo.png" })).toThrow()
    expect(() => validateArtwork({ filename: "logo.pdf", mime_type: "application/pdf", content: Buffer.from("not a PDF").toString("base64") })).toThrow()
  })

  it("escapes customer-provided text in the staff email", () => {
    const email = staffQuoteEmail({ id: "quote-1", contact_details: { ...details, company_name: "<script>alert(1)</script>" }, items: [{ id: "config-1", product_name: "Bag", color: "Blue", quantity: 10, decorations: [], artwork_url: "/portal/account/quotes/artwork/config-1", artwork_filename: "logo.svg" }] })
    expect(email.html).not.toContain("<script>")
    expect(email.html).toContain("&lt;script&gt;")
    expect(email.html).toContain("/admin/merchportal/artwork/config-1")
    expect(email.text).toContain("Billing:")
  })

  it("limits repeated company-code guesses and artwork uploads", () => {
    for (let index = 0; index < 10; index++) expect(() => limitCustomerAction("join", "guessing-customer")).not.toThrow()
    expect(() => limitCustomerAction("join", "guessing-customer")).toThrow("Too many attempts")
    for (let index = 0; index < 20; index++) expect(() => limitCustomerAction("artwork", "uploading-customer")).not.toThrow()
    expect(() => limitCustomerAction("artwork", "uploading-customer")).toThrow("Too many attempts")
  })
})
