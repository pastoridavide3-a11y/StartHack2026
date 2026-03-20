"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { AppShell } from "@/components/app-shell"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

const BACKEND_BASE_URL = "http://127.0.0.1:8010"

interface RequestRecord {
  request_id: string
  created_at: string
  category_l1: string
  category_l2: string
  country: string
  budget_amount: number | null
  currency: string | null
  required_by_date: string | null
  status: string
}

interface ProcessedOutputRecord {
  output_id: number
  request_id: string
  processed_at: string
  final_output?: {
    recommendation?: { status?: string }
    escalations?: Array<{ rule_id?: string }>
    supplier_shortlist?: Array<{ compliance_status?: string }>
  }
}

type RowStatus = "Pending" | "Ready" | "Escalated" | "No match"

function deriveStatus(
  processed: ProcessedOutputRecord | undefined
): RowStatus {
  if (!processed) return "Pending"
  const escalations = processed.final_output?.escalations
  if (Array.isArray(escalations) && escalations.length > 0) return "Escalated"
  const rec = (processed.final_output?.recommendation?.status ?? "").toLowerCase()
  if (rec === "no_viable_supplier" || rec === "no_viable") return "No match"
  if (rec) return "Ready"
  return "Pending"
}

function countCompliant(processed: ProcessedOutputRecord | undefined): number | null {
  if (!processed) return null
  const shortlist = processed.final_output?.supplier_shortlist
  if (!Array.isArray(shortlist)) return null
  return shortlist.filter((s) => s.compliance_status === "compliant").length
}

function urgencyDays(requiredByDate: string | null | undefined): number | null {
  if (!requiredByDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const required = new Date(requiredByDate)
  return Math.ceil((required.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function urgencyLabel(days: number | null): string {
  if (days === null) return "-"
  if (days < 0) return `Overdue ${Math.abs(days)}d`
  if (days === 0) return "Today"
  if (days <= 7) return `${days}d`
  if (days <= 30) return `${days}d`
  return `${days}d`
}

function urgencyClass(days: number | null): string {
  if (days === null) return "text-muted-foreground"
  if (days < 0) return "text-red-400 font-semibold"
  if (days <= 7) return "text-amber-400 font-semibold"
  if (days <= 30) return "text-yellow-300"
  return "text-emerald-400"
}

function statusBadgeClass(status: RowStatus): string {
  switch (status) {
    case "Ready": return "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
    case "Escalated": return "border-amber-500/40 bg-amber-500/15 text-amber-300"
    case "No match": return "border-red-500/40 bg-red-500/15 text-red-300"
    default: return "border-blue-500/40 bg-blue-500/15 text-blue-300"
  }
}

export default function ReviewerDashboardPage() {
  const router = useRouter()
  const [requests, setRequests] = useState<RequestRecord[]>([])
  const [outputs, setOutputs] = useState<ProcessedOutputRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [urgencyFilter, setUrgencyFilter] = useState<string>("all")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [dateSort, setDateSort] = useState<"asc" | "desc">("asc")

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [reqRes, outRes] = await Promise.all([
          fetch("/api/requests"),
          fetch(`${BACKEND_BASE_URL}/processed-outputs`),
        ])
        if (!reqRes.ok) throw new Error(`Failed to load requests (${reqRes.status})`)
        if (!outRes.ok) throw new Error(`Failed to load outputs (${outRes.status})`)
        const reqs = (await reqRes.json()) as RequestRecord[]
        // Sort ascending by created_at
        reqs.sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))
        setRequests(reqs)
        setOutputs((await outRes.json()) as ProcessedOutputRecord[])
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load dashboard data")
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const latestOutputByRequestId = useMemo(() => {
    const map = new Map<string, ProcessedOutputRecord>()
    for (const out of outputs) {
      const existing = map.get(out.request_id)
      if (!existing || out.output_id > existing.output_id) map.set(out.request_id, out)
    }
    return map
  }, [outputs])

  const rows = useMemo(() => {
    return requests.map((request) => {
      const processed = latestOutputByRequestId.get(request.request_id)
      const status = deriveStatus(processed)
      const compliant = countCompliant(processed)
      const days = urgencyDays(request.required_by_date)
      return { request, status, compliant, days }
    })
  }, [requests, latestOutputByRequestId])

  // KPI aggregates
  const totalRequests = requests.length
  const totalBudget = requests.reduce((s, r) => s + (r.budget_amount ?? 0), 0)
  const processedCount = rows.filter((r) => r.status !== "Pending").length
  const escalatedCount = rows.filter((r) => r.status === "Escalated").length
  const noMatchCount = rows.filter((r) => r.status === "No match").length
  const pendingCount = rows.filter((r) => r.status === "Pending").length

  // Filters + sort
  const filteredRows = useMemo(() => {
    const filtered = rows.filter(({ request, status, days }) => {
      if (statusFilter !== "all" && status !== statusFilter) return false
      if (categoryFilter !== "all" &&
        request.category_l1 !== categoryFilter &&
        request.category_l2 !== categoryFilter) return false
      if (urgencyFilter === "overdue" && (days === null || days >= 0)) return false
      if (urgencyFilter === "week" && (days === null || days < 0 || days > 7)) return false
      if (urgencyFilter === "month" && (days === null || days < 0 || days > 30)) return false
      return true
    })
    filtered.sort((a, b) => {
      const cmp = (a.request.created_at ?? "").localeCompare(b.request.created_at ?? "")
      return dateSort === "asc" ? cmp : -cmp
    })
    return filtered
  }, [rows, statusFilter, categoryFilter, urgencyFilter, dateSort])

  return (
    <AppShell>
      <div className="p-6 lg:p-8 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Reviewer · Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Executive overview of company-level request activity.
          </p>
        </div>

        {error && (
          <Card>
            <CardContent className="py-6 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {/* KPI cards — 6 cards, 3 columns */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Card className="border-l-4 border-l-blue-500/70">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase tracking-wide">Total requests</CardDescription>
              <CardTitle className="text-3xl font-bold">{totalRequests}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-l-4 border-l-cyan-500/70">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase tracking-wide">Total requested budget</CardDescription>
              <CardTitle className="text-3xl font-bold">{Math.round(totalBudget).toLocaleString()}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-l-4 border-l-emerald-500/70">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase tracking-wide">Processed</CardDescription>
              <CardTitle className="text-3xl font-bold">{processedCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-l-4 border-l-slate-400/70">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase tracking-wide">Pending</CardDescription>
              <CardTitle className="text-3xl font-bold">{pendingCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-l-4 border-l-amber-500/70">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase tracking-wide">Escalated</CardDescription>
              <CardTitle className="text-3xl font-bold">{escalatedCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-l-4 border-l-red-500/70">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase tracking-wide">No supplier match</CardDescription>
              <CardTitle className="text-3xl font-bold">{noMatchCount}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Requests table */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Requests overview</CardTitle>
            <CardDescription>
              Sorted by submission date (oldest first). Click a row to open the detailed view.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36 bg-input border-border text-foreground text-sm h-8">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Ready">Ready</SelectItem>
                  <SelectItem value="Escalated">Escalated</SelectItem>
                  <SelectItem value="No match">No match</SelectItem>
                </SelectContent>
              </Select>

              <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
                <SelectTrigger className="w-36 bg-input border-border text-foreground text-sm h-8">
                  <SelectValue placeholder="Urgency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All urgency</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="week">This week</SelectItem>
                  <SelectItem value="month">This month</SelectItem>
                </SelectContent>
              </Select>

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-44 bg-input border-border text-foreground text-sm h-8">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  <SelectItem value="IT">IT</SelectItem>
                  <SelectItem value="Facilities">Facilities</SelectItem>
                  <SelectItem value="Professional Services">Professional Services</SelectItem>
                  <SelectItem value="Marketing">Marketing</SelectItem>
                </SelectContent>
              </Select>

              <button
                type="button"
                onClick={() => setDateSort((s) => s === "asc" ? "desc" : "asc")}
                className="flex items-center gap-1.5 rounded-md border border-border bg-input px-2.5 h-8 text-xs text-foreground hover:bg-muted/60 transition-colors"
              >
                Date {dateSort === "asc" ? "↑ Oldest first" : "↓ Newest first"}
              </button>
              <span className="text-xs text-muted-foreground self-center ml-auto">
                {filteredRows.length} of {rows.length} requests
              </span>
            </div>

            {loading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : (
              <div className="border border-border rounded-md overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/80 sticky top-0 backdrop-blur">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold tracking-wide text-foreground/90">Request ID</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold tracking-wide text-foreground/90">Submitted</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold tracking-wide text-foreground/90">Category</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold tracking-wide text-foreground/90">Required by</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold tracking-wide text-foreground/90">Urgency</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold tracking-wide text-foreground/90">Budget</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold tracking-wide text-foreground/90">Compliant #</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold tracking-wide text-foreground/90">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map(({ request, status, compliant, days }, idx) => (
                      <tr
                        key={request.request_id}
                        onClick={() => router.push(`/reviewer/dashboard/${request.request_id}`)}
                        className={cn(
                          "border-t border-border/70 cursor-pointer transition-colors",
                          idx % 2 === 0 ? "bg-card/40" : "bg-muted/10",
                          "hover:bg-primary/10"
                        )}
                      >
                        <td className="px-3 py-2 font-medium">{request.request_id}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                          {request.created_at?.slice(0, 10) || "-"}
                        </td>
                        <td className="px-3 py-2">{request.category_l2 || request.category_l1 || "-"}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                          {request.required_by_date ?? "-"}
                        </td>
                        <td className={cn("px-3 py-2 whitespace-nowrap text-xs", urgencyClass(days))}>
                          {urgencyLabel(days)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {request.budget_amount != null
                            ? `${request.budget_amount.toLocaleString()} ${request.currency ?? ""}`.trim()
                            : "-"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {compliant !== null ? (
                            <span className={cn(
                              "font-semibold",
                              compliant === 0 ? "text-red-400" : "text-emerald-400"
                            )}>
                              {compliant}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={statusBadgeClass(status)}>
                            {status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {filteredRows.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-3 py-4 text-center text-muted-foreground">
                          No requests match the selected filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
