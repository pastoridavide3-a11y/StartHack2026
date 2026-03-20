export interface SupplierRow {
  supplier_id: string
  supplier_name: string
  category_l1: string
  category_l2: string
  country_hq: string
  service_regions: string
  currency: string
  pricing_model: string
  quality_score: number | null
  risk_score: number | null
  esg_score: number | null
  preferred_supplier: boolean | null
  is_restricted: boolean | null
  restriction_reason: string
  contract_status: string
  data_residency_supported: boolean | null
  capacity_per_month: number | null
  notes: string
}

export interface SupplierOverview {
  supplier_id: string
  supplier_name: string
  country_hq: string
  service_regions: string[]
  categories: string[]
  quality_score: number | null
  risk_score: number | null
  esg_score: number | null
  is_restricted: boolean | null
  restriction_reason: string
}

export interface SupplierDetail {
  overview: SupplierOverview
  rows: SupplierRow[]
}

