import { redirect } from "next/navigation"

import { AppShell } from "@/components/app-shell"
import { PlaceholderPage } from "@/components/placeholder-page"
import {
  buildEscalationTargetItems,
  extractEscalatedRows,
  loadProcessedOutputsForEscalations,
} from "@/lib/server/escalations-data"

export default async function ReviewerEscalatedPage() {
  const outputs = await loadProcessedOutputsForEscalations()
  const rows = extractEscalatedRows(outputs)
  const targets = buildEscalationTargetItems(rows)
  if (targets.length > 0) {
    redirect(`/reviewer/escalated/${targets[0].slug}`)
  }

  return (
    <AppShell>
      <PlaceholderPage
        title="Reviewer · Escalated"
        description="No escalated targets found in processed outputs."
      />
    </AppShell>
  )
}

