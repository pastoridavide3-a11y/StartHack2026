import { NextResponse } from "next/server"

import { getEscalationTargetData } from "@/lib/server/escalations-data"

export async function GET(
  _: Request,
  { params }: { params: Promise<{ targetSlug: string }> },
) {
  const { targetSlug } = await params
  const data = await getEscalationTargetData(targetSlug)
  if (!data.target) {
    return NextResponse.json({ message: "Escalation target not found" }, { status: 404 })
  }
  return NextResponse.json(data)
}

