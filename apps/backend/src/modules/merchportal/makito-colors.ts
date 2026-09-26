type MakitoVariant = { variant_colorcode?: string; variant_name?: string; variant_size?: string; color?: string }
type MakitoProductRecord = { supplier_id: string; payload?: { name?: string; variants?: MakitoVariant[] } }

export function makitoVariantLabel(variant: MakitoVariant, productName: string) {
  const name = String(variant.variant_name || "").trim()
  if (!name || !productName) return
  const start = name.toLocaleLowerCase().lastIndexOf(productName.toLocaleLowerCase())
  if (start < 0) return
  let label = name.slice(start + productName.length).replace(/^[\s:–-]+/u, "").trim()
  const size = String(variant.variant_size || "").trim()
  if (size && size !== "000" && label.toLocaleLowerCase().endsWith(` ${size.toLocaleLowerCase()}`)) label = label.slice(0, -size.length).trim()
  return label && label.length <= 80 && !/^\d+$/u.test(label) ? label : undefined
}

export function makitoColorLabels(records: MakitoProductRecord[]) {
  const counts = new Map<string, Map<string, number>>()
  for (const record of records) {
    const name = String(record.payload?.name || "")
    for (const variant of record.payload?.variants || []) {
      const code = String(variant.variant_colorcode || "").trim()
      const label = makitoVariantLabel(variant, name)
      if (!code || !label) continue
      const key = `${record.supplier_id}:${code}`
      const labels = counts.get(key) || new Map<string, number>()
      labels.set(label, (labels.get(label) || 0) + 1)
      counts.set(key, labels)
    }
  }
  return new Map([...counts].map(([key, labels]) => [key, [...labels].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0][0]]))
}
