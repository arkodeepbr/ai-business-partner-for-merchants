import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Paytm Saathi — Your business, understood",
  description: "Business insights and operations for Paytm merchants.",
};
export const viewport: Viewport = { themeColor: "#f6f7f4", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><Providers>{children}</Providers></body></html>;
}
