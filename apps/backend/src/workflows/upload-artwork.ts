import { uploadFilesWorkflow } from "@medusajs/medusa/core-flows"
import { MedusaError } from "@medusajs/framework/utils"
import { inflateSync } from "node:zlib"

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
  const valid = input.mime_type === "image/png" ? validatePng(bytes)
    : input.mime_type === "image/jpeg" ? bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217
      : input.mime_type === "application/pdf" ? validatePdf(bytes)
        : validateSvg(bytes)
  if (!valid) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Artwork is invalid or contains unsupported active content. Export a static PDF, PNG, JPG or SVG and retry.")
  return bytes
}

function validatePng(bytes: Buffer) {
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return false
  let offset = 8
  let imageData = false
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii")
    if (offset + length + 12 > bytes.length || !/^[A-Za-z]{4}$/.test(type)) return false
    if (offset === 8) {
      if (type !== "IHDR" || length !== 13) return false
      const width = bytes.readUInt32BE(offset + 8)
      const height = bytes.readUInt32BE(offset + 12)
      if (!width || !height || width * height > 40_000_000) return false
    }
    if (type === "IDAT") imageData = true
    offset += length + 12
    if (type === "IEND") return length === 0 && imageData && offset === bytes.length
  }
  return false
}

function validatePdf(bytes: Buffer) {
  const pdf = bytes.toString("latin1")
  if (!/^%PDF-1\.[0-7]|^%PDF-2\.0/.test(pdf) || !/%%EOF\s*$/.test(pdf)) return false
  // PDF names can encode letters as #xx. Inspect both ordinary dictionaries
  // and bounded Flate object streams; never execute or render uploaded files.
  const unsafe = (text: string) => /\/(?:JavaScript|JS|OpenAction|AA|Launch|EmbeddedFile|Filespec|RichMedia|XFA|Encrypt|SubmitForm|ImportData|GoToR|URI)\b/i.test(text.replace(/#([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))))
  if (unsafe(pdf)) return false
  let decodedBytes = 0
  let streams = 0
  for (const match of pdf.matchAll(/stream(?:\r\n|\n|\r)([\s\S]*?)(?:\r\n|\n|\r)endstream/g)) {
    if (++streams > 2000) return false
    const preceding = pdf.slice(Math.max(0, match.index! - 5000), match.index)
    const boundary = preceding.lastIndexOf("endobj")
    const dictionary = preceding.slice(boundary < 0 ? 0 : boundary + 6).replace(/#([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    if (!/\/FlateDecode\b/.test(dictionary)) {
      if (/\/ObjStm\b/.test(dictionary) && /\/Filter\b/.test(dictionary)) return false
      continue
    }
    // Chained filters need a real scanner/parser and are deliberately refused.
    if (/\/Filter\s*\[/.test(dictionary) && !/\/Filter\s*\[\s*\/FlateDecode\s*\]/.test(dictionary)) return false
    try {
      const length = dictionary.match(/\/Length\s+(\d+)\s*(?!\d|\s+\d+\s+R)/)?.[1]
      const start = match.index! + /^stream(?:\r\n|\n|\r)/.exec(match[0])![0].length
      const stream = length ? bytes.subarray(start, start + Number(length)) : Buffer.from(match[1], "latin1")
      const decoded = inflateSync(stream, { maxOutputLength: 20 * 1024 * 1024 - decodedBytes })
      decodedBytes += decoded.length
      if (decodedBytes >= 20 * 1024 * 1024 || unsafe(decoded.toString("latin1"))) return false
    } catch { return false }
  }
  return true
}

function validateSvg(bytes: Buffer) {
  let svg: string
  try { svg = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim() } catch { return false }
  svg = svg.replace(/^<\?xml\s+[^>]*\?>\s*/i, "")
  svg = svg.replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, code) => String.fromCodePoint(Math.min(0x10ffff, parseInt(code.replace(/^x/i, ""), /^x/i.test(code) ? 16 : 10))))
  if (!/^<svg(?:\s|>)/i.test(svg) || !/<\/svg\s*>\s*$/i.test(svg)) return false
  return !/<!DOCTYPE|<!ENTITY|<!\[CDATA|<\?|<\s*(?:[\w.-]+:)?(?:script|foreignObject|iframe|object|embed|image|animate\w*|set|link)\b|\s(?:[\w.-]+:)?on[a-z]+\s*=|\b(?:[\w.-]+:)?href\s*=\s*(?!["']#)[^\s>]|\b(?:javascript|data):|@import|url\s*\(/i.test(svg)
}

export async function uploadArtwork(container: any, input: Input) {
  validateArtwork(input)
  const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120)
  const { result } = await uploadFilesWorkflow(container).run({
    input: { files: [{ filename: `artwork-${Date.now()}-${safeName}`, mimeType: input.mime_type, content: input.content, access: "private" }] },
  })
  return result[0]
}
