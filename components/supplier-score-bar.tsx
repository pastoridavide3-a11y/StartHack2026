"use client"

import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

interface SupplierScoreBarProps {
  label: string
  value: number | null
  indicatorClassName?: string
}

export function SupplierScoreBar({
  label,
  value,
  indicatorClassName,
}: SupplierScoreBarProps) {
  const safeValue = typeof value === "number" ? Math.max(0, Math.min(100, value)) : null

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground">
          {safeValue === null ? "N/A" : safeValue.toFixed(1)}
        </span>
      </div>
      <Progress
        value={safeValue ?? 0}
        className={cn("h-2 bg-white/10 [&>[data-slot=progress-indicator]]:bg-emerald-400/80", indicatorClassName)}
      />
    </div>
  )
}

