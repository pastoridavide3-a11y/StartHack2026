"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"

import { AppShell } from "@/components/app-shell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

type Metric = "count" | "budget"

interface DepartmentRequest {
  request_id: string
  created_at: string
  business_unit: string
  category_l1: string
  category_l2: string
  title: string
  request_text: string
  budget_amount: number | null
  currency: string
}

interface DepartmentResponse {
  department: {
    slug: string
    label: string
    request_count: number
  } | null
  requests: DepartmentRequest[]
}

const chartConfig = {
  count: { label: "Requests", color: "#7c8cff" },
  budget: { label: "Budget", color: "#22c55e" },
} satisfies ChartConfig

function monthKey(dateIso: string): string | null {
  if (!dateIso) return null
  const d = new Date(dateIso)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, "0")
  return `${y}-${m}`
}

function formatMonthLabel(month: string): string {
  const [year, rawMonth] = month.split("-")
  const monthIndex = Number(rawMonth) - 1
  const d = new Date(Date.UTC(Number(year), monthIndex, 1))
  return new Intl.DateTimeFormat("en", { month: "short", year: "2-digit", timeZone: "UTC" }).format(d)
}

export default function DepartmentDashboardPage() {
  const params = useParams<{ departmentSlug: string }>()
  const departmentSlug = params?.departmentSlug

  const [metric, setMetric] = useState<Metric>("count")
  const [monthFrom, setMonthFrom] = useState("")
  const [monthTo, setMonthTo] = useState("")
  const [data, setData] = useState<DepartmentResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!departmentSlug) return
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/departments/${departmentSlug}`, { cache: "no-store" })
        if (!response.ok) throw new Error("Department not found")
        const payload = (await response.json()) as DepartmentResponse
        setData(payload)
      } catch {
        setError("Unable to load department dashboard.")
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [departmentSlug])

  const availableMonths = useMemo(() => {
    const months = new Set<string>()
    for (const request of data?.requests ?? []) {
      const key = monthKey(request.created_at)
      if (key) months.add(key)
    }
    return Array.from(months).sort((a, b) => a.localeCompare(b))
  }, [data?.requests])

  useEffect(() => {
    if (availableMonths.length === 0) {
      setMonthFrom("")
      setMonthTo("")
      return
    }
    setMonthFrom((prev) => (prev && availableMonths.includes(prev) ? prev : availableMonths[0]))
    setMonthTo((prev) =>
      prev && availableMonths.includes(prev) ? prev : availableMonths[availableMonths.length - 1]
    )
  }, [availableMonths])

  const filteredRequests = useMemo(() => {
    const requests = data?.requests ?? []
    return requests.filter((request) => {
      const createdMonth = monthKey(request.created_at)
      if (!createdMonth) return false
      if (monthFrom && createdMonth < monthFrom) return false
      if (monthTo && createdMonth > monthTo) return false
      return true
    })
  }, [data?.requests, monthFrom, monthTo])

  const chartData = useMemo(() => {
    const buckets = new Map<string, { count: number; budget: number }>()
    for (const req of filteredRequests) {
      const key = monthKey(req.created_at)
      if (!key) continue
      const prev = buckets.get(key) ?? { count: 0, budget: 0 }
      prev.count += 1
      prev.budget += req.budget_amount ?? 0
      buckets.set(key, prev)
    }

    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, value]) => ({
        month,
        monthLabel: formatMonthLabel(month),
        count: value.count,
        budget: Math.round(value.budget),
      }))
  }, [filteredRequests])

  const requestSummary = useMemo(() => {
    const map = new Map<string, { category_l1: string; category_l2: string; count: number; budget: number }>()
    for (const req of filteredRequests) {
      const key = `${req.category_l1}||${req.category_l2}`
      const prev = map.get(key) ?? {
        category_l1: req.category_l1 || "-",
        category_l2: req.category_l2 || "-",
        count: 0,
        budget: 0,
      }
      prev.count += 1
      prev.budget += req.budget_amount ?? 0
      map.set(key, prev)
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count || b.budget - a.budget)
  }, [filteredRequests])

  const recentRequests = useMemo(() => {
    return [...filteredRequests]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 8)
  }, [filteredRequests])

  return (
    <AppShell>
      <div className="p-6 lg:p-8 space-y-6">
        {loading ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">Loading department data...</CardContent>
          </Card>
        ) : null}

        {!loading && error ? (
          <Card>
            <CardContent className="py-8 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : null}

        {!loading && !error && data?.department ? (
          <>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">{data.department.label}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Department request dashboard with timeline and request-type summary.
              </p>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Request trend</CardTitle>
                <CardDescription>Track monthly volume or requested budget over time.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-3">
                  <div className="w-44">
                    <Select value={metric} onValueChange={(value: Metric) => setMetric(value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Metric" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="count">Number of requests</SelectItem>
                        <SelectItem value="budget">Requested budget</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-44">
                    <Select value={monthFrom} onValueChange={setMonthFrom} disabled={availableMonths.length === 0}>
                      <SelectTrigger>
                        <SelectValue placeholder="From month" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableMonths.map((month) => (
                          <SelectItem key={`from-${month}`} value={month}>
                            {formatMonthLabel(month)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-44">
                    <Select value={monthTo} onValueChange={setMonthTo} disabled={availableMonths.length === 0}>
                      <SelectTrigger>
                        <SelectValue placeholder="To month" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableMonths.map((month) => (
                          <SelectItem key={`to-${month}`} value={month}>
                            {formatMonthLabel(month)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {chartData.length > 0 ? (
                  <ChartContainer config={chartConfig} className="h-[300px] w-full">
                    <BarChart data={chartData}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="monthLabel" tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey={metric} fill={`var(--color-${metric})`} radius={6} />
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <div className="rounded-md border border-border/60 px-4 py-6 text-sm text-muted-foreground">
                    No requests for the selected month range.
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Request / product summary</CardTitle>
                  <CardDescription>Most requested categories for this department.</CardDescription>
                </CardHeader>
                <CardContent className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-2 py-2">Category L1</th>
                        <th className="px-2 py-2">Category L2</th>
                        <th className="px-2 py-2 text-right">Requests</th>
                        <th className="px-2 py-2 text-right">Budget</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requestSummary.map((row) => (
                        <tr key={`${row.category_l1}-${row.category_l2}`} className="border-b border-border/40">
                          <td className="px-2 py-2">{row.category_l1}</td>
                          <td className="px-2 py-2">{row.category_l2}</td>
                          <td className="px-2 py-2 text-right">{row.count}</td>
                          <td className="px-2 py-2 text-right">{row.budget.toLocaleString()}</td>
                        </tr>
                      ))}
                      {requestSummary.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-2 py-3 text-center text-muted-foreground">
                            No request categories available.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Recent requests</CardTitle>
                  <CardDescription>Latest submissions from this department.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {recentRequests.map((request) => (
                    <div
                      key={request.request_id}
                      className="rounded-md border border-border/60 bg-background/40 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">{request.request_id}</p>
                        <p className="text-xs text-muted-foreground">{request.created_at.slice(0, 10)}</p>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                        {request.title || request.request_text}
                      </p>
                    </div>
                  ))}
                  {recentRequests.length === 0 ? (
                    <div className="rounded-md border border-border/60 px-3 py-4 text-sm text-muted-foreground">
                      No requests in the selected period.
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  )
}

