import { readFile } from "node:fs/promises"
import path from "node:path"

import type { SupplierDetail, SupplierOverview, SupplierRow } from "@/lib/suppliers-types"

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]

    if (ch === '"') {
      // Escaped quote ("")
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (ch === "," && !inQuotes) {
      out.push(current)
      current = ""
      continue
    }

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

  // Treat policy/conditional restriction notes as restricted for overview filtering.
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
  headers.forEach((h, idx) => {
    rowObj[h] = cols[idx] ?? ""
  })

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

function normalizeCoverage(value: string): string {
  return value.trim().toUpperCase()
}

export async function loadSupplierRows(): Promise<SupplierRow[]> {
  const filePath = path.join(process.cwd(), "backend", "data", "suppliers.csv")
  const raw = await readFile(filePath, "utf-8")
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length <= 1) return []

  const headers = parseCsvLine(lines[0]).map((h) => h.trim())
  const rows = lines.slice(1).map((line) => toSupplierRow(headers, parseCsvLine(line)))
  return rows
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
    const categories = Array.from(
      new Set(group.map((g) => g.category_l2).filter((v) => (v ?? "").trim().length > 0))
    )

    const regions = Array.from(
      new Set(
        group
          .flatMap((g) => (g.service_regions ?? "").split(";"))
          .map(normalizeCoverage)
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b))

    const restricted =
      group.some((g) => g.is_restricted === true)
        ? true
        : group.every((g) => g.is_restricted === false)
          ? false
          : null

    const restrictionReason =
      group.find((g) => (g.restriction_reason ?? "").trim().length > 0)?.restriction_reason ?? ""

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

  const overview = aggregateSuppliers(supplierRows)[0]
  return {
    overview,
    rows: supplierRows,
  }
}

