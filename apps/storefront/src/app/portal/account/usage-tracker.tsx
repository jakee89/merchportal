"use client"

import { usePathname } from "next/navigation"
import { useEffect } from "react"

function sendUsage(body: Record<string, number>, beacon = false) {
  const payload = JSON.stringify(body)
  if (beacon && navigator.sendBeacon) {
    navigator.sendBeacon("/portal/usage", new Blob([payload], { type: "application/json" }))
    return
  }
  fetch("/portal/usage", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, credentials: "same-origin", keepalive: true }).catch(() => undefined)
}

export default function UsageTracker() {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname.startsWith("/portal/account")) return
    sendUsage({ page_views: 1, product_views: /^\/portal\/account\/products\/[^/]+/.test(pathname) ? 1 : 0 })
  }, [pathname])

  useEffect(() => {
    let lastTick = Date.now()
    let lastInteraction = lastTick
    let pendingSeconds = 0
    const interacted = () => { lastInteraction = Date.now() }
    const flush = (beacon = false) => {
      if (!pendingSeconds) return
      sendUsage({ active_seconds: Math.min(30, pendingSeconds) }, beacon)
      pendingSeconds = 0
    }
    const tick = () => {
      const now = Date.now()
      if (document.visibilityState === "visible" && now - lastInteraction < 60_000) {
        pendingSeconds += Math.max(0, Math.min(10, Math.floor((now - lastTick) / 1000)))
      }
      lastTick = now
      if (pendingSeconds >= 30) flush()
    }
    const finish = () => {
      const now = Date.now()
      if (now - lastInteraction < 60_000) pendingSeconds += Math.max(0, Math.min(10, Math.floor((now - lastTick) / 1000)))
      lastTick = now
      flush(true)
    }
    const hidden = () => { if (document.visibilityState === "hidden") finish(); else lastTick = Date.now() }
    const leaving = () => finish()
    document.addEventListener("pointerdown", interacted, { passive: true })
    document.addEventListener("keydown", interacted)
    document.addEventListener("scroll", interacted, { passive: true })
    document.addEventListener("visibilitychange", hidden)
    window.addEventListener("pagehide", leaving)
    const timer = window.setInterval(tick, 10_000)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("pointerdown", interacted)
      document.removeEventListener("keydown", interacted)
      document.removeEventListener("scroll", interacted)
      document.removeEventListener("visibilitychange", hidden)
      window.removeEventListener("pagehide", leaving)
      finish()
    }
  }, [])

  return null
}
