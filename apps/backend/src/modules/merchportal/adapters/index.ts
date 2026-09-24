import { MedusaError } from "@medusajs/framework/utils"
import { MidoceanAdapter } from "./midocean"
import { StrickerAdapter } from "./stricker"
import { SupplierAdapter } from "./types"

export function createSupplierAdapter(code: string, credential?: string): SupplierAdapter {
  if (code === "stricker") {
    const key = credential || process.env.STRICKER_ACCESS_KEY
    if (!key) throw new MedusaError(MedusaError.Types.INVALID_DATA, "STRICKER_ACCESS_KEY is not configured")
    return new StrickerAdapter(key)
  }

  if (code === "midocean") {
    const key = credential || process.env.MIDOCEAN_API_KEY
    if (!key) throw new MedusaError(MedusaError.Types.INVALID_DATA, "MIDOCEAN_API_KEY is not configured")
    return new MidoceanAdapter(key)
  }

  throw new MedusaError(MedusaError.Types.INVALID_DATA, `Unsupported supplier: ${code}`)
}

export type { SyncKind } from "./types"
