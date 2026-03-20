import { NextResponse } from "next/server"

import { aggregateSuppliers, loadSupplierRows } from "@/lib/server/suppliers-data"

export async function GET() {
  try {
    const rows = await loadSupplierRows()
    const suppliers = aggregateSuppliers(rows)
    return NextResponse.json(suppliers)
  } catch {
    return NextResponse.json([], { status: 500 })
  }
}

