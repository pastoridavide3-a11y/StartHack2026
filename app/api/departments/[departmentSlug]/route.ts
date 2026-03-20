import { NextResponse } from "next/server"

import { getDepartmentBySlug } from "@/lib/server/requests-data"

export async function GET(
  _: Request,
  { params }: { params: Promise<{ departmentSlug: string }> },
) {
  const { departmentSlug } = await params
  const result = await getDepartmentBySlug(departmentSlug)
  if (!result.department) {
    return NextResponse.json({ message: "Department not found" }, { status: 404 })
  }
  return NextResponse.json(result)
}

