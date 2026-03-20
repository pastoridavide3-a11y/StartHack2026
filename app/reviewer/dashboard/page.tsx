"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { AppShell } from "@/components/app-shell"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const BACKEND_BASE_URL = "http://127.0.0.1:8010"

interface RequestRecord {
  request_id: string
  created_at: string
  category_l1: string
  category_l2: string
  country: string
  budget_amount: number | null
  status: string
}

interface ProcessedOutputRecord {
  output_id: number
  request_id: string
  processed_at: string
  final_output?: {
    recommendation?: {
      status?: string
    }
  }
}

function deriveStatus(request: RequestRecord, processed: ProcessedOutputRecord | undefined): string {
  if (!processed) return "Pending"
  const rec = (processed.final_output?.recommendation?.status ?? "").toLowerCase()
  if (rec.includes("escalat")) return "Escalated"
  if (rec.includes("approv") || rec.includes("award")) return "Approved"
  return "Processed"
}

export default function ReviewerDashboardPage() {
  const router = useRouter()
  const [requests, setRequests] = useState<RequestRecord[]>([])
  const [outputs, setOutputs] = useState<ProcessedOutputRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        if (!outRes.ok) throw new Error(`Failed to load processed outputs (${outRes.status})`)
        setRequests((await reqRes.json()) as RequestRecord[])
        setOutputs((await outRes.json()) as ProcessedOutputRecord[])
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load dashboard data")
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const latestProcessedByRequestId = useMemo(() => {
    const map = new Map<string, ProcessedOutputRecord>()
    for (const out of outputs) {
      if (!map.has(out.request_id)) map.set(out.request_id, out)
    }
    return map
  }, [outputs])

  const rows = useMemo(
    () =>
      requests.map((request) => ({
        request,
        status: deriveStatus(request, latestProcessedByRequestId.get(request.request_id)),
      })),
    [requests, latestProcessedByRequestId]
  )

  const totalRequests = requests.length
  const totalBudget = requests.reduce((sum, r) => sum + (r.budget_amount ?? 0), 0)
  const processedCount = requests.filter((r) => latestProcessedByRequestId.has(r.request_id)).length
  const pendingCount = totalRequests - processedCount
  const averageBudget = totalRequests > 0 ? totalBudget / totalRequests : 0

  const statusBadgeClass = (status: string) => {
    const s = status.toLowerCase()
    if (s.includes("pending")) return "border-blue-500/40 bg-blue-500/15 text-blue-300"
    if (s.includes("approved") || s.includes("processed")) return "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
    if (s.includes("escalated")) return "border-amber-500/40 bg-amber-500/15 text-amber-300"
    return "border-destructive/40 bg-destructive/15 text-destructive"
  }

  return (
    <AppShell>
      <div className="p-6 lg:p-8 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Reviewer · Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Executive overview of company-level request activity.
          </p>
        </div>

        {error ? (
          <Card>
            <CardContent className="py-6 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
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
              <CardDescription className="text-xs uppercase tracking-wide">Processed requests</CardDescription>
              <CardTitle className="text-3xl font-bold">{processedCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-l-4 border-l-blue-400/70">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase tracking-wide">Pending requests</CardDescription>
              <CardTitle className="text-3xl font-bold">{pendingCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-l-4 border-l-violet-500/70">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase tracking-wide">Average budget / request</CardDescription>
              <CardTitle className="text-3xl font-bold">{Math.round(averageBudget).toLocaleString()}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Requests overview</CardTitle>
            <CardDescription>
              Click any row to open the detailed reviewer view.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : (
              <div className="border border-border rounded-md overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/80 sticky top-0 backdrop-blur">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold tracking-wide text-foreground/90">Request ID</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold tracking-wide text-foreground/90">Created date</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold tracking-wide text-foreground/90">Category</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold tracking-wide text-foreground/90">Country</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold tracking-wide text-foreground/90">Budget</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold tracking-wide text-foreground/90">Status</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold tracking-wide text-foreground/90">Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ request, status }, idx) => (
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
                        <td className="px-3 py-2 whitespace-nowrap">{request.created_at?.slice(0, 10) || "-"}</td>
                        <td className="px-3 py-2">{request.category_l2 || request.category_l1 || "-"}</td>
                        <td className="px-3 py-2">{request.country || "-"}</td>
                        <td className="px-3 py-2 text-right">
                          {request.budget_amount != null ? request.budget_amount.toLocaleString() : "-"}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={statusBadgeClass(status)}>
                            {status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          {status === "Escalated" ? (
                            <Badge variant="outline" className="border-amber-500/40 bg-amber-500/15 text-amber-300">
                              Attention
                            </Badge>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">
                          No requests found.
                        </td>
                      </tr>
                    ) : null}
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

