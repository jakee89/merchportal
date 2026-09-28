import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

type SupplierPriority = { id: string; code: string; display_name: string; catalog_priority: number }

export function compareSupplierPriority(leftSupplierId: string | undefined, rightSupplierId: string | undefined, priorities: ReadonlyMap<string, number>) {
  return (priorities.get(leftSupplierId || "") ?? Number.MAX_SAFE_INTEGER) - (priorities.get(rightSupplierId || "") ?? Number.MAX_SAFE_INTEGER)
}

export function reorderedSupplierPriorities<T extends SupplierPriority>(suppliers: T[], code: string, priority: number) {
  const ordered = [...suppliers].sort((left, right) => left.catalog_priority - right.catalog_priority || left.display_name.localeCompare(right.display_name))
  if (!Number.isInteger(priority) || priority < 1 || priority > ordered.length) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `Priority must be between 1 and ${ordered.length}`)
  }
  const current = ordered.findIndex((supplier) => supplier.code === code)
  if (current < 0) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Supplier not found")
  const [selected] = ordered.splice(current, 1)
  ordered.splice(priority - 1, 0, selected)
  return ordered.map((supplier, index) => ({ id: supplier.id, code: supplier.code, catalog_priority: index + 1 }))
}

export async function setSupplierPriority(container: any, code: string, priority: number) {
  const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
  return knex.transaction(async (transaction: any) => {
    const suppliers = await transaction("merchportal_supplier")
      .select("id", "code", "display_name", "catalog_priority")
      .whereNull("deleted_at")
      .orderBy("catalog_priority", "asc")
      .orderBy("id", "asc")
      .forUpdate() as SupplierPriority[]
    const ordered = reorderedSupplierPriorities(suppliers, code, priority)
    for (const supplier of ordered) {
      await transaction("merchportal_supplier")
        .where({ id: supplier.id })
        .update({ catalog_priority: supplier.catalog_priority, updated_at: transaction.fn.now() })
    }
    return ordered
  })
}
