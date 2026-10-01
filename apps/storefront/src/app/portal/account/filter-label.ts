export function filterLabel(key: string, value: string) {
  const labels: Record<string, string> = { category: "Category", color: "Colour", size: "Size", material: "Material", brand: "Brand", lead_time: "Lead time", print_method: "Print", in_stock: "In stock", out_of_stock: "Out of stock", sustainable: "Sustainable" }
  if (["in_stock", "out_of_stock", "sustainable"].includes(key)) return labels[key]
  if (key === "min_price") return `Minimum €${value}`
  if (key === "max_price") return `Maximum €${value}`
  return `${labels[key] || key}: ${value.replace(/ > /g, " › ")}`
}
