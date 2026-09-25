import { buyerProfile, updateBuyerProfile } from "../buyer-profile"

const details = {
  contact_name: "Jane Doe",
  contact_email: "jane@example.com",
  phone: "+356 2123 4567",
  company_name: "Example Ltd",
  vat_number: "MT12345678",
  billing_address: { line1: "1 Main St", line2: "", city: "Valletta", postal_code: "VLT 1000", country_code: "mt" },
  delivery_address: { line1: "2 Dock Rd", line2: "", city: "Marsa", postal_code: "MRS 1000", country_code: "mt" },
}

it("persists the authenticated buyer profile with Medusa's id-and-data update signature", async () => {
  const customer = { id: "customer-1", email: details.contact_email, first_name: "Jane", last_name: "Doe", phone: null, metadata: null as any }
  const customers = {
    retrieveCustomer: jest.fn(async () => customer),
    updateCustomers: jest.fn(async (id: string, data: any) => {
      expect(id).toBe(customer.id)
      customer.phone = data.phone
      customer.metadata = data.metadata
    }),
  }
  const scope = { resolve: jest.fn(() => customers) }
  const service = { listOrganizations: jest.fn(async () => [{ id: "organization-1", name: "Example Ltd" }]) }

  const saved = await updateBuyerProfile(scope, service, customer.id, "organization-1", details)
  expect(customers.updateCustomers).toHaveBeenCalledTimes(1)
  expect(saved).toEqual(details)
  expect(await buyerProfile(scope, service, customer.id, "organization-1")).toEqual(details)
})
