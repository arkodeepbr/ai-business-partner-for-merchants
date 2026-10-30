import { expect, test } from "@playwright/test";

test("shows truthful merchant empty state at mobile and desktop widths", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Merchant session required")).toBeVisible();
  await expect(page.getByText("Sign in to view transactions")).toBeVisible();
  await expect(page.getByText("₹48,290")).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("merchant-dashboard.png", { fullPage: true, animations: "disabled", maxDiffPixelRatio: 0.01 });
});
