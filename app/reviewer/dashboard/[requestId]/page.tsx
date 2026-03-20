"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { AppShell } from "@/components/app-shell"

const BACKEND_BASE_URL = "http://127.0.0.1:8010"

/* ── Interfaces ───────────────────────────────────────────────────────── */

interface RequestRecord {
  request_id: string
  created_at: string
  title: string
  request_text: string
  category_l1: string
  category_l2: string
  budget_amount: number | null
  currency: string
  quantity: number | null
  unit_of_measure: string
  required_by_date: string | null
  country: string
  site: string
  requester_id: string
  requester_role: string
  delivery_countries: string[]
  data_residency_constraint: boolean
  esg_requirement: boolean
  preferred_supplier_mentioned: string | null
  incumbent_supplier: string | null
  scenario_tags: string[]
  status: string
  business_unit: string
}

interface SupplierShortlist {
  rank: number
  supplier_id: string
  supplier_name: string
  compliance_status: string
  preferred: boolean
  incumbent: boolean
  pricing_tier_applied: string
  unit_price: number | null
  total_price: number | null
  currency: string
  expedited_unit_price: number | null
  standard_lead_time_days: number | null
  expedited_lead_time_days: number | null
  lead_time_feasible: boolean
  quality_score: number
  risk_score: number
  esg_score: number
  savings_vs_budget_pct: number | null
  policies_violated: string[]
  award_block_reasons: string[]
  escalation_required: boolean
  recommendation_note: string
  score_overall: number | null
}

interface SupplierExcluded {
  supplier_id: string
  supplier_name: string
  reason: string
  rules_checked: string[]
  quality_score: number
  risk_score: number
  esg_score: number
}

interface ValidationIssue {
  issue_id: string
  severity: string
  type: string
  description: string
  action_required: string
}

interface Escalation {
  escalation_id?: string
  rule_id?: string
  trigger: string
  action?: string
  target?: string
  escalate_to?: string
  blocking?: boolean
  severity?: string
  reason_text?: string
}

interface ApprovalThreshold {
  rule_applied: string
  actual_contract_value: number | null
  quotes_required: number
  approvers: string[]
  deviation_approval: string
  conflict_detected: boolean
  note?: string | null
}

interface PolicyEvaluation {
  approval_threshold: ApprovalThreshold
  preferred_supplier?: Record<string, unknown>
  restricted_suppliers_evaluated?: Record<string, unknown>
  category_rules_applied: Array<{ rule_id: string; rule_type: string; rule_text: string; triggered: boolean }>
  geography_rules_applied: Array<{ rule_id: string; rule_type: string; rule_text: string; triggered: boolean; matching_countries?: string[] }>
}

interface AuditTrail {
  policies_checked: string[]
  supplier_ids_evaluated: string[]
  pricing_tiers_applied: string | string[]
  data_sources_used: string[]
  historical_awards_consulted: boolean
  historical_award_note: string
}

interface FinalOutput {
  request_id: string
  overall_status: string
  input_confidence: number | null
  recommendation: { status: string; recommended_supplier: string | null } | null
  request_interpretation: Record<string, unknown> | null
  intake_issues: unknown[]
  validation: { completeness: string; issues_detected: ValidationIssue[] } | null
  supplier_shortlist: SupplierShortlist[]
  suppliers_excluded: SupplierExcluded[]
  escalations: Escalation[]
  policy_evaluation: PolicyEvaluation
  audit_trail: AuditTrail
}

interface ProcessedOutputRecord {
  output_id: number
  request_id: string
  processed_at: string
  final_output?: FinalOutput
}

/* ── Constants ────────────────────────────────────────────────────────── */

type Tab = "overview" | "suppliers" | "rules" | "audit"

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "suppliers", label: "Suppliers" },
  { key: "rules", label: "Rules & Compliance" },
  { key: "audit", label: "Audit Trail" },
]

const TAG_COLORS: Record<string, string> = {
  standard: "bg-slate-700 text-slate-300",
  threshold: "bg-purple-900/60 text-purple-300",
  restricted: "bg-red-900/60 text-red-300",
  lead_time: "bg-amber-900/60 text-amber-300",
  capacity: "bg-cyan-900/60 text-cyan-300",
  multilingual: "bg-indigo-900/60 text-indigo-300",
  multi_country: "bg-teal-900/60 text-teal-300",
  contradictory: "bg-orange-900/60 text-orange-300",
  missing_info: "bg-rose-900/60 text-rose-300",
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function fmt(amount: number | null | undefined, currency = "EUR"): string {
  if (amount == null) return "--"
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString()}`
  }
}

function fmtPrecise(amount: number | null | undefined, currency = "EUR"): string {
  if (amount == null) return "--"
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString()}`
  }
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "--"
  try {
    return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
  } catch {
    return d
  }
}

function severityColor(s: string) {
  if (s === "critical" || s === "high") return "bg-red-500/15 text-red-300 ring-red-500/30"
  if (s === "medium") return "bg-amber-500/15 text-amber-300 ring-amber-500/30"
  return "bg-slate-700 text-slate-300 ring-white/10"
}

function complianceColor(s: string) {
  if (s === "compliant") return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
  if (s === "quasi_compliant") return "bg-amber-500/15 text-amber-300 ring-amber-500/30"
  return "bg-red-500/15 text-red-300 ring-red-500/30"
}

/* ── Reusable Sub-Components ──────────────────────────────────────────── */

function SectionCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl bg-[#23242f] border border-white/5 overflow-hidden ${className}`}>
      <div className="px-5 py-3.5 border-b border-white/5">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-0.5">{label}</dt>
      <dd className={`text-sm text-gray-200 ${mono ? "font-mono" : ""}`}>
        {value || <span className="text-gray-600">--</span>}
      </dd>
    </div>
  )
}

function DetailRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between items-start py-2.5 border-b border-white/[0.03] last:border-0">
      <span className="text-xs text-slate-400 shrink-0 mr-4">{label}</span>
      <span className={`text-xs text-right ${mono ? "font-mono text-slate-300" : "text-white"}`}>
        {value ?? <span className="text-slate-600">--</span>}
      </span>
    </div>
  )
}

function ScoreBar({ value, label, max = 100 }: { value: number | null | undefined; label?: string; max?: number }) {
  const pct = value != null ? Math.min(100, (value / max) * 100) : 0
  const color = pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500"
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-[10px] text-slate-400 w-16 shrink-0">{label}</span>}
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-mono text-slate-300 w-8 text-right shrink-0">
        {value != null ? Number(value).toFixed(0) : "--"}
      </span>
    </div>
  )
}

function Badge({ text, className }: { text: string; className?: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ring-1 ring-inset ${className}`}>
      {text}
    </span>
  )
}

/* ════════════════════════════════════════════════════════════════════════
   TAB 1 — Overview
   ════════════════════════════════════════════════════════════════════════ */

function ConfidenceDisplay({ value }: { value: number | string | null | undefined }) {
  if (value == null) return null
  // Handle string values like "high", "medium", "low"
  if (typeof value === "string") {
    const lower = value.toLowerCase()
    const colorClass =
      lower === "high" ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
      : lower === "medium" ? "bg-amber-500/15 text-amber-300 ring-amber-500/30"
      : "bg-red-500/15 text-red-300 ring-red-500/30"
    const pct = lower === "high" ? 85 : lower === "medium" ? 55 : 25
    return (
      <div className="text-center py-2">
        <Badge text={value} className={`text-sm px-3 py-1 ${colorClass}`} />
        <div className="mt-3">
          <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${lower === "high" ? "bg-emerald-500" : lower === "medium" ? "bg-amber-500" : "bg-red-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    )
  }
  // Numeric value
  const num = Number(value)
  return (
    <div className="text-center py-2">
      <span className={`text-4xl font-bold tabular-nums ${num >= 70 ? "text-emerald-400" : num >= 40 ? "text-amber-400" : "text-red-400"}`}>
        {num}
      </span>
      <span className="text-lg text-slate-500">/100</span>
      <div className="mt-3">
        <ScoreBar value={num} />
      </div>
    </div>
  )
}

function OverviewTab({ req, output }: { req: RequestRecord; output: FinalOutput | undefined }) {
  const interpretation = output?.request_interpretation
  const validationIssues = output?.validation?.issues_detected ?? []
  const confidence = output?.input_confidence
  const topSupplierNote = output?.supplier_shortlist?.[0]?.recommendation_note

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Left Column */}
      <div className="lg:col-span-3 space-y-6">
        <SectionCard title="Request Details">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
            <Field label="Requester ID" value={req.requester_id} mono />
            <Field label="Requester Role" value={req.requester_role} />
            <Field label="Business Unit" value={req.business_unit} />
            <Field label="Category L1" value={req.category_l1} />
            <Field label="Category L2" value={req.category_l2} />
            <Field label="Created" value={formatDate(req.created_at)} />
            <Field label="Required By" value={formatDate(req.required_by_date)} />
            <Field label="Country" value={req.country} />
            <Field label="Site" value={req.site} />
            <Field label="Delivery Countries" value={req.delivery_countries?.join(", ")} />
            <Field label="Preferred Supplier" value={req.preferred_supplier_mentioned} />
            <Field label="Incumbent Supplier" value={req.incumbent_supplier} />
            <Field
              label="Data Residency"
              value={
                req.data_residency_constraint ? (
                  <Badge text="Required" className="bg-amber-500/15 text-amber-300 ring-amber-500/30" />
                ) : (
                  <span className="text-slate-500">Not required</span>
                )
              }
            />
            <Field
              label="ESG Requirement"
              value={
                req.esg_requirement ? (
                  <Badge text="Required" className="bg-blue-500/15 text-blue-300 ring-blue-500/30" />
                ) : (
                  <span className="text-slate-500">Not required</span>
                )
              }
            />
          </div>
        </SectionCard>

        <SectionCard title="Original Request Text">
          <blockquote className="border-l-4 border-indigo-500/50 pl-4 py-3 text-sm text-slate-300 leading-relaxed italic bg-slate-900/50 rounded-r-lg pr-4">
            {req.request_text || <span className="text-slate-500">No request text provided.</span>}
          </blockquote>
        </SectionCard>

        {/* Recommendation */}
        {output?.recommendation && (
          <div className="rounded-xl bg-gradient-to-r from-indigo-600/10 to-emerald-600/10 border border-indigo-500/20 p-5">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
              </svg>
              <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wide">AI Recommendation</span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              <span className="text-white font-medium">Status: </span>
              {output.recommendation.status?.replace(/_/g, " ")}
            </p>
            {output.recommendation.recommended_supplier && (
              <p className="text-sm text-slate-300 mt-1">
                <span className="text-emerald-400 font-medium">Recommended Supplier: </span>
                {output.recommendation.recommended_supplier}
              </p>
            )}
            {topSupplierNote && (
              <p className="text-xs text-slate-400 leading-relaxed mt-3 pt-3 border-t border-white/5">
                {topSupplierNote}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Right Column */}
      <div className="lg:col-span-2 space-y-6">
        {/* Input Confidence */}
        {confidence != null && (
          <SectionCard title="Input Confidence">
            <ConfidenceDisplay value={confidence} />
          </SectionCard>
        )}

        {/* Request Interpretation */}
        {interpretation && Object.keys(interpretation).length > 0 && (
          <SectionCard title="Request Interpretation">
            <div className="space-y-0">
              {Object.entries(interpretation).map(([key, val]) => {
                if (val == null || val === "" || (Array.isArray(val) && val.length === 0)) return null
                const displayVal = Array.isArray(val) ? val.join(", ") : String(val)
                return (
                  <DetailRow
                    key={key}
                    label={key.replace(/_/g, " ")}
                    value={displayVal}
                  />
                )
              })}
            </div>
          </SectionCard>
        )}

        {/* Validation Issues */}
        {validationIssues.length > 0 && (
          <SectionCard title={`Validation Issues (${validationIssues.length})`}>
            <div className="space-y-3">
              {validationIssues.map((issue) => (
                <div key={issue.issue_id} className="flex items-start gap-3 p-3 rounded-lg bg-slate-900/50 border border-white/[0.03]">
                  <Badge text={issue.severity} className={severityColor(issue.severity)} />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-white block">
                      {issue.type.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs text-slate-400 block mt-0.5">{issue.description}</span>
                    {issue.action_required && (
                      <span className="text-[10px] text-slate-500 block mt-0.5 italic">{issue.action_required}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {output && validationIssues.length === 0 && (
          <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 px-5 py-4 flex items-center gap-3">
            <svg className="w-5 h-5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <span className="text-sm text-emerald-300 font-medium">No validation issues detected</span>
          </div>
        )}
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════
   TAB 2 — Suppliers
   ════════════════════════════════════════════════════════════════════════ */

function SuppliersTab({ output, currency }: { output: FinalOutput | undefined; currency: string }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const shortlist = output?.supplier_shortlist ?? []
  const excluded = output?.suppliers_excluded ?? []
  const top = shortlist.length > 0 ? shortlist[0] : null

  if (!output) {
    return (
      <div className="text-center py-16 text-slate-500 text-sm">No supplier data available for this request.</div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top Recommendation Banner */}
      {top && (
        <div className="rounded-xl bg-gradient-to-r from-indigo-600/20 via-indigo-500/10 to-emerald-600/10 border border-indigo-500/30 p-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] text-indigo-300 font-semibold uppercase tracking-wider block">
                Top Recommendation
              </span>
              <h3 className="text-lg font-bold text-white truncate">{top.supplier_name}</h3>
            </div>
            <div className="text-right shrink-0">
              <span className="text-3xl font-bold text-white tabular-nums">
                {top.score_overall != null ? (top.score_overall * 100).toFixed(1) : "--"}
              </span>
              <span className="text-xs text-slate-400 block">Overall Score</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3 ml-14">
            {top.preferred && <Badge text="Preferred" className="bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" />}
            {top.incumbent && <Badge text="Incumbent" className="bg-blue-500/15 text-blue-300 ring-blue-500/30" />}
            <Badge
              text={top.compliance_status.replace(/_/g, " ")}
              className={complianceColor(top.compliance_status)}
            />
          </div>
        </div>
      )}

      {/* Ranked Supplier Table */}
      <div className="rounded-xl bg-[#23242f] border border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-center w-12">#</th>
                <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-left">Supplier</th>
                <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Unit Price</th>
                <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Total Cost</th>
                <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-28">Quality</th>
                <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-28">Risk</th>
                <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-28">ESG</th>
                <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Lead Time</th>
                <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-28">Score</th>
                <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {shortlist.map((s, idx) => {
                const rowBg = idx % 2 === 0 ? "bg-[#1e1f2e]" : "bg-[#252636]"
                const isTop = s.rank === 1
                const isExpanded = expandedId === s.supplier_id
                return (
                  <>
                    <tr
                      key={s.supplier_id}
                      className={`${rowBg} hover:bg-indigo-900/20 transition-colors cursor-pointer border-b border-white/[0.03]`}
                      onClick={() => setExpandedId(isExpanded ? null : s.supplier_id)}
                    >
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${isTop ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400"}`}>
                          {s.rank}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white">{s.supplier_name}</span>
                          {s.preferred && <span className="text-amber-400" title="Preferred">&#9733;</span>}
                          {s.incumbent && <Badge text="Incumbent" className="bg-blue-500/15 text-blue-300 ring-blue-500/30" />}
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">{s.supplier_id}</span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs text-slate-300 whitespace-nowrap">
                        {fmtPrecise(s.unit_price, s.currency || currency)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs text-slate-300 whitespace-nowrap">
                        {fmt(s.total_price, s.currency || currency)}
                      </td>
                      <td className="px-3 py-3"><ScoreBar value={s.quality_score} /></td>
                      <td className="px-3 py-3"><ScoreBar value={s.risk_score} /></td>
                      <td className="px-3 py-3"><ScoreBar value={s.esg_score} /></td>
                      <td className="px-3 py-3 text-right text-xs text-slate-300 tabular-nums whitespace-nowrap">
                        {s.standard_lead_time_days != null ? `${s.standard_lead_time_days}d` : "--"}
                      </td>
                      <td className="px-3 py-3">
                        <ScoreBar value={s.score_overall != null ? s.score_overall * 100 : null} />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Badge
                          text={isTop ? "Recommended" : s.compliance_status.replace(/_/g, " ")}
                          className={isTop ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" : complianceColor(s.compliance_status)}
                        />
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${s.supplier_id}-expanded`} className="bg-slate-900/60">
                        <td colSpan={10} className="px-6 py-5">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Pricing */}
                            <div>
                              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Pricing Details</h4>
                              <div className="space-y-0">
                                {[
                                  { label: "Unit Price", value: fmtPrecise(s.unit_price, s.currency || currency), mono: true },
                                  { label: "Total Price", value: fmt(s.total_price, s.currency || currency), mono: true },
                                  { label: "Expedited Price", value: fmtPrecise(s.expedited_unit_price, s.currency || currency), mono: true },
                                  { label: "Pricing Tier", value: s.pricing_tier_applied },
                                  { label: "Savings vs Budget", value: s.savings_vs_budget_pct != null ? `${s.savings_vs_budget_pct.toFixed(1)}%` : "--" },
                                ].map((row) => (
                                  <div key={row.label} className="flex justify-between py-1.5 border-b border-white/[0.03] last:border-0 text-xs">
                                    <span className="text-slate-400">{row.label}</span>
                                    <span className={`${row.mono ? "font-mono" : ""} text-white`}>{row.value}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Lead Time */}
                            <div>
                              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Lead Time</h4>
                              <div className="space-y-0">
                                {[
                                  { label: "Standard", value: s.standard_lead_time_days != null ? `${s.standard_lead_time_days} days` : "--" },
                                  { label: "Expedited", value: s.expedited_lead_time_days != null ? `${s.expedited_lead_time_days} days` : "--" },
                                  { label: "Feasible", value: s.lead_time_feasible ? "Yes" : "No" },
                                ].map((row) => (
                                  <div key={row.label} className="flex justify-between py-1.5 border-b border-white/[0.03] last:border-0 text-xs">
                                    <span className="text-slate-400">{row.label}</span>
                                    <span className="text-white">{row.value}</span>
                                  </div>
                                ))}
                              </div>

                              {s.award_block_reasons.length > 0 && (
                                <div className="mt-4">
                                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Block Reasons</h4>
                                  <div className="flex flex-wrap gap-1.5">
                                    {s.award_block_reasons.map((r, i) => (
                                      <Badge key={i} text={r.replace(/_/g, " ")} className="bg-red-500/10 text-red-300 ring-red-500/20" />
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Scores */}
                            <div>
                              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Score Breakdown</h4>
                              <div className="space-y-3">
                                <ScoreBar value={s.quality_score} label="Quality" />
                                <ScoreBar value={s.risk_score} label="Risk" />
                                <ScoreBar value={s.esg_score} label="ESG" />
                                <div className="pt-3 mt-3 border-t border-white/5">
                                  <ScoreBar value={s.score_overall != null ? s.score_overall * 100 : null} label="Overall" />
                                </div>
                              </div>
                              {s.recommendation_note && (
                                <p className="mt-4 text-[10px] text-slate-400 leading-relaxed">{s.recommendation_note}</p>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
              {shortlist.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-sm text-gray-500">
                    No supplier matches found for this request.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Excluded Suppliers */}
      {excluded.length > 0 && (
        <SectionCard title={`Excluded Suppliers (${excluded.length})`}>
          <div className="space-y-2">
            {excluded.map((s) => (
              <div key={s.supplier_id} className="flex items-start gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/15">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-white">{s.supplier_name}</span>
                    <span className="text-[10px] font-mono text-slate-500">{s.supplier_id}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-1">
                    <Badge
                      text={s.reason.replace(/_/g, " ")}
                      className="bg-red-500/10 text-red-300 ring-red-500/20"
                    />
                    {s.rules_checked.map((r, i) => (
                      <Badge key={i} text={r} className="bg-slate-700 text-slate-400 ring-white/10" />
                    ))}
                  </div>
                </div>
                <div className="text-right shrink-0 space-y-0.5">
                  <div className="text-[10px] text-slate-500">Q: <span className="text-slate-300">{s.quality_score}</span></div>
                  <div className="text-[10px] text-slate-500">R: <span className="text-slate-300">{s.risk_score}</span></div>
                  <div className="text-[10px] text-slate-500">E: <span className="text-slate-300">{s.esg_score}</span></div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════
   TAB 3 — Rules & Compliance
   ════════════════════════════════════════════════════════════════════════ */

function RulesTab({ output }: { output: FinalOutput | undefined }) {
  if (!output) {
    return <div className="text-center py-16 text-slate-500 text-sm">No policy data available.</div>
  }

  const threshold = output.policy_evaluation?.approval_threshold
  const categoryRules = output.policy_evaluation?.category_rules_applied ?? []
  const geoRules = output.policy_evaluation?.geography_rules_applied ?? []
  const escalations = output.escalations ?? []
  const validationIssues = output.validation?.issues_detected ?? []

  return (
    <div className="space-y-6">
      {/* Approval Threshold */}
      <div className="rounded-xl bg-gradient-to-r from-indigo-600/10 to-purple-600/10 border border-indigo-500/20 p-6">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
          </svg>
          Approval Threshold
        </h3>
        {threshold?.rule_applied == null && threshold?.quotes_required == null ? (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
            <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <p className="text-xs text-amber-300 leading-relaxed">
              Approval threshold could not be determined — required fields (budget, quantity) are missing from this request. Resolve validation issues to calculate the applicable threshold.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Rule Applied</span>
                <span className="text-sm font-bold text-white font-mono">{threshold.rule_applied || "--"}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Quotes Required</span>
                <span className="text-sm font-bold text-white">{threshold?.quotes_required ?? "--"}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Contract Value</span>
                <span className="text-sm font-bold text-white">
                  {threshold?.actual_contract_value != null ? fmt(threshold.actual_contract_value) : "--"}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Deviation Approval</span>
                <span className="text-sm font-bold text-white">{threshold?.deviation_approval || "--"}</span>
              </div>
            </div>
            {((threshold?.approvers?.length ?? 0) > 0 || threshold?.conflict_detected) && (
              <div className="mt-4 flex flex-wrap items-center gap-4">
                {(threshold?.approvers?.length ?? 0) > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">Approvers:</span>
                    {threshold!.approvers.map((a, i) => (
                      <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300 ring-1 ring-inset ring-white/10">
                        {a}
                      </span>
                    ))}
                  </div>
                )}
                {threshold?.conflict_detected && (
                  <Badge text="Conflict Detected" className="bg-red-500/15 text-red-300 ring-red-500/30" />
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Category Rules */}
      {categoryRules.length > 0 && (
        <SectionCard title={`Category Rules (${categoryRules.length})`}>
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider text-left">Rule ID</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider text-left">Type</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider text-left">Description</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider text-center w-28">Status</th>
                </tr>
              </thead>
              <tbody>
                {categoryRules.map((rule, idx) => (
                  <tr key={rule.rule_id} className={`border-b border-white/[0.03] ${idx % 2 === 0 ? "bg-slate-900/30" : ""}`}>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-400">{rule.rule_id}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-300 whitespace-nowrap">{rule.rule_type?.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-300">{rule.rule_text}</td>
                    <td className="px-3 py-2.5 text-center">
                      <Badge
                        text={rule.triggered ? "Triggered" : "OK"}
                        className={rule.triggered ? "bg-amber-500/15 text-amber-300 ring-amber-500/30" : "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Geography Rules */}
      {geoRules.length > 0 && (
        <SectionCard title={`Geography Rules (${geoRules.length})`}>
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider text-left">Rule ID</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider text-left">Type</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider text-left">Description</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider text-left">Countries</th>
                  <th className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider text-center w-28">Status</th>
                </tr>
              </thead>
              <tbody>
                {geoRules.map((rule, idx) => (
                  <tr key={rule.rule_id} className={`border-b border-white/[0.03] ${idx % 2 === 0 ? "bg-slate-900/30" : ""}`}>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-400">{rule.rule_id}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-300 whitespace-nowrap">{rule.rule_type?.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-300">{rule.rule_text}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {(rule.matching_countries ?? []).map((c, i) => (
                          <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-500/15 text-teal-300">
                            {c}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <Badge
                        text={rule.triggered ? "Triggered" : "OK"}
                        className={rule.triggered ? "bg-amber-500/15 text-amber-300 ring-amber-500/30" : "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Escalations */}
      {escalations.length > 0 && (
        <SectionCard title={`Escalation Triggers (${escalations.length})`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {escalations.map((esc, i) => {
              const sev = esc.severity ?? (esc.blocking ? "high" : "medium")
              return (
                <div
                  key={i}
                  className={`p-4 rounded-lg border ${
                    sev === "high" || sev === "critical"
                      ? "bg-red-500/5 border-red-500/20"
                      : sev === "medium"
                        ? "bg-amber-500/5 border-amber-500/20"
                        : "bg-slate-900/50 border-white/5"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-500">{esc.rule_id ?? esc.escalation_id ?? "—"}</span>
                      <span className="text-xs font-semibold text-white">{esc.trigger?.replace(/_/g, " ") ?? ""}</span>
                    </div>
                    {esc.blocking && <Badge text="Blocking" className="bg-red-500/15 text-red-300 ring-red-500/30" />}
                  </div>
                  {esc.reason_text && <p className="text-xs text-slate-400 mb-2">{esc.reason_text}</p>}
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                    </svg>
                    Escalate to: {esc.escalate_to ?? esc.target ?? "—"}
                  </div>
                </div>
              )
            })}
          </div>
        </SectionCard>
      )}

      {/* Compliance Summary */}
      <SectionCard title="Compliance Summary">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { value: categoryRules.filter((r) => r.triggered).length, label: "Category Rules Triggered", total: categoryRules.length },
            { value: geoRules.filter((r) => r.triggered).length, label: "Geo Rules Triggered", total: geoRules.length },
            { value: escalations.length, label: "Escalations" },
            { value: validationIssues.length, label: "Validation Issues" },
          ].map((item) => (
            <div key={item.label} className="text-center p-4 rounded-lg bg-slate-900/50">
              <span className={`text-2xl font-bold block ${item.value > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                {item.value}
              </span>
              {item.total !== undefined && (
                <span className="text-[10px] text-slate-600 block">of {item.total}</span>
              )}
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">{item.label}</span>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════
   TAB 4 — Audit Trail
   ════════════════════════════════════════════════════════════════════════ */

function AuditTab({ output, requestId }: { output: FinalOutput | undefined; requestId: string }) {
  if (!output) {
    return <div className="text-center py-16 text-slate-500 text-sm">No audit data available.</div>
  }

  const trail = output.audit_trail

  function handleDownload() {
    const json = JSON.stringify(output, null, 2)
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${requestId}-audit.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const sections: { label: string; items: string[] | boolean | string | null }[] = [
    { label: "Data Sources Used", items: trail.data_sources_used },
    { label: "Policies Checked", items: trail.policies_checked },
    { label: "Suppliers Evaluated", items: trail.supplier_ids_evaluated },
    {
      label: "Pricing Tiers Applied",
      items: Array.isArray(trail.pricing_tiers_applied)
        ? trail.pricing_tiers_applied
        : trail.pricing_tiers_applied
          ? [trail.pricing_tiers_applied]
          : [],
    },
  ]

  return (
    <div className="space-y-6">
      {/* Audit Info Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {sections.map(({ label, items }) => {
          const list = Array.isArray(items) ? items : []
          return (
            <SectionCard key={label} title={label}>
              {list.length > 0 ? (
                <ul className="space-y-1.5">
                  {list.map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-slate-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400/60 shrink-0" />
                      <span className="font-mono">{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-xs text-slate-500">None</span>
              )}
            </SectionCard>
          )
        })}
      </div>

      {/* Historical Awards */}
      <SectionCard title="Historical Awards">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${trail.historical_awards_consulted ? "bg-emerald-500" : "bg-slate-600"}`} />
          <span className="text-sm text-slate-300">
            {trail.historical_awards_consulted ? "Historical awards data was consulted" : "Historical awards data not consulted"}
          </span>
        </div>
        {trail.historical_award_note && (
          <p className="mt-3 text-xs text-slate-400 leading-relaxed">{trail.historical_award_note}</p>
        )}
      </SectionCard>

      {/* Processing Info */}
      <SectionCard title="Processing Summary">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div className="p-3 rounded-lg bg-slate-900/50">
            <span className="text-2xl font-bold text-indigo-400 block">{trail.supplier_ids_evaluated?.length ?? 0}</span>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Suppliers Evaluated</span>
          </div>
          <div className="p-3 rounded-lg bg-slate-900/50">
            <span className="text-2xl font-bold text-purple-400 block">{trail.policies_checked?.length ?? 0}</span>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Policies Checked</span>
          </div>
          <div className="p-3 rounded-lg bg-slate-900/50">
            <span className="text-2xl font-bold text-teal-400 block">{trail.data_sources_used?.length ?? 0}</span>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Data Sources</span>
          </div>
          <div className="p-3 rounded-lg bg-slate-900/50">
            <span className={`text-2xl font-bold block ${trail.historical_awards_consulted ? "text-emerald-400" : "text-slate-600"}`}>
              {trail.historical_awards_consulted ? "Yes" : "No"}
            </span>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Historical Data</span>
          </div>
        </div>
      </SectionCard>

      {/* Download */}
      <div className="flex justify-end">
        <button
          onClick={handleDownload}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors shadow-lg shadow-indigo-600/20"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Download Full JSON
        </button>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════════════════════ */

export default function ReviewerRequestDetailPage() {
  const params = useParams<{ requestId: string }>()
  const requestId = params?.requestId

  const [requests, setRequests] = useState<RequestRecord[]>([])
  const [outputs, setOutputs] = useState<ProcessedOutputRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>("overview")

  useEffect(() => {
    const load = async () => {
      if (!requestId) return
      setLoading(true)
      setError(null)
      try {
        const [reqRes, outRes] = await Promise.all([
          fetch("/api/requests"),
          fetch(`${BACKEND_BASE_URL}/processed-outputs`),
        ])
        if (!reqRes.ok) throw new Error(`Failed to load requests (${reqRes.status})`)
        if (!outRes.ok) throw new Error(`Failed to load processed outputs (${outRes.status})`)
        setRequests((await reqRes.json()) as RequestRecord[])
        setOutputs((await outRes.json()) as ProcessedOutputRecord[])
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load request details")
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [requestId])

  const request = useMemo(
    () => requests.find((r) => r.request_id === requestId) ?? null,
    [requests, requestId]
  )

  const latestOutput = useMemo(() => {
    const matches = outputs.filter((o) => o.request_id === requestId)
    if (matches.length === 0) return null
    return matches.reduce((best, cur) => (cur.output_id > best.output_id ? cur : best))
  }, [outputs, requestId])

  const finalOutput = latestOutput?.final_output

  if (loading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-7xl p-6 lg:p-8">
          <div className="animate-pulse space-y-6">
            <div className="h-5 bg-slate-800 rounded w-40" />
            <div className="h-10 bg-slate-800 rounded-lg w-[480px]" />
            <div className="grid grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 bg-slate-800 rounded-xl" />
              ))}
            </div>
            <div className="h-10 bg-slate-800 rounded-lg" />
            <div className="h-[400px] bg-slate-800 rounded-xl" />
          </div>
        </div>
      </AppShell>
    )
  }

  if (error) {
    return (
      <AppShell>
        <div className="mx-auto max-w-7xl p-6 lg:p-8">
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            {error}
          </div>
        </div>
      </AppShell>
    )
  }

  if (!request) {
    return (
      <AppShell>
        <div className="mx-auto max-w-7xl p-6 lg:p-8 text-center py-16">
          <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-white mb-2">Request Not Found</h2>
          <p className="text-sm text-slate-400 mb-4">
            No request found for ID: <span className="font-mono text-slate-300">{requestId}</span>
          </p>
          <Link href="/reviewer/dashboard" className="text-sm text-indigo-400 hover:underline">
            Back to Dashboard
          </Link>
        </div>
      </AppShell>
    )
  }

  const overallStatus = finalOutput?.overall_status ?? request.status
  const statusColor =
    overallStatus === "approved" || overallStatus === "submitted"
      ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
      : overallStatus?.includes("cannot") || overallStatus === "rejected"
        ? "bg-red-500/15 text-red-300 ring-red-500/30"
        : "bg-amber-500/15 text-amber-300 ring-amber-500/30"

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl p-6 lg:p-8 space-y-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-slate-500">
          <Link href="/reviewer/dashboard" className="hover:text-indigo-400 transition-colors">
            Dashboard
          </Link>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
          <span className="text-slate-300 font-mono">{request.request_id}</span>
        </nav>

        {/* Header */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1.5">
                <span className="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-md">
                  {request.request_id}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ring-1 ring-inset ${statusColor}`}>
                  {overallStatus?.replace(/_/g, " ") ?? "pending"}
                </span>
              </div>
              <h1 className="text-2xl font-bold text-white leading-tight">
                {request.title || `${request.category_l2 || request.category_l1} Request`}
              </h1>
            </div>
          </div>

          {/* Scenario tags */}
          {request.scenario_tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {request.scenario_tags.map((tag) => (
                <span
                  key={tag}
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${TAG_COLORS[tag] ?? "bg-slate-700 text-slate-300"}`}
                >
                  {tag.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Quick Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Budget", value: fmt(request.budget_amount, request.currency), sub: request.currency },
            { label: "Quantity", value: request.quantity != null ? request.quantity.toLocaleString() : "--", sub: request.unit_of_measure || undefined },
            { label: "Location", value: request.country, sub: request.site },
            { label: "Required By", value: formatDate(request.required_by_date), sub: request.business_unit },
          ].map((metric) => (
            <div key={metric.label} className="rounded-xl bg-[#23242f] border border-white/5 px-4 py-3">
              <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider block mb-1">{metric.label}</span>
              <span className="text-base font-bold text-white block leading-tight">{metric.value}</span>
              {metric.sub && <span className="text-[10px] text-slate-500 block mt-0.5">{metric.sub}</span>}
            </div>
          ))}
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-white/5">
          <nav className="flex gap-0 -mb-px overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === "overview" && <OverviewTab req={request} output={finalOutput} />}
          {activeTab === "suppliers" && <SuppliersTab output={finalOutput} currency={request.currency} />}
          {activeTab === "rules" && <RulesTab output={finalOutput} />}
          {activeTab === "audit" && <AuditTab output={finalOutput} requestId={request.request_id} />}
        </div>
      </div>
    </AppShell>
  )
}
