"use client";

import { create } from "zustand";

export type Locale = "en" | "hi" | "kn";
type LocaleState = { locale: Locale; setLocale: (locale: Locale) => void };
export const useLocalePreference = create<LocaleState>((set) => ({
  locale: "en",
  setLocale: (locale) => {
    if (typeof window !== "undefined") window.localStorage.setItem("saathi-locale", locale);
    set({ locale });
  },
}));
