"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import {
  ClipboardCheck,
  FileText,
  ListChecks,
  Building2,
  Truck,
  AlertTriangle,
  PlusCircle,
  LayoutDashboard,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
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

type DepartmentNavItem = {
  slug: string
  label: string
}

type EscalationTargetNavItem = {
  slug: string
  label: string
  count: number
}

const navGroups: NavGroup[] = [
  {
    name: "Requester",
    icon: FileText,
    items: [
      { name: "List Requests", href: "/requester/list-requests", icon: ListChecks },
      { name: "Add request", href: "/requester/add-request", icon: PlusCircle },
    ],
  },
  {
    name: "Reviewer",
    icon: ClipboardCheck,
    items: [
      { name: "Dashboard", href: "/reviewer/dashboard", icon: LayoutDashboard },
      { name: "Supplier", href: "/reviewer/supplier", icon: Truck },
    ],
  },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)
  const [departments, setDepartments] = useState<DepartmentNavItem[]>([])
  const [departmentsOpen, setDepartmentsOpen] = useState(false)
  const [escalationTargets, setEscalationTargets] = useState<EscalationTargetNavItem[]>([])
  const [escalationTargetsOpen, setEscalationTargetsOpen] = useState(false)

  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const response = await fetch("/api/departments", { cache: "no-store" })
        if (!response.ok) return
        const data = (await response.json()) as Array<{ slug: string; label: string }>
        setDepartments(data)
      } catch {
        // Keep empty on failure.
      }
    }
    void loadDepartments()
  }, [])

  useEffect(() => {
    const loadEscalationTargets = async () => {
      try {
        const response = await fetch("/api/escalation-targets", { cache: "no-store" })
        if (!response.ok) return
        const data = (await response.json()) as Array<{ slug: string; label: string; count: number }>
        setEscalationTargets(data)
      } catch {
        // Keep empty on failure.
      }
    }
    void loadEscalationTargets()
  }, [])

  useEffect(() => {
    if (pathname.startsWith("/requester/departments/")) {
      setDepartmentsOpen(true)
      return
    }
    setDepartmentsOpen(false)
  }, [pathname])

  useEffect(() => {
    if (pathname.startsWith("/reviewer/escalated/")) {
      setEscalationTargetsOpen(true)
      return
    }
    setEscalationTargetsOpen(false)
  }, [pathname])

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
                  {group.name === "Requester" && departments.length > 0 ? (
                    <li>
                      <button
                        type="button"
                        onClick={() => setDepartmentsOpen((prev) => !prev)}
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                          pathname.startsWith("/requester/departments/")
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                        )}
                      >
                        <Building2 className="h-4 w-4" />
                        <span className="flex-1 text-left">Departments</span>
                        {departmentsOpen ? (
                          <ChevronDown className="h-4 w-4 opacity-80" />
                        ) : (
                          <ChevronRight className="h-4 w-4 opacity-80" />
                        )}
                      </button>
                      {departmentsOpen ? (
                        <ul className="mt-1 ml-6 flex flex-col gap-1 border-l border-sidebar-border/50 pl-2">
                          {departments.map((department) => {
                            const href = `/requester/departments/${department.slug}`
                            return (
                              <li key={department.slug}>
                                <Link
                                  href={href}
                                  className={cn(
                                    "block rounded-md px-3 py-1.5 text-xs transition-colors",
                                    isActive(href)
                                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                                  )}
                                >
                                  {department.label}
                                </Link>
                              </li>
                            )
                          })}
                        </ul>
                      ) : null}
                    </li>
                  ) : null}
                  {group.name === "Reviewer" ? (
                    <li>
                      <button
                        type="button"
                        onClick={() => setEscalationTargetsOpen((prev) => !prev)}
                        className={cn(
                          "flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                          pathname.startsWith("/reviewer/escalated/")
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                        )}
                      >
                        <AlertTriangle className="h-4 w-4" />
                        <span className="flex-1 text-left">Escalated</span>
                        {escalationTargetsOpen ? (
                          <ChevronDown className="h-4 w-4 opacity-80" />
                        ) : (
                          <ChevronRight className="h-4 w-4 opacity-80" />
                        )}
                      </button>
                      {escalationTargetsOpen ? (
                        <ul className="mt-1 ml-6 flex flex-col gap-1 border-l border-sidebar-border/50 pl-2">
                          {escalationTargets.map((target) => {
                            const href = `/reviewer/escalated/${target.slug}`
                            return (
                              <li key={target.slug}>
                                <Link
                                  href={href}
                                  className={cn(
                                    "flex items-center justify-between rounded-md px-3 py-1.5 text-xs transition-colors",
                                    isActive(href)
                                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                                  )}
                                >
                                  <span className="truncate pr-2">{target.label}</span>
                                  <span className="rounded bg-sidebar-accent/50 px-1.5 py-0.5 text-[10px] leading-none">
                                    {target.count}
                                  </span>
                                </Link>
                              </li>
                            )
                          })}
                          {escalationTargets.length === 0 ? (
                            <li className="px-3 py-1.5 text-xs text-sidebar-foreground/50">No escalated targets</li>
                          ) : null}
                        </ul>
                      ) : null}
                    </li>
                  ) : null}
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
