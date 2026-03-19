"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ClipboardCheck, FileText, ListChecks, Building2, Truck, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

type NavItem = {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

type NavGroup = {
  name: string
  icon: React.ComponentType<{ className?: string }>
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    name: "Requester",
    icon: FileText,
    items: [
      { name: "Dashboard", href: "/requester/dashboard", icon: FileText },
      { name: "List Requests", href: "/requester/list-requests", icon: ListChecks },
      { name: "Department", href: "/requester/department", icon: Building2 },
    ],
  },
  {
    name: "Reviewer",
    icon: ClipboardCheck,
    items: [
      { name: "Supplier", href: "/reviewer/supplier", icon: Truck },
      { name: "List", href: "/reviewer/list", icon: ListChecks },
      { name: "Escalated", href: "/reviewer/escalated", icon: AlertTriangle },
    ],
  },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-sidebar flex flex-col">
        <div className="p-4 border-b border-sidebar-border">
          <h1 className="text-lg font-semibold text-sidebar-foreground">Request Portal</h1>
        </div>
        <nav className="flex-1 p-3">
          <div className="flex flex-col gap-5">
            {navGroups.map((group, idx) => (
              <div
                key={group.name}
                className={cn(
                  "rounded-lg border border-sidebar-border/60 bg-sidebar-accent/10 p-2",
                  idx > 0 && "pt-3"
                )}
              >
                <div className="px-2 pb-2 text-sm font-bold tracking-wide text-sidebar-foreground flex items-center gap-2">
                  <group.icon className="h-4 w-4" />
                  {group.name}
                </div>
                <ul className="flex flex-col gap-1 border-t border-sidebar-border/60 pt-2">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                          isActive(item.href)
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                        )}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 bg-background">
        {children}
      </main>
    </div>
  )
}
