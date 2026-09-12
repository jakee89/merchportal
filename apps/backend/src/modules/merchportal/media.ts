import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto"

const allowedHosts = new Set([
  "cdn.hideacontent.com",
  "cdn1.midocean.com",
  "cdn.aodaci.com",
  "content.aodaci.com",
])

function isAllowedHost(hostname: string) {
  const host = hostname.toLowerCase()
  return allowedHosts.has(host) || host.endsWith(".cdn.midocean.com")
}

function secret() {
  return process.env.MEDIA_PROXY_SECRET || process.env.JWT_SECRET || ""
}

export function isAllowedSupplierImage(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "https:" && isAllowedHost(url.hostname)
  } catch {
    return false
  }
}

export function supplierImageToken(url: string) {
  if (!isAllowedSupplierImage(url)) return null
  const key = createHash("sha256").update(secret()).digest()
  const iv = createHmac("sha256", key).update(url).digest().subarray(0, 16)
  const cipher = createCipheriv("aes-256-cbc", key, iv)
  const encrypted = Buffer.concat([cipher.update(url, "utf8"), cipher.final()]).toString("base64url")
  const payload = `${iv.toString("base64url")}.${encrypted}`
  const signature = createHmac("sha256", key).update(payload).digest("base64url")
  return `${payload}.${signature}`
}

export function supplierImageUrl(token: string) {
  const [ivText, encrypted, supplied] = token.split(".")
  if (!ivText || !encrypted || !supplied || !secret()) return null
  const key = createHash("sha256").update(secret()).digest()
  const payload = `${ivText}.${encrypted}`
  const expected = createHmac("sha256", key).update(payload).digest("base64url")
  const a = Buffer.from(supplied)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const decipher = createDecipheriv("aes-256-cbc", key, Buffer.from(ivText, "base64url"))
    const url = Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64url")),
      decipher.final(),
    ]).toString("utf8")
    return isAllowedSupplierImage(url) ? url : null
  } catch {
    return null
  }
}
