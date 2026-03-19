"use client"

import { useEffect, useMemo, useState } from "react"
import { Play } from "lucide-react"

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
import { cn } from "@/lib/utils"

const BACKEND_BASE_URL = "http://127.0.0.1:8010"

export interface HistoricalRequest {
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

interface ProcessResultPayload {
  request_id: string
  output_id: number
  result: unknown
}

interface RequestProcessingWorkspaceProps {
  requests: HistoricalRequest[]
  emptyMessage?: string
  onProcessed?: (payload: ProcessResultPayload) => void
  compact?: boolean
  tableMaxHeightClassName?: string
}

function parseRequestIdToNumber(requestId: string): number | null {
  const m = /^REQ-(\d+)$/i.exec(String(requestId || "").trim())
  return m ? parseInt(m[1], 10) : null
}

export function RequestProcessingWorkspace({
  requests,
  emptyMessage = "No requests to process.",
  onProcessed,
  compact = false,
  tableMaxHeightClassName,
}: RequestProcessingWorkspaceProps) {
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [idFilter, setIdFilter] = useState<string>("")
  const [dateFrom, setDateFrom] = useState<string>("")
  const [dateTo, setDateTo] = useState<string>("")
  const [budgetMin, setBudgetMin] = useState<string>("")
  const [budgetMax, setBudgetMax] = useState<string>("")
  const [selectedRequest, setSelectedRequest] = useState<HistoricalRequest | null>(null)
  const [processing, setProcessing] = useState(false)
  const [processError, setProcessError] = useState<string | null>(null)
  const [processResult, setProcessResult] = useState<ProcessResultPayload | null>(null)

  // If the selected item disappears from the list (e.g. moved to processed), clear selection.
  useEffect(() => {
    if (!selectedRequest) return
    const stillExists = requests.some((r) => r.request_id === selectedRequest.request_id)
    if (!stillExists) setSelectedRequest(null)
  }, [requests, selectedRequest])

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
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

      if (dateFrom && (!r.required_by_date || r.required_by_date < dateFrom)) return false
      if (dateTo && (!r.required_by_date || r.required_by_date > dateTo)) return false

      const budget = r.budget_amount ?? 0
      if (budgetMin && budget < Number(budgetMin)) return false
      if (budgetMax && budget > Number(budgetMax)) return false

      return true
    })
  }, [requests, idFilter, categoryFilter, dateFrom, dateTo, budgetMin, budgetMax])

  const handleProcess = async () => {
    if (!selectedRequest) return
    setProcessing(true)
    setProcessError(null)
    setProcessResult(null)
    try {
      const res = await fetch(`${BACKEND_BASE_URL}/process-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: selectedRequest.request_id }),
      })
      if (!res.ok) {
        const text = await res.text()
        let detail = text
        try {
          const json = JSON.parse(text)
          detail = json.detail ?? text
        } catch {
          // keep raw text
        }
        throw new Error(detail || `Request failed (${res.status})`)
      }
      const data = (await res.json()) as ProcessResultPayload
      setProcessResult(data)
      onProcessed?.(data)
    } catch (e) {
      setProcessError(e instanceof Error ? e.message : "Processing failed")
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className={cn("space-y-4", compact && "space-y-3")}>
      <div className="flex items-center justify-between gap-4">
        <div className={cn("text-sm text-muted-foreground", compact && "text-xs")}>
          Select a request row and click Process.
        </div>
        <Button
          onClick={handleProcess}
          disabled={!selectedRequest || processing}
          className="gap-2"
          size={compact ? "sm" : "default"}
        >
          <Play className="h-4 w-4" />
          {processing ? "Processing..." : "Process"}
        </Button>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className={cn(compact && "pb-3")}>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className={cn("space-y-4", compact && "space-y-3")}>
          {processError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {processError}
            </div>
          )}
          {processResult && (
            <div className="rounded-md border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
              Processed successfully. Request: {processResult.request_id}, Output ID:{" "}
              {processResult.output_id}
            </div>
          )}
          <div className={cn("grid grid-cols-1 md:grid-cols-5 gap-4", compact && "gap-3")}>
            <div>
              <label className={cn("block text-sm font-medium text-foreground mb-1", compact && "text-xs mb-0.5")}>
                Search by ID
              </label>
              <Input
                placeholder="e.g. REQ-000001 or 1"
                value={idFilter}
                onChange={(e) => setIdFilter(e.target.value)}
                className={cn("bg-input border-border text-foreground", compact && "h-8 text-xs")}
              />
            </div>
            <div>
              <label className={cn("block text-sm font-medium text-foreground mb-1", compact && "text-xs mb-0.5")}>
                Category
              </label>
              <Select value={categoryFilter ?? undefined} onValueChange={setCategoryFilter}>
                <SelectTrigger className={cn("w-full bg-input border-border text-foreground", compact && "h-8 text-xs")}>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="IT">IT</SelectItem>
                  <SelectItem value="Facilities">Facilities</SelectItem>
                  <SelectItem value="Professional Services">Professional Services</SelectItem>
                  <SelectItem value="Marketing">Marketing</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className={cn("block text-sm font-medium text-foreground mb-1", compact && "text-xs mb-0.5")}>
                Required by from
              </label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className={cn("bg-input border-border text-foreground", compact && "h-8 text-xs")}
              />
            </div>
            <div>
              <label className={cn("block text-sm font-medium text-foreground mb-1", compact && "text-xs mb-0.5")}>
                Required by to
              </label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className={cn("bg-input border-border text-foreground", compact && "h-8 text-xs")}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={cn("block text-sm font-medium text-foreground mb-1", compact && "text-xs mb-0.5")}>
                  Budget min
                </label>
                <Input
                  type="number"
                  value={budgetMin}
                  onChange={(e) => setBudgetMin(e.target.value)}
                  className={cn("bg-input border-border text-foreground", compact && "h-8 text-xs")}
                />
              </div>
              <div>
                <label className={cn("block text-sm font-medium text-foreground mb-1", compact && "text-xs mb-0.5")}>
                  Budget max
                </label>
                <Input
                  type="number"
                  value={budgetMax}
                  onChange={(e) => setBudgetMax(e.target.value)}
                  className={cn("bg-input border-border text-foreground", compact && "h-8 text-xs")}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className={cn("text-sm text-muted-foreground", compact && "text-xs")}>
        Selected:{" "}
        {selectedRequest ? (
          <span className="font-medium text-foreground">{selectedRequest.request_id}</span>
        ) : (
          <span>none</span>
        )}
      </div>

      <div
        className={cn(
          "border border-border rounded-md overflow-x-auto",
          tableMaxHeightClassName ? "overflow-y-auto" : "",
          tableMaxHeightClassName
        )}
      >
        <table className="min-w-full text-xs md:text-sm">
          <thead className="bg-muted sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left w-10"></th>
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
            </tr>
          </thead>
          <tbody>
            {filteredRequests.map((r) => {
              const isSelected = selectedRequest?.request_id === r.request_id
              return (
                <tr
                  key={r.request_id}
                  onClick={() => setSelectedRequest(isSelected ? null : r)}
                  className={cn(
                    "border-t border-border align-top cursor-pointer transition-colors",
                    isSelected ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/50"
                  )}
                >
                  <td className="px-3 py-2">
                    <div
                      className={cn(
                        "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                        isSelected ? "border-primary bg-primary" : "border-muted-foreground/40"
                      )}
                    >
                      {isSelected && <div className="w-2 h-2 rounded-full bg-primary-foreground" />}
                    </div>
                  </td>
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
                  <td className="px-3 py-2 text-right">{r.quantity != null ? r.quantity : "-"}</td>
                  <td className="px-3 py-2">{r.unit_of_measure ?? "-"}</td>
                  <td className="px-3 py-2">{r.required_by_date ?? "-"}</td>
                  <td className="px-3 py-2">{r.preferred_supplier_mentioned ?? "-"}</td>
                  <td className="px-3 py-2">
                    {r.delivery_countries?.length ? r.delivery_countries.join(", ") : "-"}
                  </td>
                  <td className="px-3 py-2">{r.data_residency_constraint ? "Yes" : "No"}</td>
                  <td className="px-3 py-2">{r.esg_requirement ? "Yes" : "No"}</td>
                  <td className="px-3 py-2">{r.status}</td>
                </tr>
              )
            })}
            {filteredRequests.length === 0 && (
              <tr>
                <td colSpan={16} className="px-3 py-4 text-center text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

