import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MERCHPORTAL_MODULE } from "../../../../modules/merchportal"
import { emailDeliveryHistory } from "../../../../modules/merchportal/email-delivery-history"
import { requireStaff } from "../auth"

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
) {
  await requireStaff(req)
  res.setHeader("Cache-Control", "no-store")
  res.json(
    await emailDeliveryHistory(
      req.scope.resolve(MERCHPORTAL_MODULE),
      req.query,
    ),
  )
}
