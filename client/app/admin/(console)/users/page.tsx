import type { Metadata } from "next";
import { Users } from "@/components/admin/users";

export const metadata: Metadata = { title: "Користувачі · PharmaBalance" };

export const instant = false;

export default function AdminUsersPage() {
  return <Users />;
}
