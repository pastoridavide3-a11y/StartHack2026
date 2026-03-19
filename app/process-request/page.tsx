import { redirect } from "next/navigation"

export default function ProcessRequestPage() {
  redirect("/requester/list-requests")
}
