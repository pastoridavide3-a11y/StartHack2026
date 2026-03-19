"use client"

import { useParams } from "next/navigation"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Table2, ArrowLeft, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"

const BACKEND_BASE_URL = "http://127.0.0.1:8010"

type AnyRecord = Record<string, any>

interface ProcessedOutputRecord {
  output_id: number
  request_id: string
  processed_at: string
  final_output: AnyRecord
}

function asNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

function formatDateTime(iso: string | undefined | null): string {
  if (!iso) return "-"
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString()
}

export default function OutputDetailPage() {
  const params = useParams()
  const outputIdRaw = params?.outputId
  const outputId = useMemo(() => {
    if (!outputIdRaw) return null
    const n = asNumber(outputIdRaw)
    return n
  }, [outputIdRaw])

  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [record, setRecord] = useState<ProcessedOutputRecord | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const [showRestrictedAll, setShowRestrictedAll] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (outputId == null) return
      setLoading(true)
      setLoadError(null)
      setRecord(null)
      try {
        const res = await fetch(`${BACKEND_BASE_URL}/processed-outputs/${outputId}`)
        if (!res.ok) throw new Error(`Failed to load output (${res.status})`)
        const json = (await res.json()) as ProcessedOutputRecord
        if (!cancelled) setRecord(json)
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load output")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [outputId])

  const finalOutput = record?.final_output ?? {}

  const recommendation = finalOutput?.recommendation ?? {}
  const requestInterpretation = finalOutput?.request_interpretation ?? {}
  const validation = finalOutput?.validation ?? {}
  const policyEvaluation = finalOutput?.policy_evaluation ?? {}
  const supplierShortlist = Array.isArray(finalOutput?.supplier_shortlist)
    ? finalOutput.supplier_shortlist
    : []
  const suppliersExcluded = Array.isArray(finalOutput?.suppliers_excluded)
    ? finalOutput.suppliers_excluded
    : []
  const escalations = Array.isArray(finalOutput?.escalations) ? finalOutput.escalations : []
  const auditTrail = finalOutput?.audit_trail ?? {}

  const issuesDetected = Array.isArray(validation?.issues_detected) ? validation.issues_detected : []
  const categoryRulesApplied: AnyRecord[] = Array.isArray(policyEvaluation?.category_rules_applied)
    ? policyEvaluation.category_rules_applied
    : []
  const geographyRulesApplied: AnyRecord[] = Array.isArray(policyEvaluation?.geography_rules_applied)
    ? policyEvaluation.geography_rules_applied
    : []

  const restrictedSuppliersObj: AnyRecord =
    policyEvaluation?.restricted_suppliers && typeof policyEvaluation.restricted_suppliers === "object"
      ? policyEvaluation.restricted_suppliers
      : {}

  const restrictedEntries = useMemo(() => Object.entries(restrictedSuppliersObj), [restrictedSuppliersObj])

  return (
    <AppShell>
      <div className="p-8 max-w-6xl mx-auto">
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
                Processed output detail
              </h2>
              <p className="text-muted-foreground text-sm mt-0.5">
                Business view of the procurement pipeline result.
              </p>
            </div>
          </div>
        </div>

        {loadError && (
          <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {loadError}
          </div>
        )}

        {loading || !record ? (
          <div className="text-muted-foreground text-sm">Loading...</div>
        ) : (
          <div className="space-y-6">
            {/* Header */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-base">Header</CardTitle>
                <CardDescription>Output identifiers and processing timestamp.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Output ID</div>
                    <div className="text-sm font-medium">{record.output_id}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Request ID</div>
                    <div className="text-sm font-medium">{record.request_id}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Processed at</div>
                    <div className="text-sm font-medium">{formatDateTime(record.processed_at)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recommendation */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-base">Recommendation</CardTitle>
                <CardDescription>Final recommendation and its eligibility status.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Status</div>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant="secondary">{recommendation?.status ?? "-"}</Badge>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Recommended supplier</div>
                    <div className="mt-1 text-sm font-medium">
                      {recommendation?.recommended_supplier ?? "-"}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Request summary */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-base">Request summary</CardTitle>
                <CardDescription>Normalized inputs used by the pipeline.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Category L1</div>
                    <div className="text-sm font-medium">{requestInterpretation?.category_l1 ?? "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Category L2</div>
                    <div className="text-sm font-medium">{requestInterpretation?.category_l2 ?? "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Quantity</div>
                    <div className="text-sm font-medium">
                      {requestInterpretation?.quantity ?? "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Budget amount</div>
                    <div className="text-sm font-medium">
                      {requestInterpretation?.budget_amount ?? "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Currency</div>
                    <div className="text-sm font-medium">{requestInterpretation?.currency ?? "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Delivery country</div>
                    <div className="text-sm font-medium">{requestInterpretation?.delivery_country ?? "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Required by date</div>
                    <div className="text-sm font-medium">{requestInterpretation?.required_by_date ?? "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Days until required</div>
                    <div className="text-sm font-medium">{requestInterpretation?.days_until_required ?? "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Preferred supplier stated</div>
                    <div className="text-sm font-medium">{requestInterpretation?.preferred_supplier_stated ?? "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Incumbent supplier</div>
                    <div className="text-sm font-medium">{requestInterpretation?.incumbent_supplier ?? "-"}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Validation */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-base">Validation</CardTitle>
                <CardDescription>Completeness and detected issues.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <div className="text-xs text-muted-foreground">Completeness</div>
                  <div className="mt-1 text-sm font-medium">
                    {validation?.completeness ?? "-"}
                  </div>
                </div>
                <div className="space-y-3">
                  {issuesDetected.length === 0 ? (
                    <div className="text-muted-foreground text-sm">No issues detected.</div>
                  ) : (
                    issuesDetected.map((issue: AnyRecord) => (
                      <div
                        key={issue.issue_id ?? JSON.stringify(issue)}
                        className={cn(
                          "rounded-md border border-border bg-background p-3",
                          issue.severity === "high" ? "border-destructive/40" : "",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium">
                              {issue.issue_id ?? "Issue"}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              Severity: {issue.severity ?? "-"} · Type: {issue.type ?? "-"}
                            </div>
                          </div>
                          <Badge variant="secondary">{issue.severity ?? "info"}</Badge>
                        </div>
                        <div className="mt-2 text-sm text-foreground/90">
                          {issue.description ?? "-"}
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          Action required: {issue.action_required ?? "-"}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Policy evaluation */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-base">Policy evaluation</CardTitle>
                <CardDescription>Which rules applied and who is eligible.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Approval threshold</div>
                    <div className="mt-1 rounded-md border border-border bg-background p-3">
                      <div className="text-sm font-medium">{policyEvaluation?.approval_threshold?.rule_applied ?? "-"}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {policyEvaluation?.approval_threshold?.note ?? ""}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Preferred supplier</div>
                    <div className="mt-1 rounded-md border border-border bg-background p-3">
                      <div className="text-sm font-medium">
                        {policyEvaluation?.preferred_supplier?.supplier ?? "-"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Status: {policyEvaluation?.preferred_supplier?.status ?? "-"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-md border border-border bg-background p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs text-muted-foreground">Restricted suppliers</div>
                      <div className="text-sm font-medium mt-1">
                        {restrictedEntries.length} evaluated
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => setShowRestrictedAll((v) => !v)}
                    >
                      {showRestrictedAll ? (
                        <>
                          <ChevronUp className="h-4 w-4" />
                          Hide
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4" />
                          Show
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="mt-3 space-y-2">
                    {restrictedEntries.slice(showRestrictedAll ? 0 : 6).map(([supplierId, meta]: [string, AnyRecord]) => (
                      <div key={supplierId} className="flex items-center justify-between gap-3 border-b border-border pb-2">
                        <div className="text-sm font-medium">{supplierId}</div>
                        <div className="text-xs text-muted-foreground">
                          {meta?.restricted ? "Restricted" : "Not restricted"}
                          {meta?.note ? ` · ${meta.note}` : ""}
                        </div>
                      </div>
                    ))}
                    {!showRestrictedAll && restrictedEntries.length > 6 && (
                      <div className="text-xs text-muted-foreground pt-1">
                        Showing first 6 entries.
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Category rules applied</div>
                    <div className="mt-1 rounded-md border border-border bg-background p-3 text-sm">
                      <div>{categoryRulesApplied.length} rules</div>
                      <div className="mt-2 space-y-1">
                        {categoryRulesApplied.slice(0, 5).map((r, idx) => (
                          <div key={`${idx}-${String(r?.rule_applied ?? r?.rule_id ?? r?.rule_family ?? idx)}`} className="text-xs text-muted-foreground">
                            {r?.rule_applied ?? r?.rule_id ?? r?.rule_family ?? JSON.stringify(r)}
                          </div>
                        ))}
                        {categoryRulesApplied.length > 5 && (
                          <div className="text-xs text-muted-foreground pt-1">Showing first 5 entries.</div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Geography rules applied</div>
                    <div className="mt-1 rounded-md border border-border bg-background p-3 text-sm">
                      <div>{geographyRulesApplied.length} rules</div>
                      <div className="mt-2 space-y-1">
                        {geographyRulesApplied.slice(0, 5).map((r, idx) => (
                          <div key={`${idx}-${String(r?.rule_applied ?? r?.rule_id ?? r?.rule_family ?? idx)}`} className="text-xs text-muted-foreground">
                            {r?.rule_applied ?? r?.rule_id ?? r?.rule_family ?? JSON.stringify(r)}
                          </div>
                        ))}
                        {geographyRulesApplied.length > 5 && (
                          <div className="text-xs text-muted-foreground pt-1">Showing first 5 entries.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Supplier shortlist */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-base">Shortlisted suppliers</CardTitle>
                <CardDescription>Top-ranked eligible suppliers.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border border-border rounded-md overflow-x-auto">
                  <table className="min-w-full text-xs md:text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-3 py-2 text-left">Rank</th>
                        <th className="px-3 py-2 text-left">Supplier</th>
                        <th className="px-3 py-2 text-left">Supplier ID</th>
                        <th className="px-3 py-2 text-right">Score</th>
                        <th className="px-3 py-2 text-right">Unit price</th>
                        <th className="px-3 py-2 text-right">Quality</th>
                        <th className="px-3 py-2 text-right">Risk</th>
                        <th className="px-3 py-2 text-right">ESG</th>
                        <th className="px-3 py-2 text-left">Award block</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(supplierShortlist as AnyRecord[]).map((s) => (
                        <tr key={String(s.supplier_id ?? s.rank)} className="border-t border-border align-top">
                          <td className="px-3 py-2">{s.rank ?? "-"}</td>
                          <td className="px-3 py-2">{s.supplier_name ?? "-"}</td>
                          <td className="px-3 py-2">{s.supplier_id ?? "-"}</td>
                          <td className="px-3 py-2 text-right">{s.score ?? "-"}</td>
                          <td className="px-3 py-2 text-right">{s.unit_price ?? "-"}</td>
                          <td className="px-3 py-2 text-right">{s.quality_score ?? "-"}</td>
                          <td className="px-3 py-2 text-right">{s.risk_score ?? "-"}</td>
                          <td className="px-3 py-2 text-right">{s.esg_score ?? "-"}</td>
                          <td className="px-3 py-2">{s.award_block ? "Yes" : "No"}</td>
                        </tr>
                      ))}
                      {(supplierShortlist as AnyRecord[]).length === 0 && (
                        <tr>
                          <td colSpan={9} className="px-3 py-4 text-center text-muted-foreground">
                            No shortlist entries.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Suppliers excluded */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-base">Excluded suppliers</CardTitle>
                <CardDescription>Suppliers evaluated but removed from the shortlist.</CardDescription>
              </CardHeader>
              <CardContent>
                {(suppliersExcluded as AnyRecord[]).length === 0 ? (
                  <div className="text-muted-foreground text-sm">No excluded suppliers.</div>
                ) : (
                  <div className="border border-border rounded-md overflow-x-auto">
                    <table className="min-w-full text-xs md:text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-3 py-2 text-left">Supplier ID</th>
                          <th className="px-3 py-2 text-left">Supplier</th>
                          <th className="px-3 py-2 text-left">Reason</th>
                          <th className="px-3 py-2 text-right">Quality</th>
                          <th className="px-3 py-2 text-right">Risk</th>
                          <th className="px-3 py-2 text-right">ESG</th>
                          <th className="px-3 py-2 text-left">Currency</th>
                          <th className="px-3 py-2 text-left">Pricing model</th>
                          <th className="px-3 py-2 text-left">Capacity / month</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(suppliersExcluded as AnyRecord[]).map((ex) => {
                          const supplier =
                            ex?.supplier && typeof ex.supplier === "object" ? (ex.supplier as AnyRecord) : ({} as AnyRecord)
                          const supplierId =
                            supplier?.supplier_id ?? ex?.supplier_id ?? "-"
                          const supplierName =
                            supplier?.supplier_name ?? ex?.supplier_name ?? "-"

                          return (
                            <tr
                              key={`${String(supplierId)}-${String(ex?.reason ?? "")}`}
                              className="border-t border-border align-top"
                            >
                              <td className="px-3 py-2">{supplierId}</td>
                              <td className="px-3 py-2">{supplierName}</td>
                              <td className="px-3 py-2">{ex?.reason ?? "-"}</td>
                              <td className="px-3 py-2 text-right">
                                {supplier?.quality_score ?? ex?.quality_score ?? "-"}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {supplier?.risk_score ?? ex?.risk_score ?? "-"}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {supplier?.esg_score ?? ex?.esg_score ?? "-"}
                              </td>
                              <td className="px-3 py-2">{supplier?.currency ?? ex?.currency ?? "-"}</td>
                              <td className="px-3 py-2">
                                {supplier?.pricing_model ?? ex?.pricing_model ?? "-"}
                              </td>
                              <td className="px-3 py-2">
                                {supplier?.capacity_per_month ?? ex?.capacity_per_month ?? "-"}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Escalations */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-base">Escalations</CardTitle>
                <CardDescription>When approvals must be requested.</CardDescription>
              </CardHeader>
              <CardContent>
                {(escalations as AnyRecord[]).length === 0 ? (
                  <div className="text-muted-foreground text-sm">No escalations.</div>
                ) : (
                  <div className="border border-border rounded-md overflow-x-auto">
                    <table className="min-w-full text-xs md:text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-3 py-2 text-left">Rule ID</th>
                          <th className="px-3 py-2 text-left">Trigger</th>
                          <th className="px-3 py-2 text-left">Action</th>
                          <th className="px-3 py-2 text-left">Target</th>
                          <th className="px-3 py-2 text-left">Blocking</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(escalations as AnyRecord[]).map((e) => (
                          <tr key={String(e.rule_id ?? JSON.stringify(e))} className="border-t border-border">
                            <td className="px-3 py-2">{e.rule_id ?? "-"}</td>
                            <td className="px-3 py-2">{e.trigger ?? "-"}</td>
                            <td className="px-3 py-2">{e.action ?? "-"}</td>
                            <td className="px-3 py-2">{e.target ?? "-"}</td>
                            <td className="px-3 py-2">{e.blocking ? "Yes" : "No"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Audit trail */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-base">Audit trail</CardTitle>
                <CardDescription>Sources and evaluation context.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Policies checked</div>
                    <div className="mt-1 text-sm">
                      {(auditTrail?.policies_checked ?? []).join(", ") || "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Suppliers evaluated</div>
                    <div className="mt-1 text-sm">
                      {(auditTrail?.supplier_ids_evaluated ?? []).join(", ") || "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Pricing tiers applied</div>
                    <div className="mt-1 text-sm">{auditTrail?.pricing_tiers_applied ?? "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Data sources used</div>
                    <div className="mt-1 text-sm">
                      {(auditTrail?.data_sources_used ?? []).join(", ") || "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Historical awards consulted</div>
                    <div className="mt-1 text-sm">{auditTrail?.historical_awards_consulted ?? "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Historical award note</div>
                    <div className="mt-1 text-sm">{auditTrail?.historical_award_note ?? "-"}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Raw JSON toggle */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-base">Raw JSON</CardTitle>
                <CardDescription>Optional full stored JSON for troubleshooting.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-muted-foreground">
                    Show the full stored JSON for this output.
                  </div>
                  <Button variant="outline" onClick={() => setShowRaw((v) => !v)} className="gap-2">
                    {showRaw ? "Hide raw JSON" : "Show raw JSON"}
                  </Button>
                </div>
                {showRaw && (
                  <pre className="mt-4 whitespace-pre-wrap overflow-auto rounded-md border border-border bg-background p-4 text-xs">
                    {JSON.stringify(record.final_output, null, 2)}
                  </pre>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  )
}

