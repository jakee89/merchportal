import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import { isIP } from "node:net"
import Redis from "ioredis"
import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

let redis: Redis | undefined
const consumeScript = `
local retry = 0
for i, key in ipairs(KEYS) do
  local count = redis.call('INCR', key)
  if count == 1 then redis.call('PEXPIRE', key, ARGV[1]) end
  if count > tonumber(ARGV[i + 1]) then retry = math.max(retry, redis.call('PTTL', key)) end
end
return retry
`

export function authClientIp(req: Pick<MedusaRequest, "headers" | "ip">) {
  const signed = req.headers["x-merchportal-auth-ip"]
  const secret = process.env.AUTH_PROXY_SECRET
  if (typeof signed === "string" && secret && secret.length >= 32) {
    const [timestamp, ip, signature] = signed.split("|")
    if (isIP(ip || "") && Math.abs(Date.now() - Number(timestamp)) < 60_000 && /^[a-f0-9]{64}$/.test(signature || "")) {
      const expected = createHmac("sha256", secret).update(`${timestamp}|${ip}`).digest()
      if (timingSafeEqual(expected, Buffer.from(signature, "hex"))) return ip
    }
  }
  return req.ip || "unknown"
}

export function authLimitPolicy(path: string, body: any, ip: string) {
  const reset = /^\/auth\/(user|customer)\/emailpass\/reset-password\/?$/.test(path)
  const login = /^\/auth\/(user|customer)\/emailpass\/?$/.test(path)
  const challenge = /^\/auth\/mfa\/challenges\/[^/]+\/verify\/?$/.test(path)
  if (!reset && !login && !challenge) return
  const kind = reset ? "reset" : challenge ? "mfa" : "login"
  const actor = path.split("/")[2]
  const account = challenge ? path : typeof (body?.email || body?.identifier) === "string" ? String(body.email || body.identifier).trim().toLowerCase().slice(0, 254) : "unknown"
  const hash = (value: string) => createHash("sha256").update(value).digest("hex")
  return { windowMs: reset ? 60 * 60_000 : 15 * 60_000, keys: [hash(`${kind}:${actor}:ip:${ip}`), hash(`${kind}:${actor}:account:${account}`), hash(`${kind}:${actor}:pair:${ip}:${account}`)].map((key) => `mp:auth-limit:${key}`), limits: reset ? [30, 5, 5] : [120, 20, 10] }
}

export async function throttleAuth(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const policy = authLimitPolicy(req.path, req.body, authClientIp(req))
  if (!policy) return next()
  res.setHeader("Cache-Control", "private, no-store")
  try {
    if (!process.env.REDIS_URL) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Auth limit storage unavailable")
    if (!redis) {
      redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 2000, commandTimeout: 3000 })
      redis.on("error", () => {})
    }
    const retry = Number(await redis.eval(consumeScript, policy.keys.length, ...policy.keys, policy.windowMs, ...policy.limits))
    if (retry > 0) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil(retry / 1000))))
      return res.status(429).json({ message: "Too many attempts. Please wait and retry." })
    }
    return next()
  } catch {
    // Never silently disable protection when Redis is down. Catalog, carts
    // and existing authenticated sessions do not depend on this limiter.
    return res.status(503).json({ message: "Sign-in is temporarily unavailable. Please retry shortly." })
  }
}

export function securityHeaders(_req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("X-Frame-Options", "DENY")
  res.setHeader("Content-Security-Policy", "frame-ancestors 'none'; object-src 'none'; base-uri 'self'")
  res.setHeader("Content-Security-Policy-Report-Only", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'")
  return next()
}
