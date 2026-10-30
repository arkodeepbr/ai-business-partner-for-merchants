"use client";

import { create } from "zustand";

type SessionState = { accessToken: string | null; email: string | null; displayName: string | null; setAccessToken: (token: string | null) => void; setIdentity: (identity: { email: string | null; displayName: string | null }) => void };
export const useSession = create<SessionState>((set) => ({ accessToken: null, email: null, displayName: null, setAccessToken: (accessToken) => set({ accessToken }), setIdentity: (identity) => set(identity) }));
