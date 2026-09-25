import { uploadFilesWorkflow } from "@medusajs/medusa/core-flows"
import { MedusaError } from "@medusajs/framework/utils"

type Input = { filename: string; mime_type: string; content: string }

const extensions: Record<string, string[]> = {
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "application/pdf": ["pdf"],
  "image/svg+xml": ["svg"],
}

export function validateArtwork(input: Input) {
  const allowed = extensions[input.mime_type]
  const extension = input.filename?.split(".").at(-1)?.toLowerCase()
  if (!allowed?.includes(extension || "")) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Artwork must be a PDF, PNG, JPG, or SVG file with a matching extension")
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input.content) || input.content.length > Math.ceil(10 * 1024 * 1024 / 3) * 4 + 4) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Artwork data is invalid or exceeds 10 MB")
  const bytes = Buffer.from(input.content, "base64")
  if (!bytes.length || bytes.length > 10 * 1024 * 1024 || bytes.toString("base64") !== input.content) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Artwork data is invalid or exceeds 10 MB")
  const valid = input.mime_type === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : input.mime_type === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : input.mime_type === "application/pdf" ? bytes.subarray(0, 5).toString("ascii") === "%PDF-"
        : validateSvg(bytes)
  if (!valid) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Artwork content does not match its file type")
  return bytes
}

function validateSvg(bytes: Buffer) {
  let svg: string
  try { svg = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim() } catch { return false }
  svg = svg.replace(/^<\?xml\s+[^>]*\?>\s*/i, "")
  if (!/^<svg(?:\s|>)/i.test(svg) || !/<\/svg\s*>\s*$/i.test(svg)) return false
  return !/<!DOCTYPE|<!ENTITY|<!\[CDATA|<\?|<\s*(?:script|foreignObject|iframe|object|embed|image|animate|set|link)\b|\son[a-z]+\s*=|\b(?:href|xlink:href)\s*=\s*["']\s*(?!#)|\b(?:javascript|data):|@import|url\s*\(/i.test(svg)
}

export async function uploadArtwork(container: any, input: Input) {
  validateArtwork(input)
  const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120)
  const { result } = await uploadFilesWorkflow(container).run({
    input: { files: [{ filename: `artwork-${Date.now()}-${safeName}`, mimeType: input.mime_type, content: input.content, access: "private" }] },
  })
  return result[0]
}
