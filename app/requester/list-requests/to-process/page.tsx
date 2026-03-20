"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowLeft } from "lucide-react"

import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RequestProcessingWorkspace, type HistoricalRequest } from "@/components/request-processing-workspace"

const BACKEND_BASE_URL = "http://127.0.0.1:8010"

interface ProcessedOutputRecord {
  output_id: number
  request_id: string
  processed_at: string
}

export default function ToProcessFullPage() {
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

  const processedRequestIds = useMemo(() => new Set(processedOutputs.map((o) => o.request_id)), [processedOutputs])
  const unprocessedRequests = useMemo(
    () => requestsData.filter((r) => !processedRequestIds.has(r.request_id)),
    [requestsData, processedRequestIds]
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
              <h2 className="text-2xl font-semibold text-foreground">Requests to process</h2>
              <p className="text-muted-foreground mt-1">
                Full processing workspace for all unprocessed requests.
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
            <CardTitle className="text-base">Processing queue</CardTitle>
            <CardDescription>
              {loading ? "Loading..." : `${unprocessedRequests.length} request(s) available`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RequestProcessingWorkspace
              requests={unprocessedRequests}
              emptyMessage="No requests left to process."
              onProcessed={() => {
                void loadData()
              }}
            />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}

