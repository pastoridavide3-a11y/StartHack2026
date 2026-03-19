"use client"

import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ArrowLeft, Table2, Trash2 } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

const BACKEND_BASE_URL = "http://127.0.0.1:8010"

interface HistoricalRequest {
  request_id: string
  created_at: string
  request_channel: string
  request_language: string
  business_unit: string
  country: string
  site: string
  requester_id: string
  requester_role: string
  submitted_for_id: string
  category_l1: string
  category_l2: string
  title: string
  request_text: string
  currency: string
  budget_amount: number | null
  quantity: number | null
  unit_of_measure: string | null
  required_by_date: string | null
  preferred_supplier_mentioned: string | null
  incumbent_supplier: string | null
  contract_type_requested: string | null
  delivery_countries: string[]
  data_residency_constraint: boolean
  esg_requirement: boolean
  status: string
  scenario_tags: string[]
}

function parseRequestIdToNumber(requestId: string): number | null {
  const m = /^REQ-(\d+)$/i.exec(String(requestId || "").trim())
  return m ? parseInt(m[1], 10) : null
}

export default function RequestsListPage() {
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [idFilter, setIdFilter] = useState<string>("")
  const [dateFrom, setDateFrom] = useState<string>("")
  const [dateTo, setDateTo] = useState<string>("")
  const [budgetMin, setBudgetMin] = useState<string>("")
  const [budgetMax, setBudgetMax] = useState<string>("")
  const [requestsData, setRequestsData] = useState<HistoricalRequest[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const loadRequests = useCallback(async () => {
    try {
      setLoadError(null)
      const res = await fetch("/api/requests")
      if (!res.ok) throw new Error(`Failed to load (${res.status})`)
      const json = (await res.json()) as HistoricalRequest[]
      setRequestsData(json)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load requests")
    }
  }, [])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  const filteredRequests = requestsData.filter((r) => {
    if (idFilter.trim()) {
      const search = idFilter.trim()
      const rid = (r.request_id || "").toLowerCase()
      const contains = rid.includes(search.toLowerCase())
      const numId = parseRequestIdToNumber(r.request_id)
      const searchNum = /^\d+$/.test(search) ? parseInt(search, 10) : null
      const numMatch = searchNum !== null && numId === searchNum
      if (!contains && !numMatch) return false
    }
    if (
      categoryFilter &&
      categoryFilter !== "all" &&
      r.category_l1 !== categoryFilter &&
      r.category_l2 !== categoryFilter
    ) {
      return false
    }
    if (dateFrom && (!r.required_by_date || r.required_by_date < dateFrom)) {
      return false
    }
    if (dateTo && (!r.required_by_date || r.required_by_date > dateTo)) {
      return false
    }
    const budget = r.budget_amount ?? 0
    if (budgetMin && budget < Number(budgetMin)) return false
    if (budgetMax && budget > Number(budgetMax)) return false
    return true
  })

  const handleDelete = async (r: HistoricalRequest) => {
    const numId = parseRequestIdToNumber(r.request_id)
    if (numId === null) return
    setDeletingId(r.request_id)
    setDeleteError(null)
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/requests/${numId}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(text || `Delete failed (${res.status})`)
      }
      await loadRequests()
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed")
    } finally {
      setDeletingId(null)
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
                Elenco richieste
              </h2>
              <p className="text-muted-foreground text-sm mt-0.5">
                Filtra e gestisci le richieste salvate.
              </p>
            </div>
          </div>
        </div>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Filtri</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {loadError}
              </div>
            )}
            {deleteError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {deleteError}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Cerca per ID
                </label>
                <Input
                  placeholder="es. REQ-000001 o 1"
                  value={idFilter}
                  onChange={(e) => setIdFilter(e.target.value)}
                  className="bg-input border-border text-foreground"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Categoria</label>
                <Select value={categoryFilter ?? undefined} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full bg-input border-border text-foreground">
                    <SelectValue placeholder="Tutte" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutte</SelectItem>
                    <SelectItem value="IT">IT</SelectItem>
                    <SelectItem value="Facilities">Facilities</SelectItem>
                    <SelectItem value="Professional Services">Professional Services</SelectItem>
                    <SelectItem value="Marketing">Marketing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Required by da
                </label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="bg-input border-border text-foreground"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Required by a
                </label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="bg-input border-border text-foreground"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Budget min</label>
                  <Input
                    type="number"
                    value={budgetMin}
                    onChange={(e) => setBudgetMin(e.target.value)}
                    className="bg-input border-border text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Budget max</label>
                  <Input
                    type="number"
                    value={budgetMax}
                    onChange={(e) => setBudgetMax(e.target.value)}
                    className="bg-input border-border text-foreground"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 border border-border rounded-md overflow-x-auto">
          <table className="min-w-full text-xs md:text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-3 py-2 text-left">Request ID</th>
                <th className="px-3 py-2 text-left">Created</th>
                <th className="px-3 py-2 text-left">Category L1</th>
                <th className="px-3 py-2 text-left">Category L2</th>
                <th className="px-3 py-2 text-left">Request text</th>
                <th className="px-3 py-2 text-left">Currency</th>
                <th className="px-3 py-2 text-right">Budget</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-left">Unit</th>
                <th className="px-3 py-2 text-left">Required by</th>
                <th className="px-3 py-2 text-left">Supplier</th>
                <th className="px-3 py-2 text-left">Countries</th>
                <th className="px-3 py-2 text-left">Residency</th>
                <th className="px-3 py-2 text-left">ESG</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left w-20">Elimina</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map((r) => (
                <tr
                  key={r.request_id}
                  className="border-t border-border hover:bg-muted/50 align-top"
                >
                  <td className="px-3 py-2 font-medium">{r.request_id}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.created_at}</td>
                  <td className="px-3 py-2">{r.category_l1}</td>
                  <td className="px-3 py-2">{r.category_l2}</td>
                  <td className="px-3 py-2 max-w-xs truncate" title={r.request_text}>
                    {r.request_text}
                  </td>
                  <td className="px-3 py-2">{r.currency}</td>
                  <td className="px-3 py-2 text-right">
                    {r.budget_amount != null ? r.budget_amount.toLocaleString() : "-"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.quantity != null ? r.quantity : "-"}
                  </td>
                  <td className="px-3 py-2">{r.unit_of_measure ?? "-"}</td>
                  <td className="px-3 py-2">{r.required_by_date ?? "-"}</td>
                  <td className="px-3 py-2">{r.preferred_supplier_mentioned ?? "-"}</td>
                  <td className="px-3 py-2">
                    {r.delivery_countries?.length ? r.delivery_countries.join(", ") : "-"}
                  </td>
                  <td className="px-3 py-2">{r.data_residency_constraint ? "Yes" : "No"}</td>
                  <td className="px-3 py-2">{r.esg_requirement ? "Yes" : "No"}</td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(r)}
                      disabled={deletingId === r.request_id}
                      title="Elimina"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filteredRequests.length === 0 && (
                <tr>
                  <td colSpan={16} className="px-3 py-4 text-center text-muted-foreground">
                    Nessuna richiesta trovata.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  )
}
