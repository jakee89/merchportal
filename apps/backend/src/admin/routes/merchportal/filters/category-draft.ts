// Strip only delimiter spacing, not spaces the user is still typing in a name.
export function categoryDraftParts(value: string): [string, string] {
  const separator = value.indexOf(">")
  return separator < 0 ? ["", value] : [value.slice(0, separator).replace(/ $/u, ""), value.slice(separator + 1).replace(/^ /u, "")]
}

export function categoryDraftPath(parent: string, child: string) {
  return parent.trim() ? `${parent} > ${child}` : child
}
