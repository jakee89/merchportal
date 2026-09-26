export function catalogPreview(document: any) {
  return {
    id: document.id,
    name: document.name,
    description: document.short_description || document.description,
    image_url: document.image_url,
    category: document.category,
    category_hierarchy: document.category_hierarchy,
    category_paths: document.category_paths,
    colors: document.colors,
    materials: document.materials,
    brand: document.brand,
    lead_time: document.lead_time,
    sustainable: document.sustainable,
    print_methods: document.print_methods,
    keywords: document.keywords,
    stock_quantity: document.stock_quantity,
    variants: (document.variants || []).map((variant: any) => ({
      sku: variant.sku,
      color: variant.color,
      color_group: variant.color_group,
      color_hex: variant.color_hex,
      stock_quantity: variant.stock_quantity,
      images: variant.images?.slice(0, 1),
      future_stock: variant.future_stock?.slice(0, 1),
    })),
  }
}
