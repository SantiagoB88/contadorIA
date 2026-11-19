import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ROLES } from "@/lib/constants";

export default async function Home() {
  const user = await getCurrentUser();
  redirect(!user ? "/login" : user.role === ROLES.ADMIN ? "/admin" : "/dashboard");
}
