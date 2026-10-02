import { loadPortalBranding, savePortalBranding } from "../portal-branding"
import { GET, POST } from "../../../api/admin/merchportal/branding/route"
import { requireStaff } from "../../../api/admin/merchportal/auth"

jest.mock("../../../api/admin/merchportal/auth", () => ({ requireStaff: jest.fn() }))

function store() {
  let setting: any
  return {
    listPortalSettings: jest.fn(async () => setting ? [setting] : []),
    createPortalSettings: jest.fn(async (input) => { setting = { id: "branding-1", ...input }; return setting }),
    updatePortalSettings: jest.fn(async (input) => { setting = { ...setting, ...input }; return setting }),
  }
}

describe("portal branding", () => {
  it("creates, updates and resets the existing setting without duplicating it", async () => {
    const service = store()
    expect(await loadPortalBranding(service)).toEqual({ logo_url: "" })
    await savePortalBranding(service, { logo_url: " https://example.com/logo.png " })
    expect(await loadPortalBranding(service)).toEqual({ logo_url: "https://example.com/logo.png" })
    await savePortalBranding(service, { logo_url: "https://example.com/new.svg" })
    await savePortalBranding(service, { logo_url: "" })
    expect(await loadPortalBranding(service)).toEqual({ logo_url: "" })
    expect(service.createPortalSettings).toHaveBeenCalledTimes(1)
    expect(service.updatePortalSettings).toHaveBeenCalledTimes(2)
  })

  it.each(["javascript:alert(1)", "data:image/png;base64,test", "http://example.com/logo", "https://user:password@example.com/logo", "not a URL", `https://example.com/${"a".repeat(2048)}`])("rejects unsafe logo URL %s", async (logo_url) => {
    const service = store()
    await expect(savePortalBranding(service, { logo_url })).rejects.toThrow("public HTTPS")
    expect(service.createPortalSettings).not.toHaveBeenCalled()
  })

  it("requires staff authentication and restricts changes to super administrators", async () => {
    const service = store()
    const req = { scope: { resolve: () => service }, body: { logo_url: "https://example.com/logo.png" } }
    const res = { json: jest.fn(), status: jest.fn() }
    res.status.mockReturnValue(res)
    jest.mocked(requireStaff).mockRejectedValueOnce(new Error("Not authenticated"))
    await expect(GET(req as any, res as any)).rejects.toThrow("Not authenticated")
    jest.mocked(requireStaff).mockResolvedValueOnce({ role: "staff" } as any)
    await POST(req as any, res as any)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(service.createPortalSettings).not.toHaveBeenCalled()
    jest.mocked(requireStaff).mockResolvedValue({ role: "super_admin" } as any)
    await POST(req as any, res as any)
    await GET(req as any, res as any)
    expect(res.json).toHaveBeenLastCalledWith({ branding: { logo_url: req.body.logo_url } })
  })
})
