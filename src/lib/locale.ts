"use client";

import { create } from "zustand";

export type Locale = "en" | "hi";
type LocaleState = { locale: Locale; setLocale: (locale: Locale) => void };
export const useLocalePreference = create<LocaleState>((set) => ({ locale: "en", setLocale: (locale) => set({ locale }) }));
