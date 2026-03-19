"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { AppShell } from "@/components/app-shell"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table2, ArrowLeft, Trash2 } from "lucide-react"

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
    request_interpretation?: {
      category_l1?: string
      category_l2?: string
      quantity?: number | string | null
      budget_amount?: number | string | null
      currency?: string | null
    }
  }
}

export default function OutputsListPage() {
  const router = useRouter()
  const [outputs, setOutputs] = useState<ProcessedOutputRecord[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [deletingOutputId, setDeletingOutputId] = useState<number | null>(null)

  function formatDateTime(iso: string | undefined | null): string {
    if (!iso) return "-"
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString()
  }

  async function fetchOutputs() {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/processed-outputs`)
      if (!res.ok) throw new Error(`Failed to load outputs (${res.status})`)
      const json = (await res.json()) as ProcessedOutputRecord[]
      setOutputs(json)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load outputs")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOutputs()
  }, [])

  const rows = useMemo(() => outputs, [outputs])

  async function handleDelete(outputId: number) {
    setDeletingOutputId(outputId)
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/processed-outputs/${outputId}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error(`Failed to delete output (${res.status})`)
      await fetchOutputs()
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to delete output")
    } finally {
      setDeletingOutputId(null)
    }
  }

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
                      <th className="px-3 py-2 text-left">output_id</th>
                      <th className="px-3 py-2 text-left">request_id</th>
                      <th className="px-3 py-2 text-left">processed_at</th>
                      <th className="px-3 py-2 text-left">recommendation</th>
                      <th className="px-3 py-2 text-left">recommended supplier</th>
                      <th className="px-3 py-2 text-left">category_l1</th>
                      <th className="px-3 py-2 text-left">category_l2</th>
                      <th className="px-3 py-2 text-left">quantity</th>
                      <th className="px-3 py-2 text-left">budget_amount</th>
                      <th className="px-3 py-2 text-left">actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                        <tr
                          key={r.output_id}
                          className="border-t border-border hover:bg-muted/50 cursor-pointer"
                          onClick={() => router.push(`/outputs/${r.output_id}`)}
                        >
                          <td className="px-3 py-2 font-medium">{r.output_id}</td>
                          <td className="px-3 py-2">{r.request_id}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {formatDateTime(r.processed_at)}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant="secondary">
                              {r.final_output?.recommendation?.status ?? "-"}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            {r.final_output?.recommendation?.recommended_supplier ?? "-"}
                          </td>
                          <td className="px-3 py-2">
                            {r.final_output?.request_interpretation?.category_l1 ?? "-"}
                          </td>
                          <td className="px-3 py-2">
                            {r.final_output?.request_interpretation?.category_l2 ?? "-"}
                          </td>
                          <td className="px-3 py-2">
                            {r.final_output?.request_interpretation?.quantity ?? "-"}
                          </td>
                          <td className="px-3 py-2">
                            {r.final_output?.request_interpretation?.budget_amount ?? "-"}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  router.push(`/outputs/${r.output_id}`)
                                }}
                              >
                                View
                              </Button>

                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={(e) => e.stopPropagation()}
                                    disabled={deletingOutputId === r.output_id}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Delete
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete processed output?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will remove `output_id={r.output_id}` from `processed_outputs.json`.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleDelete(r.output_id)
                                      }}
                                      className="gap-2"
                                    >
                                      {deletingOutputId === r.output_id ? "Deleting..." : "Delete"}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </td>
                        </tr>
                      ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={10} className="px-3 py-4 text-center text-muted-foreground">
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

