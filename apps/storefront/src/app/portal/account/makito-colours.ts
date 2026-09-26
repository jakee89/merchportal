const colours: Record<string, string> = {
  white: "#ffffff", black: "#171717", red: "#c92332", blue: "#245ab5",
  marine: "#19345c", navy: "#19345c", "light blue": "#91c6e8", yellow: "#f3d43b", orange: "#ef842b",
  green: "#34844b", "light green": "#9bcf83", grey: "#8f969e", gray: "#8f969e", silver: "#c2c6cc",
  beige: "#d8c5a3", natural: "#dfd2b8", brown: "#754b36", pink: "#dc8cae",
  purple: "#794c93", burgundy: "#772b3e", bordeaux: "#772b3e", gold: "#c8a75d", turquoise: "#3aa8ad",
  lime: "#9cc644", khaki: "#a99564", ivory: "#eee8d5", cream: "#eee5cf",
}

export function makitoColourHex(name: string) {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, " ")
  return colours[normalized] || (normalized.startsWith("light ") ? colours[normalized.slice(6)] : undefined)
}
