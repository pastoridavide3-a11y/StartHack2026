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

interface RequestProcessingWorkspaceProps {
  requests: HistoricalRequest[]
  emptyMessage?: string
  onProcessed?: () => void
  compact?: boolean
  tableMaxHeightClassName?: string
  flatLayout?: boolean
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
  flatLayout = false,
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
  const [processResultMessage, setProcessResultMessage] = useState<string | null>(null)

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
    setProcessResultMessage(null)

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
      const data = (await res.json()) as { request_id: string; output_id: number }
      setProcessResultMessage(`Processed successfully. Request: ${data.request_id}, Output ID: ${data.output_id}`)
      onProcessed?.()
    } catch (e) {
      setProcessError(e instanceof Error ? e.message : "Processing failed")
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className={cn("space-y-4", compact && "space-y-2.5")}>
      {flatLayout ? (
        <div className={cn("space-y-2.5", compact && "space-y-2")}>
          <div className="flex flex-row items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">Filters</h3>
            <Button
              onClick={handleProcess}
              disabled={!selectedRequest || processing}
              className={cn("gap-2", compact && "h-8 px-3 text-xs")}
              size={compact ? "sm" : "default"}
            >
              <Play className="h-4 w-4" />
              {processing ? "Processing..." : "Process"}
            </Button>
          </div>
          <div className={cn("space-y-3", compact && "space-y-2")}>
            {processError && (
              <div
                className={cn(
                  "rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive",
                  compact && "px-3 py-2 text-xs"
                )}
              >
                {processError}
              </div>
            )}
            {processResultMessage && (
              <div
                className={cn(
                  "rounded-md border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400",
                  compact && "px-3 py-2 text-xs"
                )}
              >
                {processResultMessage}
              </div>
            )}
            <div className={cn("grid grid-cols-1 md:grid-cols-5 gap-3", compact && "gap-2")}>
              <div>
                <label className={cn("block text-sm font-medium text-foreground mb-1", compact && "text-[11px] mb-0.5")}>
                  Search by ID
                </label>
                <Input
                  placeholder="e.g. REQ-000001 or 1"
                  value={idFilter}
                  onChange={(e) => setIdFilter(e.target.value)}
                  className={cn("bg-input border-border text-foreground", compact && "h-7 text-xs")}
                />
              </div>
              <div>
                <label className={cn("block text-sm font-medium text-foreground mb-1", compact && "text-[11px] mb-0.5")}>
                  Category
                </label>
                <Select value={categoryFilter ?? undefined} onValueChange={setCategoryFilter}>
                  <SelectTrigger className={cn("w-full bg-input border-border text-foreground", compact && "h-7 text-xs")}>
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
                <label className={cn("block text-sm font-medium text-foreground mb-1", compact && "text-[11px] mb-0.5")}>
                  Required by from
                </label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className={cn("bg-input border-border text-foreground", compact && "h-7 text-xs")}
                />
              </div>
              <div>
                <label className={cn("block text-sm font-medium text-foreground mb-1", compact && "text-[11px] mb-0.5")}>
                  Required by to
                </label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className={cn("bg-input border-border text-foreground", compact && "h-7 text-xs")}
                />
              </div>
              <div className={cn("grid grid-cols-2 gap-2", compact && "gap-1.5")}>
                <div>
                  <label className={cn("block text-sm font-medium text-foreground mb-1", compact && "text-[11px] mb-0.5")}>
                    Budget min
                  </label>
                  <Input
                    type="number"
                    value={budgetMin}
                    onChange={(e) => setBudgetMin(e.target.value)}
                    className={cn("bg-input border-border text-foreground", compact && "h-7 text-xs")}
                  />
                </div>
                <div>
                  <label className={cn("block text-sm font-medium text-foreground mb-1", compact && "text-[11px] mb-0.5")}>
                    Budget max
                  </label>
                  <Input
                    type="number"
                    value={budgetMax}
                    onChange={(e) => setBudgetMax(e.target.value)}
                    className={cn("bg-input border-border text-foreground", compact && "h-7 text-xs")}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <Card className="border-border bg-card">
          <CardHeader
            className={cn(
              "flex flex-row items-center justify-between gap-3",
              compact ? "px-4 py-3 pb-1.5" : "pb-3"
            )}
          >
            <CardTitle className="text-base">Filters</CardTitle>
            <Button
              onClick={handleProcess}
              disabled={!selectedRequest || processing}
              className={cn("gap-2", compact && "h-8 px-3 text-xs")}
              size={compact ? "sm" : "default"}
            >
              <Play className="h-4 w-4" />
              {processing ? "Processing..." : "Process"}
            </Button>
          </CardHeader>
          <CardContent className={cn("space-y-3", compact && "px-4 pt-1.5 pb-3 space-y-2")}>
            {processError && (
              <div
                className={cn(
                  "rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive",
                  compact && "px-3 py-2 text-xs"
                )}
              >
                {processError}
              </div>
            )}
            {processResultMessage && (
              <div
                className={cn(
                  "rounded-md border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400",
                  compact && "px-3 py-2 text-xs"
                )}
              >
                {processResultMessage}
              </div>
            )}
            <div className={cn("grid grid-cols-1 md:grid-cols-5 gap-3", compact && "gap-2")}>
              <div>
                <label className={cn("block text-sm font-medium text-foreground mb-1", compact && "text-[11px] mb-0.5")}>
                  Search by ID
                </label>
                <Input
                  placeholder="e.g. REQ-000001 or 1"
                  value={idFilter}
                  onChange={(e) => setIdFilter(e.target.value)}
                  className={cn("bg-input border-border text-foreground", compact && "h-7 text-xs")}
                />
              </div>
              <div>
                <label className={cn("block text-sm font-medium text-foreground mb-1", compact && "text-[11px] mb-0.5")}>
                  Category
                </label>
                <Select value={categoryFilter ?? undefined} onValueChange={setCategoryFilter}>
                  <SelectTrigger className={cn("w-full bg-input border-border text-foreground", compact && "h-7 text-xs")}>
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
                <label className={cn("block text-sm font-medium text-foreground mb-1", compact && "text-[11px] mb-0.5")}>
                  Required by from
                </label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className={cn("bg-input border-border text-foreground", compact && "h-7 text-xs")}
                />
              </div>
              <div>
                <label className={cn("block text-sm font-medium text-foreground mb-1", compact && "text-[11px] mb-0.5")}>
                  Required by to
                </label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className={cn("bg-input border-border text-foreground", compact && "h-7 text-xs")}
                />
              </div>
              <div className={cn("grid grid-cols-2 gap-2", compact && "gap-1.5")}>
                <div>
                  <label className={cn("block text-sm font-medium text-foreground mb-1", compact && "text-[11px] mb-0.5")}>
                    Budget min
                  </label>
                  <Input
                    type="number"
                    value={budgetMin}
                    onChange={(e) => setBudgetMin(e.target.value)}
                    className={cn("bg-input border-border text-foreground", compact && "h-7 text-xs")}
                  />
                </div>
                <div>
                  <label className={cn("block text-sm font-medium text-foreground mb-1", compact && "text-[11px] mb-0.5")}>
                    Budget max
                  </label>
                  <Input
                    type="number"
                    value={budgetMax}
                    onChange={(e) => setBudgetMax(e.target.value)}
                    className={cn("bg-input border-border text-foreground", compact && "h-7 text-xs")}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className={cn("text-sm text-muted-foreground", compact && "text-[11px]")}>
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
        <table className={cn("min-w-full text-xs md:text-sm", compact && "text-[11px] md:text-xs")}>
          <thead className="bg-muted sticky top-0">
            <tr>
              <th className={cn("px-3 py-2 text-left w-10", compact && "px-2 py-1.5 w-8")}></th>
              <th className={cn("px-3 py-2 text-left", compact && "px-2 py-1.5")}>Request ID</th>
              <th className={cn("px-3 py-2 text-left", compact && "px-2 py-1.5")}>Created</th>
              <th className={cn("px-3 py-2 text-left", compact && "px-2 py-1.5")}>Category L1</th>
              <th className={cn("px-3 py-2 text-left", compact && "px-2 py-1.5")}>Category L2</th>
              <th className={cn("px-3 py-2 text-left", compact && "px-2 py-1.5")}>Request text</th>
              <th className={cn("px-3 py-2 text-left", compact && "px-2 py-1.5")}>Currency</th>
              <th className={cn("px-3 py-2 text-right", compact && "px-2 py-1.5")}>Budget</th>
              <th className={cn("px-3 py-2 text-right", compact && "px-2 py-1.5")}>Qty</th>
              <th className={cn("px-3 py-2 text-left", compact && "px-2 py-1.5")}>Unit</th>
              <th className={cn("px-3 py-2 text-left", compact && "px-2 py-1.5")}>Required by</th>
              <th className={cn("px-3 py-2 text-left", compact && "px-2 py-1.5")}>Supplier</th>
              <th className={cn("px-3 py-2 text-left", compact && "px-2 py-1.5")}>Countries</th>
              <th className={cn("px-3 py-2 text-left", compact && "px-2 py-1.5")}>Residency</th>
              <th className={cn("px-3 py-2 text-left", compact && "px-2 py-1.5")}>ESG</th>
              <th className={cn("px-3 py-2 text-left", compact && "px-2 py-1.5")}>Status</th>
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
                  <td className={cn("px-3 py-2", compact && "px-2 py-1.5")}>
                    <div
                      className={cn(
                        "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                        compact && "w-3.5 h-3.5 border",
                        isSelected ? "border-primary bg-primary" : "border-muted-foreground/40"
                      )}
                    >
                      {isSelected && <div className={cn("w-2 h-2 rounded-full bg-primary-foreground", compact && "w-1.5 h-1.5")} />}
                    </div>
                  </td>
                  <td className={cn("px-3 py-2 font-medium", compact && "px-2 py-1.5")}>{r.request_id}</td>
                  <td className={cn("px-3 py-2 whitespace-nowrap", compact && "px-2 py-1.5")}>{r.created_at}</td>
                  <td className={cn("px-3 py-2", compact && "px-2 py-1.5")}>{r.category_l1}</td>
                  <td className={cn("px-3 py-2", compact && "px-2 py-1.5")}>{r.category_l2}</td>
                  <td className={cn("px-3 py-2 max-w-xs truncate", compact && "px-2 py-1.5 max-w-[12rem]")} title={r.request_text}>
                    {r.request_text}
                  </td>
                  <td className={cn("px-3 py-2", compact && "px-2 py-1.5")}>{r.currency}</td>
                  <td className={cn("px-3 py-2 text-right", compact && "px-2 py-1.5")}>
                    {r.budget_amount != null ? r.budget_amount.toLocaleString() : "-"}
                  </td>
                  <td className={cn("px-3 py-2 text-right", compact && "px-2 py-1.5")}>{r.quantity != null ? r.quantity : "-"}</td>
                  <td className={cn("px-3 py-2", compact && "px-2 py-1.5")}>{r.unit_of_measure ?? "-"}</td>
                  <td className={cn("px-3 py-2", compact && "px-2 py-1.5")}>{r.required_by_date ?? "-"}</td>
                  <td className={cn("px-3 py-2", compact && "px-2 py-1.5")}>{r.preferred_supplier_mentioned ?? "-"}</td>
                  <td className={cn("px-3 py-2", compact && "px-2 py-1.5")}>
                    {r.delivery_countries?.length ? r.delivery_countries.join(", ") : "-"}
                  </td>
                  <td className={cn("px-3 py-2", compact && "px-2 py-1.5")}>{r.data_residency_constraint ? "Yes" : "No"}</td>
                  <td className={cn("px-3 py-2", compact && "px-2 py-1.5")}>{r.esg_requirement ? "Yes" : "No"}</td>
                  <td className={cn("px-3 py-2", compact && "px-2 py-1.5")}>{r.status}</td>
                </tr>
              )
            })}
            {filteredRequests.length === 0 && (
              <tr>
                <td colSpan={16} className={cn("px-3 py-4 text-center text-muted-foreground", compact && "py-3 text-xs")}>
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

