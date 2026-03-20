import { redirect } from "next/navigation"

export default function HomePage() {
  redirect("/requester/add-request")
}
