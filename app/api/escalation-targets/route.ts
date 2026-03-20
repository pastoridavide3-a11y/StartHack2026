import { NextResponse } from "next/server"

import {
  buildEscalationTargetItems,
  extractEscalatedRows,
  loadProcessedOutputsForEscalations,
} from "@/lib/server/escalations-data"

export async function GET() {
  const outputs = await loadProcessedOutputsForEscalations()
  const rows = extractEscalatedRows(outputs)
  const targets = buildEscalationTargetItems(rows)
  return NextResponse.json(targets)
}

