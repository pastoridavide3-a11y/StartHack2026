"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table2, ArrowLeft } from "lucide-react"

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

export default function OutputsListPage() {
  const router = useRouter()
  const [outputs, setOutputs] = useState<ProcessedOutputRecord[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const res = await fetch(`${BACKEND_BASE_URL}/processed-outputs`)
        if (!res.ok) throw new Error(`Failed to load outputs (${res.status})`)
        const json = (await res.json()) as ProcessedOutputRecord[]
        if (!cancelled) setOutputs(json)
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load outputs")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const rows = useMemo(() => outputs, [outputs])

  return (
    <AppShell>
      <div className="p-8 max-w-full mx-auto">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2">
                <Table2 className="h-6 w-6" />
                Processed outputs
              </h2>
              <p className="text-muted-foreground text-sm mt-0.5">
                Browse all processed request outputs.
              </p>
            </div>
          </div>
        </div>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Outputs</CardTitle>
          </CardHeader>
          <CardContent>
            {loadError && (
              <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {loadError}
              </div>
            )}
            {loading ? (
              <div className="text-muted-foreground text-sm">Loading...</div>
            ) : (
              <div className="border border-border rounded-md overflow-x-auto">
                <table className="min-w-full text-xs md:text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-3 py-2 text-left">Output ID</th>
                      <th className="px-3 py-2 text-left">Request ID</th>
                      <th className="px-3 py-2 text-left">Processed at</th>
                      <th className="px-3 py-2 text-left">Recommendation status</th>
                      <th className="px-3 py-2 text-left">Recommended supplier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows
                      .slice()
                      .sort((a, b) => b.output_id - a.output_id)
                      .map((r) => (
                        <tr
                          key={r.output_id}
                          className="border-t border-border hover:bg-muted/50 cursor-pointer"
                          onClick={() => router.push(`/outputs/${r.output_id}`)}
                        >
                          <td className="px-3 py-2 font-medium">{r.output_id}</td>
                          <td className="px-3 py-2">{r.request_id}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {r.processed_at}
                          </td>
                          <td className="px-3 py-2">
                            {r.final_output?.recommendation?.status ?? "-"}
                          </td>
                          <td className="px-3 py-2">
                            {r.final_output?.recommendation?.recommended_supplier ?? "-"}
                          </td>
                        </tr>
                      ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                          No processed outputs found.
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

