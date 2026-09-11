import { Module } from "@medusajs/framework/utils"
import MerchPortalModuleService from "./service"

export const MERCHPORTAL_MODULE = "merchportal"

export default Module(MERCHPORTAL_MODULE, {
  service: MerchPortalModuleService,
})
