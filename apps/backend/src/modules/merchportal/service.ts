import { MedusaService } from "@medusajs/framework/utils"
import ImportJob from "./models/import-job"
import Membership from "./models/membership"
import Organization from "./models/organization"
import RawSupplierRecord from "./models/raw-supplier-record"
import Supplier from "./models/supplier"
import CategoryMapping from "./models/category-mapping"
import FacetMapping from "./models/facet-mapping"
import PricingRule from "./models/pricing-rule"
import PublishedProductSource from "./models/published-product-source"
import ProductConfiguration from "./models/product-configuration"
import QuoteRequest from "./models/quote-request"
import PortalSetting from "./models/portal-setting"
import PortalUsageDaily from "./models/portal-usage-daily"
import FacetOperation from "./models/facet-operation"
import FacetValue from "./models/facet-value"
import MediaHealth from "./models/media-health"

class MerchPortalModuleService extends MedusaService({
  ImportJob,
  Membership,
  Organization,
  RawSupplierRecord,
  Supplier,
  CategoryMapping,
  FacetMapping,
  PricingRule,
  PublishedProductSource,
  ProductConfiguration,
  QuoteRequest,
  PortalSetting,
  PortalUsageDaily,
  FacetOperation,
  FacetValue,
  MediaHealth,
}) {}

export default MerchPortalModuleService
