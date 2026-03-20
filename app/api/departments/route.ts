import { NextResponse } from "next/server"

import { buildDepartmentEntries, loadRequestsData } from "@/lib/server/requests-data"

export async function GET() {
  const requests = await loadRequestsData()
  const departments = buildDepartmentEntries(requests)
  return NextResponse.json(departments)
}

