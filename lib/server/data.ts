import { readFile } from "node:fs/promises"
import path from "node:path"

import type { SupplierDetail, SupplierOverview, SupplierRow } from "@/lib/suppliers-types"

// =============================================================================
// SLUGIFY HELPERS
// =============================================================================

function slugifyDepartment(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "department"
  )
}

function slugifyEscalationTarget(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "target"
  )
}

function buildSlugMap(labels: string[], fallback: string): Map<string, string> {
  const out = new Map<string, string>()
  const baseCount = new Map<string, number>()
  for (const label of labels) {
    const base = fallback === "department" ? slugifyDepartment(label) : slugifyEscalationTarget(label)
    const idx = baseCount.get(base) ?? 0
    baseCount.set(base, idx + 1)
    const slug = idx === 0 ? base : `${base}-${idx + 1}`
    out.set(slug, label)
  }
  return out
}

// =============================================================================
// REQUESTS
// =============================================================================

export interface RequestRecord {
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

export interface DepartmentEntry {
  slug: string
  label: string
  request_count: number
}

function normalizeRequest(raw: Record<string, unknown>): RequestRecord {
  return {
    request_id: String(raw.request_id ?? ""),
    created_at: String(raw.created_at ?? ""),
    business_unit: String(raw.business_unit ?? "").trim(),
    category_l1: String(raw.category_l1 ?? ""),
    category_l2: String(raw.category_l2 ?? ""),
    title: String(raw.title ?? ""),
    request_text: String(raw.request_text ?? ""),
    budget_amount: typeof raw.budget_amount === "number" ? raw.budget_amount : null,
    currency: String(raw.currency ?? ""),
  }
}

export async function loadRequestsData(): Promise<RequestRecord[]> {
  const filePath = path.join(process.cwd(), "backend", "data", "requests.json")
  try {
    const raw = await readFile(filePath, "utf-8")
    const parsed = raw.trim() ? JSON.parse(raw) : null
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray(parsed.requests)
        ? parsed.requests
        : []
    return list
      .filter((item: unknown): item is Record<string, unknown> => !!item && typeof item === "object")
      .map(normalizeRequest)
  } catch {
    return []
  }
}

export function buildDepartmentEntries(requests: RequestRecord[]): DepartmentEntry[] {
  const counts = new Map<string, number>()
  for (const req of requests) {
    const department = req.business_unit.trim()
    if (!department) continue
    counts.set(department, (counts.get(department) ?? 0) + 1)
  }
  const labels = Array.from(counts.keys()).sort((a, b) => a.localeCompare(b))
  const slugMap = buildSlugMap(labels, "department")
  return Array.from(slugMap.entries()).map(([slug, label]) => ({
    slug,
    label,
    request_count: counts.get(label) ?? 0,
  }))
}

export async function getDepartmentBySlug(slug: string): Promise<{
  department: DepartmentEntry | null
  requests: RequestRecord[]
}> {
  const requests = await loadRequestsData()
  const departments = buildDepartmentEntries(requests)
  const department = departments.find((d) => d.slug === slug) ?? null
  if (!department) return { department: null, requests: [] }
  return { department, requests: requests.filter((r) => r.business_unit === department.label) }
}

// =============================================================================
// SUPPLIERS
// =============================================================================

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i += 1 }
      else inQuotes = !inQuotes
      continue
    }
    if (ch === "," && !inQuotes) { out.push(current); current = ""; continue }
    current += ch
  }
  out.push(current)
  return out
}

function parseBool(value: string): boolean | null {
  const v = (value ?? "").trim().toLowerCase()
  if (!v) return null
  if (["true", "1", "y", "yes", "restricted"].includes(v)) return true
  if (["false", "0", "n", "no", "not restricted"].includes(v)) return false
  return null
}

function inferRestrictedStatus(rawValue: string, reason: string): boolean | null {
  const parsed = parseBool(rawValue)
  if (parsed === true) return true
  if (parsed === false && !(reason ?? "").trim()) return false
  const reasonLower = (reason ?? "").trim().toLowerCase()
  if (!reasonLower) return parsed
  const restrictedHints = ["restrict", "conditional", "exception approval", "policy rs-"]
  if (restrictedHints.some((hint) => reasonLower.includes(hint))) return true
  return parsed
}

function parseNum(value: string): number | null {
  const t = (value ?? "").trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function toSupplierRow(headers: string[], cols: string[]): SupplierRow {
  const rowObj: Record<string, string> = {}
  headers.forEach((h, idx) => { rowObj[h] = cols[idx] ?? "" })
  const restrictionReason = rowObj.restriction_reason ?? ""
  return {
    supplier_id: rowObj.supplier_id ?? "",
    supplier_name: rowObj.supplier_name ?? "",
    category_l1: rowObj.category_l1 ?? "",
    category_l2: rowObj.category_l2 ?? "",
    country_hq: rowObj.country_hq ?? "",
    service_regions: rowObj.service_regions ?? "",
    currency: rowObj.currency ?? "",
    pricing_model: rowObj.pricing_model ?? "",
    quality_score: parseNum(rowObj.quality_score),
    risk_score: parseNum(rowObj.risk_score),
    esg_score: parseNum(rowObj.esg_score),
    preferred_supplier: parseBool(rowObj.preferred_supplier),
    is_restricted: inferRestrictedStatus(rowObj.is_restricted, restrictionReason),
    restriction_reason: restrictionReason,
    contract_status: rowObj.contract_status ?? "",
    data_residency_supported: parseBool(rowObj.data_residency_supported),
    capacity_per_month: parseNum(rowObj.capacity_per_month),
    notes: rowObj.notes ?? "",
  }
}

function avg(nums: Array<number | null>): number | null {
  const v = nums.filter((n): n is number => typeof n === "number")
  if (v.length === 0) return null
  return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10
}

export async function loadSupplierRows(): Promise<SupplierRow[]> {
  const filePath = path.join(process.cwd(), "backend", "data", "suppliers.csv")
  const raw = await readFile(filePath, "utf-8")
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length <= 1) return []
  const headers = parseCsvLine(lines[0]).map((h) => h.trim())
  return lines.slice(1).map((line) => toSupplierRow(headers, parseCsvLine(line)))
}

export function aggregateSuppliers(rows: SupplierRow[]): SupplierOverview[] {
  const byId = new Map<string, SupplierRow[]>()
  for (const row of rows) {
    if (!row.supplier_id) continue
    if (!byId.has(row.supplier_id)) byId.set(row.supplier_id, [])
    byId.get(row.supplier_id)!.push(row)
  }
  const out: SupplierOverview[] = []
  for (const [supplierId, group] of byId.entries()) {
    const first = group[0]
    const categories = Array.from(new Set(group.map((g) => g.category_l2).filter((v) => (v ?? "").trim().length > 0)))
    const regions = Array.from(new Set(
      group.flatMap((g) => (g.service_regions ?? "").split(";"))
        .map((v) => v.trim().toUpperCase())
        .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b))
    const restricted = group.some((g) => g.is_restricted === true)
      ? true
      : group.every((g) => g.is_restricted === false) ? false : null
    const restrictionReason = group.find((g) => (g.restriction_reason ?? "").trim().length > 0)?.restriction_reason ?? ""
    out.push({
      supplier_id: supplierId,
      supplier_name: first.supplier_name,
      country_hq: first.country_hq,
      service_regions: regions,
      categories,
      quality_score: avg(group.map((g) => g.quality_score)),
      risk_score: avg(group.map((g) => g.risk_score)),
      esg_score: avg(group.map((g) => g.esg_score)),
      is_restricted: restricted,
      restriction_reason: restrictionReason,
    })
  }
  return out.sort((a, b) => a.supplier_name.localeCompare(b.supplier_name))
}

export function buildSupplierDetail(supplierId: string, rows: SupplierRow[]): SupplierDetail | null {
  const supplierRows = rows.filter((r) => r.supplier_id === supplierId)
  if (supplierRows.length === 0) return null
  return { overview: aggregateSuppliers(supplierRows)[0], rows: supplierRows }
}

// =============================================================================
// ESCALATIONS
// =============================================================================

export interface EscalationTargetItem {
  slug: string
  label: string
  count: number
}

interface ProcessedOutputRecord {
  output_id: number
  request_id: string
  processed_at: string
  final_output?: {
    request_interpretation?: {
      category_l1?: string
      category_l2?: string
      budget_amount?: number | null
      currency?: string
      delivery_country?: string
    }
    escalations?: Array<{
      rule_id?: string
      trigger?: string
      action?: string
      target?: string
      blocking?: boolean
    }>
  }
}

export interface EscalatedRow {
  output_id: number
  request_id: string
  processed_at: string
  target: string
  trigger: string
  blocking: boolean
  category_l1: string
  category_l2: string
  budget_amount: number
  currency: string
  country: string
}

export async function loadProcessedOutputsForEscalations(): Promise<ProcessedOutputRecord[]> {
  const filePath = path.join(process.cwd(), "backend", "data", "processed_outputs.json")
  try {
    const raw = await readFile(filePath, "utf-8")
    const parsed = raw.trim() ? JSON.parse(raw) : null
    const outputs = parsed && typeof parsed === "object" && Array.isArray(parsed.outputs) ? parsed.outputs : []
    return outputs as ProcessedOutputRecord[]
  } catch {
    return []
  }
}

export function extractEscalatedRows(outputs: ProcessedOutputRecord[]): EscalatedRow[] {
  const rows: EscalatedRow[] = []
  for (const output of outputs) {
    const escalations = output.final_output?.escalations ?? []
    if (!Array.isArray(escalations) || escalations.length === 0) continue
    for (const esc of escalations) {
      if ((esc?.action ?? "").toLowerCase() !== "escalate") continue
      const target = (esc?.target ?? "").trim()
      if (!target) continue
      rows.push({
        output_id: output.output_id,
        request_id: output.request_id,
        processed_at: output.processed_at,
        target,
        trigger: esc?.trigger ?? "-",
        blocking: Boolean(esc?.blocking),
        category_l1: output.final_output?.request_interpretation?.category_l1 ?? "-",
        category_l2: output.final_output?.request_interpretation?.category_l2 ?? "-",
        budget_amount: Number(output.final_output?.request_interpretation?.budget_amount ?? 0),
        currency: output.final_output?.request_interpretation?.currency ?? "",
        country: output.final_output?.request_interpretation?.delivery_country ?? "-",
      })
    }
  }
  return rows
}

export function buildEscalationTargetItems(rows: EscalatedRow[]): EscalationTargetItem[] {
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.target, (counts.get(row.target) ?? 0) + 1)
  const labels = Array.from(counts.keys()).sort((a, b) => a.localeCompare(b))
  const slugMap = buildSlugMap(labels, "target")
  return Array.from(slugMap.entries()).map(([slug, label]) => ({
    slug,
    label,
    count: counts.get(label) ?? 0,
  }))
}

export async function getEscalationTargetData(slug: string): Promise<{
  target: EscalationTargetItem | null
  rows: EscalatedRow[]
}> {
  const outputs = await loadProcessedOutputsForEscalations()
  const rows = extractEscalatedRows(outputs)
  const targets = buildEscalationTargetItems(rows)
  const target = targets.find((t) => t.slug === slug) ?? null
  if (!target) return { target: null, rows: [] }
  return {
    target,
    rows: rows.filter((row) => row.target === target.label).sort((a, b) => b.processed_at.localeCompare(a.processed_at)),
  }
}
