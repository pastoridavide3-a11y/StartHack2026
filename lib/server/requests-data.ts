import { readFile } from "node:fs/promises"
import path from "node:path"

import { slugifyDepartment } from "@/lib/departments"

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
      .filter((item): item is Record<string, unknown> => item && typeof item === "object")
      .map(normalizeRequest)
  } catch {
    return []
  }
}

function buildDepartmentSlugMap(labels: string[]): Map<string, string> {
  const slugToLabel = new Map<string, string>()
  const baseCounts = new Map<string, number>()

  for (const label of labels) {
    const base = slugifyDepartment(label)
    const seen = baseCounts.get(base) ?? 0
    baseCounts.set(base, seen + 1)
    const slug = seen === 0 ? base : `${base}-${seen + 1}`
    slugToLabel.set(slug, label)
  }

  return slugToLabel
}

export function buildDepartmentEntries(requests: RequestRecord[]): DepartmentEntry[] {
  const counts = new Map<string, number>()
  for (const req of requests) {
    const department = req.business_unit.trim()
    if (!department) continue
    counts.set(department, (counts.get(department) ?? 0) + 1)
  }

  const labels = Array.from(counts.keys()).sort((a, b) => a.localeCompare(b))
  const slugMap = buildDepartmentSlugMap(labels)

  const entries: DepartmentEntry[] = []
  for (const [slug, label] of slugMap.entries()) {
    entries.push({
      slug,
      label,
      request_count: counts.get(label) ?? 0,
    })
  }

  return entries
}

export async function getDepartmentBySlug(slug: string): Promise<{
  department: DepartmentEntry | null
  requests: RequestRecord[]
}> {
  const requests = await loadRequestsData()
  const departments = buildDepartmentEntries(requests)
  const department = departments.find((d) => d.slug === slug) ?? null
  if (!department) {
    return { department: null, requests: [] }
  }

  const filtered = requests.filter((r) => r.business_unit === department.label)
  return {
    department,
    requests: filtered,
  }
}

