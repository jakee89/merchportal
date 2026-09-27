type MakitoVariant = { variant_colorcode?: string; variant_name?: string; variant_size?: string; color?: string }
type MakitoProductRecord = { supplier_id: string; payload?: { name?: string; variants?: MakitoVariant[] } }
const sizeSuffix = /\s+(\d{1,3}(?:[-/]\d{1,3})?|[2-6]?XL|XXXL|XXL|XXS|XL|XS|S|M|L)$/iu
const colourWords: Record<string, string> = {
  amarillo: "Yellow", azul: "Blue", beig: "Beige", blanco: "White", burdeos: "Burgundy",
  celeste: "Sky Blue", dorado: "Gold", fucsia: "Fuchsia", granate: "Maroon",
  gris: "Grey", kaki: "Khaki", marron: "Brown", morado: "Purple", mostaza: "Mustard",
  naranja: "Orange", negro: "Black", oro: "Gold", plata: "Silver", plateado: "Silver",
  rojo: "Red", rosa: "Pink", salmon: "Salmon", turquesa: "Turquoise", verde: "Green",
  marino: "Navy", arena: "Sand", natural: "Natural", transparente: "Transparent",
}
const modifiers: Record<string, string> = {
  claro: "Light", oscuro: "Dark", pastel: "Pastel", fluor: "Fluorescent",
  militar: "Military", aguamarina: "Aqua", traslucido: "Translucent",
}

export function makitoColourLabel(label: string) {
  return label.split("/").map((part) => {
    const words = part.trim().split(/\s+/u)
    const [first, second] = words.map((word) => word.normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toLowerCase())
    if (first === "traslucido" && colourWords[second]) return `Translucent ${colourWords[second]}`
    if (colourWords[first] && modifiers[second]) return `${modifiers[second]} ${colourWords[first]}`
    if (first === "azul" && second === "royal") return "Royal Blue"
    if (first === "ver" && second === "menta") return "Mint Green"
    if (colourWords[first] && words.length === 1) return colourWords[first]
    if (colourWords[first] && second === "aguamarina") return "Aqua Green"
    return part.trim()
  }).join(" / ")
}

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

export function makitoVariantSizeLabel(variant: MakitoVariant, productName: string, colorGroup: string) {
  const code = String(variant.variant_size || "").trim()
  if (!code || code === "000") return
  if (!/^\d+$/u.test(code)) return code
  const label = makitoVariantLabel(variant, productName)
  if (!label) return
  if (label.toLocaleLowerCase().startsWith(`${colorGroup.toLocaleLowerCase()} `)) return label.slice(colorGroup.length).trim()
  return label.match(sizeSuffix)?.[1]
}

export function makitoColorLabels(records: MakitoProductRecord[]) {
  const counts = new Map<string, Map<string, number>>()
  for (const record of records) {
    const name = String(record.payload?.name || "")
    for (const variant of record.payload?.variants || []) {
      const code = String(variant.variant_colorcode || "").trim()
      const original = makitoVariantLabel(variant, name)
      const label = original && String(variant.variant_size || "") !== "000" ? original.replace(sizeSuffix, "").trim() : original
      if (!code || !label) continue
      const key = `${record.supplier_id}:${code}`
      const labels = counts.get(key) || new Map<string, number>()
      labels.set(label, (labels.get(label) || 0) + (String(variant.variant_size || "") === "000" ? 10 : 1))
      counts.set(key, labels)
    }
  }
  return new Map([...counts].map(([key, labels]) => [key, makitoColourLabel([...labels].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0][0])]))
}
