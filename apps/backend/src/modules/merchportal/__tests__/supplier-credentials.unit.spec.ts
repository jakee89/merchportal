import {
  decryptSupplierCredential,
  encryptSupplierCredential,
  resolveSupplierCredential,
  supplierCredentialStatus,
} from "../supplier-credentials"

describe("supplier credentials", () => {
  const originalSecret = process.env.JWT_SECRET
  const originalStricker = process.env.STRICKER_ACCESS_KEY

  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret-for-credential-encryption"
    delete process.env.STRICKER_ACCESS_KEY
  })

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = originalSecret
    if (originalStricker === undefined) delete process.env.STRICKER_ACCESS_KEY
    else process.env.STRICKER_ACCESS_KEY = originalStricker
  })

  it("encrypts at rest and reads the saved key before an environment fallback", () => {
    const value = encryptSupplierCredential("stricker", "supplier-secret")
    expect(value).not.toContain("supplier-secret")
    process.env.STRICKER_ACCESS_KEY = "old-key"
    expect(resolveSupplierCredential("stricker", { encrypted_api_key: value })).toBe("supplier-secret")
    expect(supplierCredentialStatus("stricker", { encrypted_api_key: value })).toBe(true)
  })

  it("binds ciphertext to its supplier and detects changes", () => {
    const value = encryptSupplierCredential("stricker", "supplier-secret")
    expect(() => decryptSupplierCredential("midocean", value)).toThrow()
    const parts = value.split(":")
    parts[3] = `${parts[3][0] === "A" ? "B" : "A"}${parts[3].slice(1)}`
    expect(() => decryptSupplierCredential("stricker", parts.join(":"))).toThrow()
  })

  it("supports existing environment-based configuration", () => {
    process.env.STRICKER_ACCESS_KEY = "existing-key"
    expect(resolveSupplierCredential("stricker")).toBe("existing-key")
    expect(supplierCredentialStatus("stricker")).toBe(true)
  })
})
