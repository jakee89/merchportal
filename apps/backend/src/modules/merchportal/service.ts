import { MedusaService } from "@medusajs/framework/utils"
import ImportJob from "./models/import-job"
import Membership from "./models/membership"
import Organization from "./models/organization"
import RawSupplierRecord from "./models/raw-supplier-record"
import Supplier from "./models/supplier"

class MerchPortalModuleService extends MedusaService({
  ImportJob,
  Membership,
  Organization,
  RawSupplierRecord,
  Supplier,
}) {}

export default MerchPortalModuleService
