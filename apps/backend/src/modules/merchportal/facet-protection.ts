import { randomUUID } from "node:crypto"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { MERCHPORTAL_MODULE } from "."
import { categoryFilterPath, type FacetType } from "./facet-mappings"
import { targetKey, type ProtectedFacet } from "./facet-taxonomy-rules"

export const protectionKey = "facet-taxonomy-protection"
export const storedProtections = (setting: any): ProtectedFacet[] => Array.isArray(setting?.value?.groups) ? setting.value.groups : []

export async function facetProtections(service: any) {
  return storedProtections((await service.listPortalSettings({ key: protectionKey }, { take: 1 }))[0])
}

export async function protectFacetGroup(container: any, actorId: string, type: FacetType, target: string, locked: boolean) {
  if (!["category", "material"].includes(type) || typeof target !== "string" || !target.trim() || target.length > 80 || typeof locked !== "boolean") throw new MedusaError(MedusaError.Types.INVALID_DATA, "Choose a category or material group to protect")
  if (type === "category") categoryFilterPath(target)
  const service = container.resolve(MERCHPORTAL_MODULE) as any
  const mappings = await service.listFacetMappings({ facet_type: type }, { take: 20000 })
  if (locked && !mappings.some((mapping: any) => targetKey(mapping.target_value) === targetKey(target) || (type === "category" && targetKey(mapping.target_value).startsWith(`${targetKey(target)} > `)))) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Approve a group before protecting it")
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  await knex.transaction(async (tx: any) => {
    await tx.raw("select pg_advisory_xact_lock(hashtext('merchportal:facet-mappings'))")
    const setting = await tx("merchportal_setting").where({ key: protectionKey }).whereNull("deleted_at").first()
    const groups = storedProtections(setting).filter((group) => group.facet_type !== type || targetKey(group.target_value) !== targetKey(target))
    if (locked) groups.push({ facet_type: type, target_value: target.trim() })
    const value = JSON.stringify({ groups, updated_by: actorId })
    if (setting) await tx("merchportal_setting").where({ id: setting.id }).update({ value, updated_at: new Date() })
    else await tx("merchportal_setting").insert({ id: `ps_${randomUUID()}`, key: protectionKey, value })
  })
}
