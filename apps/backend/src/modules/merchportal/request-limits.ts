import { MedusaError } from "@medusajs/framework/utils"

const attempts = new Map<string, { count: number; until: number }>()

export function limitCustomerAction(action: "join" | "artwork", actorId: string) {
  const now = Date.now()
  const key = `${action}:${actorId}`
  const existing = attempts.get(key)
  const windowMs = action === "artwork" ? 60 * 60 * 1000 : 15 * 60 * 1000
  const limit = action === "artwork" ? 20 : 10
  const current = existing && existing.until > now ? existing : { count: 0, until: now + windowMs }
  if (current.count >= limit) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Too many attempts. Please try again later")
  attempts.set(key, { ...current, count: current.count + 1 })
  if (attempts.size > 10_000) {
    for (const [entry, value] of attempts) if (value.until <= now) attempts.delete(entry)
    if (attempts.size > 10_000) attempts.delete(attempts.keys().next().value as string)
  }
}
