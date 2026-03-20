"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { Building2, FileText, History, Lightbulb, ShieldCheck } from "lucide-react"

import { AppShell } from "@/components/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const BACKEND_BASE_URL = "http://127.0.0.1:8010"

interface RequestRecord {
  request_id: string
  created_at: string
  category_l1: string
  category_l2: string
  budget_amount: number | null
  requester_id: string
  requester_role: string
  status: string
  request_text: string
}

interface ProcessedOutputRecord {
  output_id: number
  request_id: string
  processed_at: string
  final_output?: {
    validation?: {
      completeness?: string
      issues_detected?: Array<{ severity?: string }>
    }
    recommendation?: {
      status?: string
      recommended_supplier?: string
    }
  }
}

export default function ReviewerRequestDetailPage() {
  const params = useParams<{ requestId: string }>()
  const requestId = params?.requestId

  const [requests, setRequests] = useState<RequestRecord[]>([])
  const [outputs, setOutputs] = useState<ProcessedOutputRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!requestId) return
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
        setError(e instanceof Error ? e.message : "Failed to load request details")
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [requestId])

  const request = useMemo(
    () => requests.find((r) => r.request_id === requestId) ?? null,
    [requests, requestId]
  )

  const latestOutput = useMemo(
    () => outputs.find((o) => o.request_id === requestId) ?? null,
    [outputs, requestId]
  )

  const similarPast = useMemo(() => {
    if (!request) return []
    return requests
      .filter((r) => r.request_id !== request.request_id && r.category_l1 === request.category_l1)
      .slice(0, 3)
  }, [request, requests])

  const budgetWithinLimits = (request?.budget_amount ?? 0) <= 100000
  const requiresApproval = (request?.budget_amount ?? 0) > 50000
  const complianceOk =
    latestOutput?.final_output?.validation?.completeness === "pass" &&
    (latestOutput.final_output.validation?.issues_detected?.length ?? 0) === 0

  const summaryStatus = latestOutput ? "Approved" : "Pending"

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl p-6 lg:p-8 space-y-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Request detail</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Reviewer deep dive for a single company request.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/reviewer/dashboard">Back to dashboard</Link>
          </Button>
        </div>

        {loading ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">Loading request details...</CardContent>
          </Card>
        ) : null}
        {error ? (
          <Card>
            <CardContent className="py-6 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : null}

        {!loading && !error && request ? (
          <>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary/80" />
                  Request summary
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5 text-sm">
                <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2.5 space-y-1">
                  <p className="text-xs text-muted-foreground">Request ID</p>
                  <p className="font-medium">{request.request_id}</p>
                </div>
                <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2.5 space-y-1">
                  <p className="text-xs text-muted-foreground">Category</p>
                  <p className="font-medium">{request.category_l2 || request.category_l1 || "-"}</p>
                </div>
                <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2.5 space-y-1">
                  <p className="text-xs text-muted-foreground">Budget</p>
                  <p className="font-medium">
                    {request.budget_amount != null ? request.budget_amount.toLocaleString() : "-"}
                  </p>
                </div>
                <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2.5 space-y-1">
                  <p className="text-xs text-muted-foreground">Requester</p>
                  <p className="font-medium">{request.requester_role || request.requester_id || "-"}</p>
                </div>
                <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2.5 space-y-1">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge
                    variant="outline"
                    className={
                      summaryStatus === "Pending"
                        ? "border-blue-500/40 bg-blue-500/15 text-blue-300"
                        : "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                    }
                  >
                    {summaryStatus}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 xl:grid-cols-2 items-stretch">
              <Card className="h-full">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary/80" />
                    Policy assessment
                  </CardTitle>
                  <CardDescription>Quick compliance indicators for reviewer decisions.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-xs">Budget within limits</p>
                    <Badge variant="outline" className={budgetWithinLimits ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" : "border-destructive/40 bg-destructive/15 text-destructive"}>
                      {budgetWithinLimits ? "Yes" : "No"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-xs">Requires approval</p>
                    <Badge variant="outline" className={requiresApproval ? "border-amber-500/40 bg-amber-500/15 text-amber-300" : "border-blue-500/40 bg-blue-500/15 text-blue-300"}>
                      {requiresApproval ? "Yes" : "No"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-xs">Compliance OK</p>
                    <Badge variant="outline" className={complianceOk ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" : "border-destructive/40 bg-destructive/15 text-destructive"}>
                      {complianceOk ? "Yes" : "No"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card className="h-full">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary/80" />
                    Supplier comparison
                  </CardTitle>
                  <CardDescription>High-level supplier benchmark snapshot.</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Supplier comparison module placeholder. Detailed benchmarking will be added in a future iteration.
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-2 items-stretch">
              <Card className="h-full">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-primary/80" />
                    Recommended action
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <p>
                    {latestOutput?.final_output?.recommendation?.status
                      ? `Recommended outcome: ${latestOutput.final_output.recommendation.status}.`
                      : "Recommended outcome: request clarification before approval."}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">Request clarification</Button>
                    <Button size="sm">Escalate</Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="h-full">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <History className="h-4 w-4 text-primary/80" />
                    Similar past decisions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {similarPast.length > 0 ? (
                    similarPast.map((item) => (
                      <div key={item.request_id} className="rounded-md border border-border/60 px-3 py-2">
                        <p className="font-medium">{item.request_id}</p>
                        <p className="text-muted-foreground">
                          {item.category_l2 || item.category_l1} • Budget{" "}
                          {item.budget_amount != null ? item.budget_amount.toLocaleString() : "-"}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground">No similar historical requests available.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  )
}

