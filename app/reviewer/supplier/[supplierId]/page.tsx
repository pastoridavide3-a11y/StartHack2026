"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { ArrowLeft } from "lucide-react"

import { AppShell } from "@/components/app-shell"
import { SupplierScoreBar } from "@/components/supplier-score-bar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { SupplierDetail } from "@/lib/suppliers-types"

function valueOrFallback(value: string | number | null | undefined, fallback = "N/A") {
  if (value === null || value === undefined) return fallback
  if (typeof value === "string" && value.trim().length === 0) return fallback
  return String(value)
}

function boolLabel(value: boolean | null | undefined) {
  if (value === null || value === undefined) return "Unknown"
  return value ? "Yes" : "No"
}

export default function SupplierDetailPage() {
  const params = useParams<{ supplierId: string }>()
  const supplierId = params?.supplierId

  const [detail, setDetail] = useState<SupplierDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supplierId) return

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/suppliers/${supplierId}`, { cache: "no-store" })
        if (!response.ok) throw new Error("Supplier not found")
        const data: SupplierDetail = await response.json()
        setDetail(data)
      } catch {
        setError("Unable to load supplier detail.")
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [supplierId])

  const uniqueCurrencies = useMemo(() => {
    if (!detail) return []
    return Array.from(new Set(detail.rows.map((r) => r.currency).filter(Boolean)))
  }, [detail])

  const uniquePricing = useMemo(() => {
    if (!detail) return []
    return Array.from(new Set(detail.rows.map((r) => r.pricing_model).filter(Boolean)))
  }, [detail])

  return (
    <AppShell>
      <div className="p-6 lg:p-8 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Supplier profile</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Detailed supplier view with coverage, rankings, compliance, and metadata.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/reviewer/supplier" className="inline-flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to suppliers
            </Link>
          </Button>
        </div>

        {loading ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">Loading supplier detail...</CardContent>
          </Card>
        ) : null}

        {!loading && error ? (
          <Card>
            <CardContent className="py-8 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : null}

        {!loading && !error && detail ? (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">General information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Supplier ID</span>
                    <span className="font-medium">{detail.overview.supplier_id}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Supplier name</span>
                    <span className="font-medium text-right">{detail.overview.supplier_name}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Headquarters</span>
                    <span>{valueOrFallback(detail.overview.country_hq)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Categories covered</span>
                    <span>{detail.overview.categories.length}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Coverage / shipping</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {detail.overview.service_regions.length > 0 ? (
                      detail.overview.service_regions.map((region) => (
                        <Badge key={region} variant="outline" className="text-xs">
                          {region}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">No shipping coverage specified.</span>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Rankings and evaluations</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <SupplierScoreBar label="Quality" value={detail.overview.quality_score} />
                  <SupplierScoreBar
                    label="Risk"
                    value={detail.overview.risk_score}
                    indicatorClassName="[&>[data-slot=progress-indicator]]:bg-amber-400/80"
                  />
                  <SupplierScoreBar
                    label="ESG"
                    value={detail.overview.esg_score}
                    indicatorClassName="[&>[data-slot=progress-indicator]]:bg-cyan-400/80"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Compliance / restrictions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Restricted</span>
                    <Badge variant={detail.overview.is_restricted ? "destructive" : "secondary"}>
                      {detail.overview.is_restricted === null
                        ? "Unknown"
                        : detail.overview.is_restricted
                          ? "Restricted"
                          : "Not restricted"}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Restriction reason</p>
                    <p>{valueOrFallback(detail.overview.restriction_reason, "No specific reason provided.")}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Other metadata</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 text-sm">
                <div className="space-y-1">
                  <p className="text-muted-foreground">Currencies</p>
                  <p>{uniqueCurrencies.length > 0 ? uniqueCurrencies.join(", ") : "N/A"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Pricing models</p>
                  <p>{uniquePricing.length > 0 ? uniquePricing.join(", ") : "N/A"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Capabilities rows</p>
                  <p>{detail.rows.length}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Data residency support</p>
                  <p>
                    {detail.rows.some((r) => r.data_residency_supported === true)
                      ? "Available in some offerings"
                      : "Not declared"}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Capabilities by offering</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[1420px] text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-2 py-2">Category L1</th>
                      <th className="px-2 py-2">Category L2</th>
                      <th className="px-2 py-2">Pricing</th>
                      <th className="px-2 py-2">Currency</th>
                      <th className="px-2 py-2">Ship-to regions</th>
                      <th className="px-2 py-2">Quality</th>
                      <th className="px-2 py-2">Risk</th>
                      <th className="px-2 py-2">ESG</th>
                      <th className="px-2 py-2">Preferred</th>
                      <th className="px-2 py-2">Restricted</th>
                      <th className="px-2 py-2">Contract</th>
                      <th className="px-2 py-2">Restriction reason</th>
                      <th className="px-2 py-2">Data residency</th>
                      <th className="px-2 py-2">Capacity/month</th>
                      <th className="px-2 py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.rows.map((row, idx) => (
                      <tr key={`${row.supplier_id}-${row.category_l2}-${idx}`} className="border-b border-border/40">
                        <td className="px-2 py-2">{valueOrFallback(row.category_l1)}</td>
                        <td className="px-2 py-2">{valueOrFallback(row.category_l2)}</td>
                        <td className="px-2 py-2">{valueOrFallback(row.pricing_model)}</td>
                        <td className="px-2 py-2">{valueOrFallback(row.currency)}</td>
                        <td className="px-2 py-2">{valueOrFallback(row.service_regions)}</td>
                        <td className="px-2 py-2">{valueOrFallback(row.quality_score)}</td>
                        <td className="px-2 py-2">{valueOrFallback(row.risk_score)}</td>
                        <td className="px-2 py-2">{valueOrFallback(row.esg_score)}</td>
                        <td className="px-2 py-2">{boolLabel(row.preferred_supplier)}</td>
                        <td className="px-2 py-2">{boolLabel(row.is_restricted)}</td>
                        <td className="px-2 py-2">{valueOrFallback(row.contract_status)}</td>
                        <td className="px-2 py-2">{valueOrFallback(row.restriction_reason, "-")}</td>
                        <td className="px-2 py-2">{boolLabel(row.data_residency_supported)}</td>
                        <td className="px-2 py-2">{valueOrFallback(row.capacity_per_month)}</td>
                        <td className="px-2 py-2">{valueOrFallback(row.notes, "-")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </AppShell>
  )
}

