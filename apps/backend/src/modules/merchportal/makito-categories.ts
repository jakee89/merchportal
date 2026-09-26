const genericLevels = new Set(["production", "products"])

export function makitoCategoryPaths(input: unknown): string[][] {
  if (!Array.isArray(input)) return []
  const paths = input.flatMap((item) => {
    const label = Array.isArray(item) ? item.join(" > ") : typeof item === "string" ? item : item && typeof item === "object"
      ? ["name", "description", "title"].map((key) => (item as Record<string, unknown>)[key]).find((value) => typeof value === "string")
      : undefined
    if (typeof label !== "string") return []
    const levels = label.split(/\s*>\s*/u).map((part) => part.trim()).filter(Boolean)
      .filter((part) => !genericLevels.has(part.toLowerCase()))
      .filter((part, index, parts) => index === 0 || part.toLowerCase() !== parts[index - 1].toLowerCase())
    return levels.length ? [levels] : []
  })
  return [...new Map(paths.map((path) => [path.join("\u0000").toLowerCase(), path])).values()]
}

export function makitoDocumentCategories(document: { category_paths?: unknown; category_hierarchy?: unknown; category?: unknown }) {
  const input = Array.isArray(document.category_paths) && document.category_paths.length
    ? document.category_paths
    : Array.isArray(document.category_hierarchy) && document.category_hierarchy.length
      ? document.category_hierarchy
      : [document.category]
  const paths = makitoCategoryPaths(input)
  return { paths, primary: primaryMakitoCategoryPath(paths), levels: makitoCategoryLevels(paths) }
}

export function primaryMakitoCategoryPath(paths: string[][]): string[] {
  if (!paths.length) return []
  const root = paths[0][0]?.toLowerCase()
  return paths.find((path) => path[0]?.toLowerCase() === root && path.length > 1) || paths[0]
}

export function makitoCategoryLevels(paths: string[][]): string[] {
  return [...new Map(paths.flat().map((level) => [level.toLowerCase(), level])).values()]
}
