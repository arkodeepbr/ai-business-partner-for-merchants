import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MerchantApp } from "@/components/merchant-app";
import { Providers } from "@/components/providers";
import { useSession } from "@/lib/auth";

describe("merchant dashboard empty state", () => {
  it("does not present preview figures as live merchant data", () => {
    useSession.getState().setAccessToken(null);
    render(<Providers><MerchantApp /></Providers>);
    expect(screen.getByText("Merchant session required")).toBeInTheDocument();
    expect(screen.getByText("Sign in to view transactions")).toBeInTheDocument();
    expect(screen.queryByText("₹48,290")).not.toBeInTheDocument();
  });
});
