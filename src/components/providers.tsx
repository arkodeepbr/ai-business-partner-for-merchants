"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { useEffect, useState } from "react";
import { useLocalePreference } from "@/lib/locale";
import { AuthSessionSync } from "@/components/auth-session-sync";

const messages = {
  en: { app: { overview: "Overview", sales: "Sales insights", cashflow: "Cash flow", customers: "Customers", inventory: "Profit planner", reports: "Reports" } },
  hi: { app: { overview: "अवलोकन", sales: "बिक्री की जानकारी", cashflow: "नकदी प्रवाह", customers: "ग्राहक", inventory: "लाभ योजना", reports: "रिपोर्ट" } },
  kn: { app: { overview: "ಅವಲೋಕನ", sales: "ಮಾರಾಟದ ಮಾಹಿತಿ", cashflow: "ನಗದು ಹರಿವು", customers: "ಗ್ರಾಹಕರು", inventory: "ಲಾಭ ಯೋಜಕ", reports: "ವರದಿಗಳು" } },
};

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: true } } }));
  const locale = useLocalePreference((state) => state.locale);
  const setLocale = useLocalePreference((state) => state.setLocale);
  useEffect(() => {
    const saved = window.localStorage.getItem("saathi-locale");
    if (saved === "en" || saved === "hi" || saved === "kn") setLocale(saved);
  }, [setLocale]);
  return <NextIntlClientProvider locale={locale} timeZone="Asia/Kolkata" messages={messages[locale]}><QueryClientProvider client={queryClient}><AuthSessionSync />{children}</QueryClientProvider></NextIntlClientProvider>;
}
