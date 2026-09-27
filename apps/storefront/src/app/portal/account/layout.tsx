import UsageTracker from "./usage-tracker"

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <><UsageTracker />{children}</>
}
