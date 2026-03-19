"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowLeft, ExternalLink } from "lucide-react"

import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { type HistoricalRequest } from "@/components/request-processing-workspace"

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

export default function ProcessedRequestsFullPage() {
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

  const latestProcessedByRequestId = useMemo(() => {
    const map = new Map<string, ProcessedOutputRecord>()
    for (const out of processedOutputs) {
      if (!map.has(out.request_id)) map.set(out.request_id, out)
    }
    return map
  }, [processedOutputs])

  const processedRequests = useMemo(
    () => requestsData.filter((r) => latestProcessedByRequestId.has(r.request_id)),
    [requestsData, latestProcessedByRequestId]
  )

  return (
    <AppShell>
      <div className="p-8 max-w-full mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/requester/list-requests">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h2 className="text-2xl font-semibold text-foreground">Processed requests</h2>
              <p className="text-muted-foreground mt-1">
                Full history of requests that have already been processed.
              </p>
            </div>
          </div>
        </div>

        {loadError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Processed archive</CardTitle>
            <CardDescription>
              {loading ? "Loading..." : `${processedRequests.length} request(s) processed`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border border-border rounded-md overflow-x-auto">
              <table className="min-w-full text-xs md:text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Request ID</th>
                    <th className="px-3 py-2 text-left">Output ID</th>
                    <th className="px-3 py-2 text-left">Processed at</th>
                    <th className="px-3 py-2 text-left">Recommendation</th>
                    <th className="px-3 py-2 text-left">Category L1</th>
                    <th className="px-3 py-2 text-left">Category L2</th>
                    <th className="px-3 py-2 text-right">Quantity</th>
                    <th className="px-3 py-2 text-right">Budget</th>
                    <th className="px-3 py-2 text-left">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {processedRequests.map((r) => {
                    const out = latestProcessedByRequestId.get(r.request_id)
                    return (
                      <tr key={r.request_id} className="border-t border-border">
                        <td className="px-3 py-2 font-medium">{r.request_id}</td>
                        <td className="px-3 py-2">{out?.output_id ?? "-"}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{out?.processed_at ?? "-"}</td>
                        <td className="px-3 py-2">{out?.final_output?.recommendation?.status ?? "-"}</td>
                        <td className="px-3 py-2">{r.category_l1 ?? "-"}</td>
                        <td className="px-3 py-2">{r.category_l2 ?? "-"}</td>
                        <td className="px-3 py-2 text-right">{r.quantity ?? "-"}</td>
                        <td className="px-3 py-2 text-right">
                          {r.budget_amount != null ? r.budget_amount.toLocaleString() : "-"}
                        </td>
                        <td className="px-3 py-2">
                          {out?.output_id ? (
                            <Button variant="ghost" size="sm" className="gap-2" asChild>
                              <Link href={`/outputs/${out.output_id}`}>
                                <ExternalLink className="h-4 w-4" />
                                View output
                              </Link>
                            </Button>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {processedRequests.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-3 py-4 text-center text-muted-foreground">
                        No processed requests yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}

