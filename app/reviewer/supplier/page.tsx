"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Filter } from "lucide-react"

import { AppShell } from "@/components/app-shell"
import { SupplierScoreBar } from "@/components/supplier-score-bar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { SupplierOverview } from "@/lib/suppliers-types"

function RegionsPreview({ regions }: { regions: string[] }) {
  if (regions.length === 0) {
    return <p className="text-sm text-muted-foreground">No coverage data</p>
  }

  const preview = regions.slice(0, 8)
  const extra = regions.length - preview.length
  return (
    <p className="text-sm text-muted-foreground leading-6">
      {preview.join(" · ")}
      {extra > 0 ? ` · +${extra} more` : ""}
    </p>
  )
}

export default function ReviewerSupplierPage() {
  const [suppliers, setSuppliers] = useState<SupplierOverview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [restrictedFilter, setRestrictedFilter] = useState<"all" | "restricted" | "not_restricted">("all")
  const [selectedCoverage, setSelectedCoverage] = useState<string[]>([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch("/api/suppliers", { cache: "no-store" })
        if (!response.ok) throw new Error("Failed to load suppliers")
        const data: SupplierOverview[] = await response.json()
        setSuppliers(data)
      } catch {
        setError("Unable to load suppliers.")
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const coverageOptions = useMemo(() => {
    return Array.from(
      new Set(
        suppliers
          .flatMap((supplier) => supplier.service_regions)
          .map((region) => region.trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b))
  }, [suppliers])

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((supplier) => {
      if (restrictedFilter === "restricted" && supplier.is_restricted !== true) return false
      if (restrictedFilter === "not_restricted" && supplier.is_restricted !== false) return false

      if (selectedCoverage.length > 0) {
        const normalizedCoverage = new Set(supplier.service_regions.map((r) => r.toUpperCase()))
        const hasCoverage = selectedCoverage.some((area) => normalizedCoverage.has(area.toUpperCase()))
        if (!hasCoverage) return false
      }

      return true
    })
  }, [restrictedFilter, selectedCoverage, suppliers])

  const restrictedCount = useMemo(
    () => suppliers.filter((supplier) => supplier.is_restricted === true).length,
    [suppliers]
  )

  const toggleCoverage = (area: string, checked: boolean) => {
    setSelectedCoverage((prev) => {
      if (checked) return Array.from(new Set([...prev, area]))
      return prev.filter((x) => x !== area)
    })
  }

  return (
    <AppShell>
      <div className="p-6 lg:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reviewer · Supplier</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse supplier profiles with score previews and restriction status.
          </p>
        </div>

        {!loading && !error ? (
          <Card className="border-border/70">
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-[180px]">
                  <Select
                    value={restrictedFilter}
                    onValueChange={(value: "all" | "restricted" | "not_restricted") =>
                      setRestrictedFilter(value)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Restricted status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All suppliers</SelectItem>
                      <SelectItem value="restricted">Restricted only</SelectItem>
                      <SelectItem value="not_restricted">Not restricted only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="min-w-[220px] justify-between">
                      <span className="inline-flex items-center gap-2">
                        <Filter className="h-4 w-4" />
                        Shipping coverage
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {selectedCoverage.length === 0 ? "All" : `${selectedCoverage.length} selected`}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-72 max-h-80">
                    <DropdownMenuLabel>Select shipping areas (OR)</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {coverageOptions.map((area) => (
                      <DropdownMenuCheckboxItem
                        key={area}
                        checked={selectedCoverage.includes(area)}
                        onSelect={(event) => event.preventDefault()}
                        onCheckedChange={(checked) => toggleCoverage(area, checked === true)}
                      >
                        {area}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {selectedCoverage.length > 0 ? (
                  <Button variant="ghost" size="sm" onClick={() => setSelectedCoverage([])}>
                    Clear coverage
                  </Button>
                ) : null}

                <div className="ml-auto text-sm text-muted-foreground">
                  {filteredSuppliers.length} suppliers
                  <span className="mx-1">·</span>
                  {restrictedCount} restricted in dataset
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {loading ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">Loading suppliers...</CardContent>
          </Card>
        ) : null}

        {!loading && error ? (
          <Card>
            <CardContent className="py-8 text-sm text-destructive">{error}</CardContent>
          </Card>
        ) : null}

        {!loading && !error ? (
          filteredSuppliers.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">
                No suppliers match the current filters.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredSuppliers.map((supplier) => (
                <Link key={supplier.supplier_id} href={`/reviewer/supplier/${supplier.supplier_id}`}>
                  <Card className="h-full border-border/70 bg-card/80 transition-colors hover:border-primary/40 hover:bg-card">
                    <CardHeader className="space-y-3 pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-base leading-tight">{supplier.supplier_name}</CardTitle>
                          <p className="mt-1 text-xs text-muted-foreground">{supplier.supplier_id}</p>
                        </div>
                        <Badge
                          variant={supplier.is_restricted ? "destructive" : "secondary"}
                          className="shrink-0"
                        >
                          {supplier.is_restricted === null
                            ? "Status unknown"
                            : supplier.is_restricted
                              ? "Restricted"
                              : "Not restricted"}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Shipping coverage</p>
                        <RegionsPreview regions={supplier.service_regions} />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                      <SupplierScoreBar label="Quality" value={supplier.quality_score} />
                      <SupplierScoreBar
                        label="Risk"
                        value={supplier.risk_score}
                        indicatorClassName="[&>[data-slot=progress-indicator]]:bg-amber-400/80"
                      />
                      <SupplierScoreBar
                        label="ESG"
                        value={supplier.esg_score}
                        indicatorClassName="[&>[data-slot=progress-indicator]]:bg-cyan-400/80"
                      />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )
        ) : null}
      </div>
    </AppShell>
  )
}

