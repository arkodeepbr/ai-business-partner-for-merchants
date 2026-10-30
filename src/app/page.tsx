import { redirect } from "next/navigation";
import { MerchantApp } from "@/components/merchant-app";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) redirect("/login");
  return <MerchantApp />;
}
