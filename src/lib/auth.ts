"use client";

import { create } from "zustand";

type SessionState = { accessToken: string | null; setAccessToken: (token: string | null) => void };
// Access tokens are held in memory only. The current shared API has no OTP/session endpoint yet.
export const useSession = create<SessionState>((set) => ({ accessToken: null, setAccessToken: (accessToken) => set({ accessToken }) }));
