import type { Metadata } from "next";
import { Users } from "@/components/admin/users";

export const metadata: Metadata = { title: "Користувачі · PharmaBalance" };

export default function AdminUsersPage() {
  return <Users />;
}
