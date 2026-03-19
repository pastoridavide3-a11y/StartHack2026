"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import Link from "next/link"
import { ArrowLeft, Check, FileText, Play, Table2 } from "lucide-react"

type Step = "input" | "review" | "success"

interface ExtractedFields {
  categoryL1: string
  categoryL2: string
  quantity: string
  unit: string
  budgetRange: string
  currency: string
  deliveryCountry: string
  requiredBy: string
  preferredSupplier1: string
  preferredSupplier2: string
  preferredSupplier3: string
  requestDate: string
  dataResidencyConstraint: boolean
  esgRequirement: boolean
}

interface ValidationIssue {
  type: string
  field: string
  message: string
  severity?: string
  extracted_value?: unknown
  parsed_value?: unknown
}

const categoryL1Options = [
  "IT",
  "Facilities",
  "Professional Services",
  "Marketing",
]

const categoryL2Options: Record<string, string[]> = {
  IT: [
    "Laptops",
    "Mobile Workstations",
    "Desktop Workstations",
    "Monitors",
    "Docking Stations",
    "Smartphones",
    "Tablets",
    "Rugged Devices",
    "Accessories Bundles",
    "Replacement / Break-Fix Pool Devices",
    "Cloud Compute",
    "Cloud Storage",
    "Cloud Networking",
    "Managed Cloud Platform Services",
    "Cloud Security Services",
  ],
  Facilities: [
    "Workstations and Desks",
    "Office Chairs",
    "Meeting Room Furniture",
    "Storage Cabinets",
    "Reception and Lounge Furniture",
  ],
  "Professional Services": [
    "Cloud Architecture Consulting",
    "Cybersecurity Advisory",
    "Data Engineering Services",
    "Software Development Services",
    "IT Project Management Services",
  ],
  Marketing: [
    "Search Engine Marketing (SEM)",
    "Social Media Advertising",
    "Content Production Services",
    "Marketing Analytics Services",
    "Influencer Campaign Management",
  ],
}
const quantityOptions = ["1", "2-5", "6-10", "11-25", "26-50", "51-100", "100+"]
const unitOptions = [
  "GB_transfer",
  "TB_month",
  "campaign",
  "consulting_day",
  "device",
  "instance_hour",
  "monthly_subscription",
  "project",
  "seat_license",
  "set",
  "unit",
]
const currencyOptions = ["EUR", "USD", "GBP", "CHF", "JPY"]
const countryOptions = ["Germany", "United States", "United Kingdom", "France", "Spain", "Italy", "Netherlands", "Switzerland", "Japan", "Other"]
const supplierOptions = [
  "AWS Enterprise EMEA",
  "Accenture Advisory Europe",
  "Alibaba Cloud International",
  "Apple Business Channel",
  "Artefact Analytics",
  "Azure Enterprise",
  "Bechtle Workplace Solutions",
  "Bene Office Solutions",
  "Boutique Creator Network",
  "CDW Americas",
  "Capgemini Consulting",
  "Computacenter Devices",
  "DEPT Agency",
  "Dell Enterprise Europe",
  "Deloitte Technology Advisory",
  "Dentsu International",
  "EPAM Delivery Services",
  "Google Cloud Europe",
  "HP Enterprise Devices",
  "Havas Group Americas",
  "Haworth International",
  "Herman Miller Contract",
  "IKEA Business",
  "Infosys Consulting",
  "Insight Technology Group",
  "Kinnarps Workplace",
  "Lenovo Commercial EU",
  "Monks Europe",
  "OVHcloud Enterprise",
  "Oracle Cloud Infrastructure",
  "Panasonic Toughbook Europe",
  "Publicis Digital Europe",
  "Samsung Knox Devices",
  "Steelcase Americas",
  "Steelcase Europe",
  "Swiss Sovereign Cloud",
  "Thoughtworks Europe",
  "Visium Data Engineering",
  "WPP Performance Media",
  "Wipro Digital Solutions",
]

const BACKEND_BASE_URL = "http://127.0.0.1:8010"

function isValidNonNegativeNumberString(s: string): boolean {
  const t = (s ?? "").trim()
  if (!t) return false
  const n = Number(t)
  return Number.isFinite(n) && n >= 0
}

function numberStringToNumberOrNull(s: string): number | null {
  return isValidNonNegativeNumberString(s) ? Number(s.trim()) : null
}

function backendExtractedToFrontendFields(extracted: any): ExtractedFields {
  const delivery = extracted?.delivery_countries
  const deliveryCountry = Array.isArray(delivery)
    ? delivery[0] ?? ""
    : typeof delivery === "string"
      ? delivery
      : ""

  return {
    categoryL1: extracted?.category_l1 ?? "",
    categoryL2: extracted?.category_l2 ?? "",
    quantity:
      extracted?.quantity === null || extracted?.quantity === undefined
        ? ""
        : String(extracted?.quantity),
    unit: extracted?.unit_of_measure ?? "",
    budgetRange:
      extracted?.budget_amount === null || extracted?.budget_amount === undefined
        ? ""
        : String(extracted.budget_amount),
    currency: extracted?.currency ?? "",
    deliveryCountry,
    requiredBy: extracted?.required_by_date ?? "",
    preferredSupplier1: extracted?.preferred_supplier_mentioned ?? "",
    preferredSupplier2: extracted?.preferred_supplier_mentioned_2 ?? "",
    preferredSupplier3: extracted?.preferred_supplier_mentioned_3 ?? "",
    requestDate: extracted?.request_date ?? "",
    dataResidencyConstraint: Boolean(extracted?.data_residency_constraint),
    esgRequirement: Boolean(extracted?.esg_requirement),
  }
}

function frontendParsedFieldsToBackendParsed(parsed: ExtractedFields): Record<string, any> {
  return {
    category_l1: parsed.categoryL1 || null,
    category_l2: parsed.categoryL2 || null,
    quantity: numberStringToNumberOrNull(parsed.quantity),
    unit_of_measure: parsed.unit || null,
    budget_amount: numberStringToNumberOrNull(parsed.budgetRange),
    currency: parsed.currency || null,
    delivery_countries: parsed.deliveryCountry ? [parsed.deliveryCountry] : null,
    required_by_date: parsed.requiredBy || null,
    preferred_supplier_mentioned: parsed.preferredSupplier1 || null,
    preferred_supplier_mentioned_2: parsed.preferredSupplier2 || null,
    preferred_supplier_mentioned_3: parsed.preferredSupplier3 || null,
    request_date: parsed.requestDate || null,
    data_residency_constraint: parsed.dataResidencyConstraint,
    esg_requirement: parsed.esgRequirement,
  }
}

export function RequestForm() {
  const [step, setStep] = useState<Step>("input")
  const [requestText, setRequestText] = useState("")
  const emptyFields: ExtractedFields = {
    categoryL1: "",
    categoryL2: "",
    quantity: "",
    unit: "",
    budgetRange: "",
    currency: "",
    deliveryCountry: "",
    requiredBy: "",
    preferredSupplier1: "",
    preferredSupplier2: "",
    preferredSupplier3: "",
    requestDate: "",
    dataResidencyConstraint: false,
    esgRequirement: false,
  }

  const [extractedFields, setExtractedFields] = useState<ExtractedFields>(emptyFields)
  const [parsedFields, setParsedFields] = useState<ExtractedFields>(emptyFields)
  const [issues, setIssues] = useState<ValidationIssue[]>([])

  const [isExtracting, setIsExtracting] = useState(false)
  const [isValidating, setIsValidating] = useState(false)

  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleSubmit = () => {
    void (async () => {
      setIsExtracting(true)
      setSubmitAttempted(false)
      setSubmitError(null)
      setIssues([])

      try {
        const res = await fetch(`${BACKEND_BASE_URL}/extract`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: requestText, language: "en" }),
        })

        if (!res.ok) {
          const text = await res.text().catch(() => "")
          throw new Error(`Extraction failed (${res.status}) ${text}`.trim())
        }

        const data = (await res.json()) as { extracted: any }
        const extracted = backendExtractedToFrontendFields(data.extracted)
        // Prefill parsedFields from extracted suggestion (user edits from here).
        setExtractedFields(extracted)
        setParsedFields(extracted)
        setStep("review")
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to extract request fields"
        setSubmitError(msg)
      } finally {
        setIsExtracting(false)
      }
    })()
  }

  const handleConfirm = () => {
    void (async () => {
      setIsValidating(true)
      setSubmitAttempted(true)
      setSubmitError(null)
      setIssues([])

      try {
        const missing: Array<"budgetRange" | "categoryL2" | "quantity"> = []
        const quantityOk = isValidNonNegativeNumberString(parsedFields.quantity)
        const budgetOk = isValidNonNegativeNumberString(parsedFields.budgetRange)

        if (!budgetOk) missing.push("budgetRange")
        if (!parsedFields.categoryL2.trim()) missing.push("categoryL2")
        if (!quantityOk) missing.push("quantity")

        if (missing.length > 0) {
          setSubmitError("input resquest nsufficient")
          return
        }

        const res = await fetch(`${BACKEND_BASE_URL}/validate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: requestText,
            parsed: frontendParsedFieldsToBackendParsed(parsedFields),
          }),
        })

        if (!res.ok) {
          const text = await res.text().catch(() => "")
          throw new Error(`Validation failed (${res.status}) ${text}`.trim())
        }

        const data = await res.json()
        const parsedBackend = backendExtractedToFrontendFields(data.parsed)
        const extractedBackend = backendExtractedToFrontendFields(data.extracted)

        setIssues((data.issues ?? []) as ValidationIssue[])
        // Keep the form consistent with backend normalization of user-confirmed values.
        setParsedFields(parsedBackend)
        setExtractedFields(extractedBackend)

        // Persist to local JSON datastore (non-blocking)
        try {
          await fetch(`${BACKEND_BASE_URL}/requests`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              request_text: requestText,
              extracted: data.extracted ?? {},
              parsed: data.parsed ?? {},
              issues: data.issues ?? [],
            }),
          })
        } catch {
          // Non-blocking: request confirmed but storage may have failed
        }

        setStep("success")
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to validate request"
        setSubmitError(msg)
      } finally {
        setIsValidating(false)
      }
    })()
  }

  const handleEditAgain = () => {
    setStep("input")
    setSubmitAttempted(false)
    setSubmitError(null)
    setIssues([])
    setExtractedFields(emptyFields)
    setParsedFields(emptyFields)
  }

  // Dev-only: switch to the "review" UI without calling the backend.
  const handleOpenReviewManually = () => {
    setStep("review")
    setSubmitAttempted(false)
    setSubmitError(null)
    setIssues([])
    setIsExtracting(false)
    setIsValidating(false)
    // Keep extracted/parsed as-is (usually empty during development).
  }

  const updateParsedField = (field: keyof ExtractedFields, value: string) => {
    setParsedFields((prev) => ({ ...prev, [field]: value }))
  }

  if (step === "input") {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">New Request</h2>
            <p className="text-muted-foreground mt-1">
              Describe your request in plain language. We&apos;ll extract the details for you.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2" asChild>
              <Link href="/requester/list-requests">
                <Table2 className="h-4 w-4" />
                View requests
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="gap-2" asChild>
              <Link href="/requester/list-requests">
                <Play className="h-4 w-4" />
                Process request
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="gap-2" asChild>
              <Link href="/outputs">
                <FileText className="h-4 w-4" />
                Processed outputs
              </Link>
            </Button>
          </div>
        </div>

        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <Textarea
              placeholder="Need laptops for the new team in Germany, delivery in 2 weeks, budget not yet confirmed, preferred supplier if available."
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
              className="min-h-[180px] resize-none bg-input border-border text-foreground placeholder:text-muted-foreground"
            />
            <div className="mt-6 flex justify-end">
              <Button
                variant="outline"
                onClick={handleOpenReviewManually}
                disabled={isExtracting}
                className="px-6 mr-3"
              >
                Open fields
              </Button>
              <Button 
                onClick={handleSubmit} 
                disabled={!requestText.trim() || isExtracting}
                className="px-6"
              >
                {isExtracting ? "Extracting..." : "Submit Request"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (step === "success") {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="mb-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <Link href="/requester/list-requests">
              <Table2 className="h-4 w-4" />
              View requests
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <Link href="/requester/list-requests">
              <Play className="h-4 w-4" />
              Process request
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <Link href="/outputs">
              <FileText className="h-4 w-4" />
              Processed outputs
            </Link>
          </Button>
        </div>
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-xl">Request successfully submitted</CardTitle>
            <CardDescription className="text-muted-foreground">
              Your request was submitted successfully.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-end">
            {issues.length > 0 && (
              <div className="mr-auto text-sm text-muted-foreground pr-4">
                <div className="font-medium text-foreground">Comparison issues</div>
                <div className="mt-1 space-y-1">
                  {issues.slice(0, 6).map((issue, idx) => (
                    <div key={`${issue.type}-${issue.field}-${idx}`}>
                      - {issue.type} on {issue.field}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Button
              onClick={() => {
                setStep("input")
                setRequestText("")
                setSubmitAttempted(false)
                setSubmitError(null)
                setExtractedFields(emptyFields)
                setParsedFields(emptyFields)
                setIssues([])
              }}
            >
              New Request
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const isBudgetInvalid = submitAttempted && !isValidNonNegativeNumberString(parsedFields.budgetRange)
  const isCategoryL2Missing = submitAttempted && !parsedFields.categoryL2.trim()
  const isQuantityInvalid = submitAttempted && !isValidNonNegativeNumberString(parsedFields.quantity)

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Review Extracted Details</h2>
          <p className="text-muted-foreground mt-1">
            We extracted these details from your request. Please confirm or edit any field before continuing.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <Link href="/requester/list-requests">
              <Table2 className="h-4 w-4" />
              View requests
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <Link href="/requester/list-requests">
              <Play className="h-4 w-4" />
              Process request
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <Link href="/outputs">
              <FileText className="h-4 w-4" />
              Processed outputs
            </Link>
          </Button>
        </div>
      </div>

      <Card className="border-border bg-card mb-6">
        <CardHeader className="pb-4">
          <CardDescription className="text-muted-foreground text-sm">
            Your original request
          </CardDescription>
          <CardTitle className="text-base font-normal text-foreground/80 leading-relaxed">
            &quot;{requestText}&quot;
          </CardTitle>
        </CardHeader>
      </Card>

      <Card className="border-border bg-card">
        <CardContent className="pt-6">
          {submitError && (
            <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {submitError}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FieldSelect
              label="Category L1"
              value={parsedFields.categoryL1}
              options={categoryL1Options}
              onChange={(v) => updateParsedField("categoryL1", v)}
            />
            <FieldSelect
              label="Category L2"
              value={parsedFields.categoryL2}
              options={parsedFields.categoryL1 ? categoryL2Options[parsedFields.categoryL1 as keyof typeof categoryL2Options] || [] : []}
              onChange={(v) => updateParsedField("categoryL2", v)}
              disabled={!parsedFields.categoryL1}
              error={isCategoryL2Missing}
            />
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Quantity</label>
              <Input
                type="number"
                min={0}
                step={1}
                value={parsedFields.quantity}
                onChange={(e) => updateParsedField("quantity", e.target.value)}
                className={`bg-input border-border text-foreground ${isQuantityInvalid ? "border-destructive focus-visible:ring-destructive" : ""}`}
                placeholder="e.g. 20"
              />
            </div>
            <FieldSelect
              label="Unit"
              value={parsedFields.unit}
              options={unitOptions}
              onChange={(v) => updateParsedField("unit", v)}
            />
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Budget</label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={parsedFields.budgetRange}
                onChange={(e) => updateParsedField("budgetRange", e.target.value)}
                placeholder="e.g. 400000"
                className={`bg-input border-border text-foreground ${isBudgetInvalid ? "border-destructive focus-visible:ring-destructive" : ""}`}
              />
            </div>
            <FieldSelect
              label="Currency"
              value={parsedFields.currency}
              options={currencyOptions}
              onChange={(v) => updateParsedField("currency", v)}
            />
            <FieldSelect
              label="Delivery Country"
              value={parsedFields.deliveryCountry}
              options={countryOptions}
              onChange={(v) => updateParsedField("deliveryCountry", v)}
            />
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Required By</label>
              <Input
                type="date"
                value={parsedFields.requiredBy}
                onChange={(e) => updateParsedField("requiredBy", e.target.value)}
                className="bg-input border-border text-foreground"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Request Date</label>
              <Input
                type="date"
                value={parsedFields.requestDate}
                onChange={(e) => updateParsedField("requestDate", e.target.value)}
                className="bg-input border-border text-foreground"
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border bg-input px-4 py-3">
              <label className="text-sm font-medium text-foreground">Data residency constraint</label>
              <Switch
                checked={parsedFields.dataResidencyConstraint}
                onCheckedChange={(checked) =>
                  setParsedFields((prev) => ({ ...prev, dataResidencyConstraint: checked }))
                }
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border bg-input px-4 py-3">
              <label className="text-sm font-medium text-foreground">ESG requirement</label>
              <Switch
                checked={parsedFields.esgRequirement}
                onCheckedChange={(checked) =>
                  setParsedFields((prev) => ({ ...prev, esgRequirement: checked }))
                }
              />
            </div>
            <SupplierSelect
              label="Preferred Supplier 1"
              value={parsedFields.preferredSupplier1}
              onChange={(v) => updateParsedField("preferredSupplier1", v)}
              className="md:col-span-2"
            />
            <SupplierSelect
              label="Preferred Supplier 2"
              value={parsedFields.preferredSupplier2}
              onChange={(v) => updateParsedField("preferredSupplier2", v)}
              className="md:col-span-2"
            />
            <SupplierSelect
              label="Preferred Supplier 3"
              value={parsedFields.preferredSupplier3}
              onChange={(v) => updateParsedField("preferredSupplier3", v)}
              className="md:col-span-2"
            />
          </div>

          <div className="mt-8 flex justify-end gap-3">
            <Button variant="outline" onClick={handleEditAgain}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Edit Again
            </Button>
            <Button onClick={handleConfirm} disabled={isValidating}>
              <Check className="mr-2 h-4 w-4" />
              {isValidating ? "Validating..." : "Confirm Request"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

interface FieldSelectProps {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
  error?: boolean
}

function FieldSelect({ label, value, options, onChange, disabled, className, error }: FieldSelectProps) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-foreground mb-2">{label}</label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          className={`w-full bg-input border-border text-foreground ${error ? "border-destructive focus:ring-destructive" : ""}`}
        >
          <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

interface SupplierSelectProps {
  label: string
  value: string
  onChange: (value: string) => void
  className?: string
}

function SupplierSelect({ label, value, onChange, className }: SupplierSelectProps) {
  const search = value.toLowerCase()
  const filtered =
    search.trim().length === 0
      ? supplierOptions
      : supplierOptions.filter((option) => option.toLowerCase().includes(search))

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-foreground mb-2">{label}</label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Start typing a supplier name..."
        className="bg-input border-border text-foreground"
      />
      {filtered.length > 0 && (
        <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-popover text-sm shadow-sm">
          {filtered.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={`block w-full text-left px-3 py-1.5 hover:bg-accent hover:text-accent-foreground ${
                option === value ? "bg-accent text-accent-foreground" : ""
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
