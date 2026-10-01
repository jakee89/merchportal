import {
  emailDeliveryHistory,
  emailFailureCode,
  recordEmailDelivery,
} from "../email-delivery-history"
import { sendTemplatedPortalEmail } from "../email-templates"
import { sendPortalEmail } from "../email-settings"

jest.mock("../email-settings", () => ({ sendPortalEmail: jest.fn() }))

function store() {
  return {
    listPortalSettings: jest.fn(async () => []),
    createEmailDeliveries: jest.fn(async () => ({})),
    listAndCountEmailDeliveries: jest.fn(async () => [[], 0]),
  }
}

describe("transactional email delivery metadata", () => {
  beforeEach(() => jest.clearAllMocks())
  it("stores only recipient, type and SMTP outcome, not secrets or content", async () => {
    const service = store()
    jest.mocked(sendPortalEmail).mockResolvedValue(true)
    await sendTemplatedPortalEmail(
      service,
      "client-invitation",
      "client@example.com",
      {
        first_name: "Client",
        client_email: "client@example.com",
        temporary_password: "super-secret-password",
        login_url: "https://example.com/login",
      },
      "Password: super-secret-password",
    )
    expect(service.createEmailDeliveries).toHaveBeenCalledWith({
      recipient: "client@example.com",
      template_id: "client-invitation",
      status: "accepted",
      failure_code: null,
    })
    expect(
      JSON.stringify(service.createEmailDeliveries.mock.calls),
    ).not.toContain("super-secret-password")
  })
  it("records rejection and safe error classes without leaking reset tokens", async () => {
    const service = store()
    const failure = Object.assign(
      new Error("Password secret; reset token abc"),
      { code: "EAUTH" },
    )
    jest.mocked(sendPortalEmail).mockRejectedValue(failure)
    await expect(
      sendTemplatedPortalEmail(
        service,
        "password-reset",
        "client@example.com",
        {
          reset_url: "https://example.com/?token=abc",
          client_email: "client@example.com",
        },
        "token=abc",
      ),
    ).rejects.toBe(failure)
    expect(service.createEmailDeliveries).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", failure_code: "EAUTH" }),
    )
    expect(
      JSON.stringify(service.createEmailDeliveries.mock.calls),
    ).not.toMatch(/secret|token|abc/u)
    expect(emailFailureCode({ code: "secret-value" })).toBe("SEND_FAILED")
  })
  it("does not turn accepted SMTP into failure or send twice if recording fails", async () => {
    const service = store()
    service.createEmailDeliveries.mockRejectedValue(
      new Error("database offline"),
    )
    jest.mocked(sendPortalEmail).mockResolvedValue(true)
    const warning = jest.spyOn(console, "warn").mockImplementation(() => {})
    try {
      expect(
        await sendTemplatedPortalEmail(
          service,
          "smtp-test",
          "staff@example.com",
          { portal_url: "https://example.com" },
          "Test",
          true,
        ),
      ).toBe(true)
      expect(sendPortalEmail).toHaveBeenCalledTimes(1)
      expect(service.createEmailDeliveries).toHaveBeenCalledTimes(1)
    } finally {
      warning.mockRestore()
    }
  })
  it("records unsent mail and bounds history pagination while projecting metadata", async () => {
    const service = store()
    jest.mocked(sendPortalEmail).mockResolvedValue(false)
    expect(
      await sendTemplatedPortalEmail(
        service,
        "smtp-test",
        "staff@example.com",
        { portal_url: "https://example.com" },
        "Test",
        true,
      ),
    ).toBe(false)
    expect(service.createEmailDeliveries).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        failure_code: "SMTP_NOT_ACCEPTED",
      }),
    )
    await emailDeliveryHistory(service, {
      page: -2,
      status: "accepted",
      template_id: "password-reset",
    })
    expect(service.listAndCountEmailDeliveries).toHaveBeenCalledWith(
      { status: "accepted", template_id: "password-reset" },
      { take: 25, skip: 0, order: { created_at: "DESC" } },
    )
    await recordEmailDelivery(
      service,
      "password-reset",
      "client@example.com",
      "failed",
      "ETIMEDOUT",
    )
  })
})
