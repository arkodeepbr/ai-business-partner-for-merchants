"use client";

import { create } from "zustand";

type SessionState = { accessToken: string | null; email: string | null; setAccessToken: (token: string | null) => void; setEmail: (email: string | null) => void };
export const useSession = create<SessionState>((set) => ({ accessToken: null, email: null, setAccessToken: (accessToken) => set({ accessToken }), setEmail: (email) => set({ email }) }));
