import { NextResponse } from "next/server"
import { readFile } from "node:fs/promises"
import path from "node:path"

export async function GET() {
  const filePath = path.join(process.cwd(), "backend", "data", "requests.json")
  try {
    const raw = await readFile(filePath, "utf-8")
    const parsed = raw.trim() ? JSON.parse(raw) : null
    if (Array.isArray(parsed)) {
      return NextResponse.json(parsed)
    }
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.requests)) {
      return NextResponse.json(parsed.requests)
    }
    return NextResponse.json([])
  } catch {
    return NextResponse.json([])
  }
}

