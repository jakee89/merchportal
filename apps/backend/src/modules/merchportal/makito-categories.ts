const genericLevels = new Set(["production", "products"])
const isMarkingBranch = (value: string) => value.trim().replace(/\s+/gu, " ").toLocaleLowerCase() === "marking techniques"

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
    // Drop the entire non-product branch, not just its parent: Digital, Doming,
    // etc. must not become standalone product categories or AI category inputs.
    if (levels.some(isMarkingBranch)) return []
    return levels.length ? [levels] : []
  })
  return [...new Map(paths.map((path) => [path.join("\u0000").toLowerCase(), path])).values()]
}

export function makitoDocumentCategories(document: { category_paths?: unknown; category_hierarchy?: unknown; category?: unknown }) {
  let input = Array.isArray(document.category_paths) && document.category_paths.length
    ? document.category_paths
    : Array.isArray(document.category_hierarchy) && document.category_hierarchy.length
      ? document.category_hierarchy
      : [document.category]
  // Legacy documents can store a single breadcrumb as flat levels.
  if (!Array.isArray(document.category_paths) || !document.category_paths.length) {
    const first = input.find((value) => typeof value === "string" && !genericLevels.has(value.trim().toLocaleLowerCase()))
    if (typeof first === "string" && isMarkingBranch(first)) input = []
  }
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
