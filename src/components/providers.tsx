"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { useLocalePreference } from "@/lib/locale";

const messages = {
  en: { app: { overview: "Overview", sales: "Sales insights", cashflow: "Cash flow", customers: "Customers", inventory: "Stock & staff", loans: "My loans", reports: "Reports" } },
  hi: { app: { overview: "अवलोकन", sales: "बिक्री की जानकारी", cashflow: "नकदी प्रवाह", customers: "ग्राहक", inventory: "स्टॉक और कर्मचारी", loans: "मेरे ऋण", reports: "रिपोर्ट" } },
};

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: true } } }));
  const locale = useLocalePreference((state) => state.locale);
  return <NextIntlClientProvider locale={locale} timeZone="Asia/Kolkata" messages={messages[locale]}><QueryClientProvider client={queryClient}>{children}</QueryClientProvider></NextIntlClientProvider>;
}
