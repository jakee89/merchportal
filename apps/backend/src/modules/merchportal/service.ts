import { MedusaService } from "@medusajs/framework/utils"
import ImportJob from "./models/import-job"
import Membership from "./models/membership"
import Organization from "./models/organization"
import RawSupplierRecord from "./models/raw-supplier-record"
import Supplier from "./models/supplier"
import CategoryMapping from "./models/category-mapping"
import PricingRule from "./models/pricing-rule"
import PublishedProductSource from "./models/published-product-source"
import ProductConfiguration from "./models/product-configuration"
import QuoteRequest from "./models/quote-request"

class MerchPortalModuleService extends MedusaService({
  ImportJob,
  Membership,
  Organization,
  RawSupplierRecord,
  Supplier,
  CategoryMapping,
  PricingRule,
  PublishedProductSource,
  ProductConfiguration,
  QuoteRequest,
}) {}

export default MerchPortalModuleService
