"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  RequestProcessingWorkspace,
  type HistoricalRequest,
} from "@/components/request-processing-workspace"

const BACKEND_BASE_URL = "http://127.0.0.1:8010"

interface ProcessedOutputRecord {
  output_id: number
  request_id: string
  processed_at: string
  final_output: {
    recommendation?: {
      status?: string
      recommended_supplier?: string
    }
  }
}

export default function RequesterListRequestsPage() {
  const [requestsData, setRequestsData] = useState<HistoricalRequest[]>([])
  const [processedOutputs, setProcessedOutputs] = useState<ProcessedOutputRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [reqRes, outRes] = await Promise.all([
        fetch("/api/requests"),
        fetch(`${BACKEND_BASE_URL}/processed-outputs`),
      ])

      if (!reqRes.ok) throw new Error(`Failed to load requests (${reqRes.status})`)
      if (!outRes.ok) throw new Error(`Failed to load processed outputs (${outRes.status})`)

      const requests = (await reqRes.json()) as HistoricalRequest[]
      const outputs = (await outRes.json()) as ProcessedOutputRecord[]

      setRequestsData(requests)
      setProcessedOutputs(outputs)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load data")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // endpoint returns desc by processed_at; keep first entry per request id.
  const latestProcessedByRequestId = useMemo(() => {
    const map = new Map<string, ProcessedOutputRecord>()
    for (const out of processedOutputs) {
      if (!map.has(out.request_id)) map.set(out.request_id, out)
    }
    return map
  }, [processedOutputs])

  const unprocessedRequests = useMemo(
    () => requestsData.filter((r) => !latestProcessedByRequestId.has(r.request_id)),
    [requestsData, latestProcessedByRequestId]
  )

  const processedRequests = useMemo(
    () => requestsData.filter((r) => latestProcessedByRequestId.has(r.request_id)),
    [requestsData, latestProcessedByRequestId]
  )

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl p-6 lg:p-8 space-y-8">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Requester · List Requests</h2>
          <p className="text-muted-foreground mt-1">
            Overview dashboard for request processing status.
          </p>
        </div>

        {loadError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <div className="space-y-5">
          {/* Requests to process preview */}
          <Card className="border-border/80 bg-card/95">
            <CardHeader className="border-b border-border/60">
              <Link
                href="/requester/list-requests/to-process"
                className="group flex items-start justify-between gap-4 rounded-md p-1 -m-1 hover:bg-muted/30 transition-colors"
              >
                <div>
                  <CardTitle className="text-xl">Requests to process</CardTitle>
                  <CardDescription className="mt-1">
                    Quick processing workspace. Open full page for large-volume work.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {unprocessedRequests.length} request{unprocessedRequests.length === 1 ? "" : "s"}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                </div>
              </Link>
            </CardHeader>
            <CardContent className="pt-4 pb-4">
              {loading ? (
                <div className="text-sm text-muted-foreground">Loading...</div>
              ) : (
                <RequestProcessingWorkspace
                  requests={unprocessedRequests}
                  emptyMessage="No requests left to process."
                  compact
                  flatLayout
                  tableMaxHeightClassName="max-h-[310px]"
                  onProcessed={() => {
                    void loadData()
                  }}
                />
              )}
            </CardContent>
          </Card>

          {/* Processed requests preview */}
          <Card className="border-border/80 bg-card/95">
            <CardHeader className="border-b border-border/60">
              <Link
                href="/requester/list-requests/processed"
                className="group flex items-start justify-between gap-4 rounded-md p-1 -m-1 hover:bg-muted/30 transition-colors"
              >
                <div>
                  <CardTitle className="text-xl">Processed requests</CardTitle>
                  <CardDescription className="mt-1">
                    Processed history preview. Open for full archive list.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">
                    {processedRequests.length} request{processedRequests.length === 1 ? "" : "s"}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                </div>
              </Link>
            </CardHeader>
            <CardContent className="pt-4 pb-4">
              {loading ? (
                <div className="text-sm text-muted-foreground">Loading...</div>
              ) : (
                  <div className="h-[250px] overflow-auto rounded-md">
                    <table className="min-w-full text-xs md:text-sm">
                      <thead className="bg-muted/80 sticky top-0">
                        <tr>
                          <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-foreground/90">Request ID</th>
                          <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-foreground/90">Output ID</th>
                          <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-foreground/90">Processed at</th>
                          <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-foreground/90">Recommendation</th>
                          <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-foreground/90">Category L1</th>
                          <th className="px-2.5 py-1.5 text-left text-xs font-semibold text-foreground/90">Category L2</th>
                          <th className="px-2.5 py-1.5 text-right text-xs font-semibold text-foreground/90">Budget</th>
                        </tr>
                      </thead>
                      <tbody>
                        {processedRequests.map((r, idx) => {
                          const out = latestProcessedByRequestId.get(r.request_id)
                          return (
                            <tr key={r.request_id} className={`border-t border-border/60 ${idx % 2 === 0 ? "bg-card/40" : "bg-muted/10"}`}>
                              <td className="px-2.5 py-1.5 font-medium">{r.request_id}</td>
                              <td className="px-2.5 py-1.5">{out?.output_id ?? "-"}</td>
                              <td className="px-2.5 py-1.5 whitespace-nowrap">{out?.processed_at ?? "-"}</td>
                              <td className="px-2.5 py-1.5">
                                {out?.final_output?.recommendation?.status ?? "-"}
                              </td>
                              <td className="px-2.5 py-1.5">{r.category_l1 ?? "-"}</td>
                              <td className="px-2.5 py-1.5">{r.category_l2 ?? "-"}</td>
                              <td className="px-2.5 py-1.5 text-right">
                                {r.budget_amount != null ? r.budget_amount.toLocaleString() : "-"}
                              </td>
                            </tr>
                          )
                        })}
                        {processedRequests.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-2.5 py-4 text-center text-muted-foreground">
                              No processed requests yet.
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
      </div>
    </AppShell>
  )
}


