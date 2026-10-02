jest.mock("ioredis", () => ({ __esModule: true, default: jest.fn() }))

import Redis from "ioredis"
import { createHmac } from "node:crypto"
import { authClientIp, authLimitPolicy, securityHeaders, throttleAuth } from "../auth-security"
import { requireStaff } from "../../../api/admin/merchportal/auth"

describe("authentication security", () => {
  const evalMock = jest.fn()
  const environment = { ...process.env }
  beforeEach(() => {
    process.env.REDIS_URL = "redis://test"
    process.env.AUTH_PROXY_SECRET = "x".repeat(64)
    evalMock.mockReset().mockResolvedValue(0)
    jest.mocked(Redis).mockImplementation(() => ({ eval: evalMock, on: jest.fn() }) as any)
  })
  afterAll(() => { process.env = environment })
  const response = () => { const res = { setHeader: jest.fn(), status: jest.fn(), json: jest.fn() }; res.status.mockReturnValue(res); return res }

  it("accepts only fresh signed client-IP forwarding and ignores spoofed headers", () => {
    const payload = `${Date.now()}|203.0.113.12`
    const signature = createHmac("sha256", process.env.AUTH_PROXY_SECRET!).update(payload).digest("hex")
    expect(authClientIp({ ip: "127.0.0.1", headers: { "x-merchportal-auth-ip": `${payload}|${signature}` } } as any)).toBe("203.0.113.12")
    expect(authClientIp({ ip: "127.0.0.1", headers: { "x-forwarded-for": "spoofed", "x-merchportal-auth-ip": `${payload}|${"0".repeat(64)}` } } as any)).toBe("127.0.0.1")
    const old = `${Date.now() - 120_000}|203.0.113.12`
    expect(authClientIp({ ip: "127.0.0.1", headers: { "x-merchportal-auth-ip": `${old}|${createHmac("sha256", process.env.AUTH_PROXY_SECRET!).update(old).digest("hex")}` } } as any)).toBe("127.0.0.1")
  })

  it("uses shared, hashed account/IP/pair keys and separate reset limits", () => {
    const first = authLimitPolicy("/auth/customer/emailpass", { email: " Jake@example.com " }, "1.2.3.4")!
    const second = authLimitPolicy("/auth/customer/emailpass", { email: "jake@example.com" }, "5.6.7.8")!
    expect(first.keys[1]).toBe(second.keys[1])
    expect(first.keys[0]).not.toBe(second.keys[0])
    expect(first.keys.join(" ")).not.toMatch(/jake|example|1\.2\.3\.4/)
    expect(authLimitPolicy("/auth/user/emailpass/reset-password", { identifier: "jake@example.com" }, "1.2.3.4")?.limits).toEqual([30, 5, 5])
    expect(authLimitPolicy("/portal-api/catalog", {}, "1.2.3.4")).toBeUndefined()
  })

  it("enforces Redis decisions with expiry and refuses new auth during storage failure", async () => {
    const req = { path: "/auth/customer/emailpass", body: { email: "test@example.com" }, headers: {}, ip: "1.2.3.4" } as any
    const next = jest.fn()
    const res = response()
    await throttleAuth(req, res as any, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(evalMock.mock.calls[0][0]).toContain("PEXPIRE")
    expect(evalMock.mock.calls[0][0]).toContain("PTTL")
    evalMock.mockResolvedValueOnce(1500)
    await throttleAuth(req, res as any, next)
    expect(res.status).toHaveBeenCalledWith(429)
    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "2")
    evalMock.mockRejectedValueOnce(new Error("offline"))
    await throttleAuth(req, res as any, next)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it("blocks stale pre-enrollment staff sessions without blocking unenrolled setup", async () => {
    const enabled = jest.fn().mockResolvedValue([{ id: "factor" }])
    const service = { listMemberships: jest.fn().mockResolvedValue([{ role: "admin" }]) }
    const req = { auth_context: { actor_id: "staff", auth_identity_id: "auth" }, scope: { resolve: (key: string) => key === "auth" ? { listAuthMfa: enabled } : service } } as any
    await expect(requireStaff(req)).rejects.toThrow("authenticator")
    req.auth_context.mfa_challenge_completed_at = new Date().toISOString()
    await expect(requireStaff(req)).resolves.toEqual({ role: "admin" })
    delete req.auth_context.mfa_challenge_completed_at
    enabled.mockResolvedValue([])
    await expect(requireStaff(req)).resolves.toEqual({ role: "admin" })
  })

  it("enforces anti-framing while keeping broad CSP restrictions report-only", () => {
    const res = response()
    const next = jest.fn()
    securityHeaders({} as any, res as any, next)
    expect(res.setHeader).toHaveBeenCalledWith("X-Frame-Options", "DENY")
    expect(res.setHeader.mock.calls.find(([key]) => key === "Content-Security-Policy")?.[1]).not.toContain("script-src")
    expect(res.setHeader.mock.calls.find(([key]) => key === "Content-Security-Policy-Report-Only")?.[1]).toContain("script-src")
    expect(next).toHaveBeenCalled()
  })
})
