import { redirect } from "next/navigation"

import { buildDepartmentEntries, loadRequestsData } from "@/lib/server/requests-data"

export default async function RequesterDepartmentsIndexPage() {
  const requests = await loadRequestsData()
  const departments = buildDepartmentEntries(requests)
  if (departments.length > 0) {
    redirect(`/requester/departments/${departments[0].slug}`)
  }
  redirect("/requester/list-requests")
}

