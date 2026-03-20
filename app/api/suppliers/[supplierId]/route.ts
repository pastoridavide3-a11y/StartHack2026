import { NextResponse } from "next/server"

import { buildSupplierDetail, loadSupplierRows } from "@/lib/server/suppliers-data"

export async function GET(
  _: Request,
  { params }: { params: Promise<{ supplierId: string }> },
) {
  try {
    const { supplierId } = await params
    const rows = await loadSupplierRows()
    const detail = buildSupplierDetail(supplierId, rows)
    if (!detail) {
      return NextResponse.json({ message: "Supplier not found" }, { status: 404 })
    }
    return NextResponse.json(detail)
  } catch {
    return NextResponse.json({ message: "Failed to load supplier" }, { status: 500 })
  }
}

