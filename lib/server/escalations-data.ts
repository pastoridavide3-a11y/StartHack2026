import { readFile } from "node:fs/promises"
import path from "node:path"

import { slugifyEscalationTarget } from "@/lib/escalations"

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

function buildSlugMap(labels: string[]): Map<string, string> {
  const out = new Map<string, string>()
  const baseCount = new Map<string, number>()
  for (const label of labels) {
    const base = slugifyEscalationTarget(label)
    const idx = baseCount.get(base) ?? 0
    baseCount.set(base, idx + 1)
    const slug = idx === 0 ? base : `${base}-${idx + 1}`
    out.set(slug, label)
  }
  return out
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
  for (const row of rows) {
    counts.set(row.target, (counts.get(row.target) ?? 0) + 1)
  }
  const labels = Array.from(counts.keys()).sort((a, b) => a.localeCompare(b))
  const slugMap = buildSlugMap(labels)
  const out: EscalationTargetItem[] = []
  for (const [slug, label] of slugMap.entries()) {
    out.push({
      slug,
      label,
      count: counts.get(label) ?? 0,
    })
  }
  return out
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
    rows: rows
      .filter((row) => row.target === target.label)
      .sort((a, b) => b.processed_at.localeCompare(a.processed_at)),
  }
}

