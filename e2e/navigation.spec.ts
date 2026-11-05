import { expect, test } from "@playwright/test";
import { afterSplash, STATE } from "./helpers";

test.describe("without a store", () => {
  test("Terms and Privacy open from Welcome, and Back returns there", async ({ page }) => {
    await page.goto("/welcome");
    await afterSplash(page);
    await page.getByRole("link", { name: "Terms" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Terms of Use" })).toBeVisible();
    await page
      .getByRole("navigation", { name: "Legal documents" })
      .getByRole("link", { name: "Privacy Policy" })
      .click();
    await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();
    await page.getByRole("link", { name: "Why we use it" }).click();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(/\/welcome$/);
  });

  test("security headers are on every page", async ({ request }) => {
    const res = await request.get("/welcome");
    const csp = res.headers()["content-security-policy"] ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toMatch(/connect-src 'self'/);
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
    expect(res.headers()["referrer-policy"]).toBe("no-referrer");
  });
});

test.describe("with a store", () => {
  test.use({ storageState: STATE });

  test("Settings: theme, and records download as CSV", async ({ page }) => {
    await page.goto("/settings");
    await afterSplash(page);
    await page.getByRole("button", { name: "Dark", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: "System", exact: true }).click();

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download all records/ }).click();
    expect((await download).suggestedFilename()).toMatch(
      /^E2E-Sari-sari-records-\d{4}-\d{2}-\d{2}\.csv$/,
    );
  });

  test("Activity and Notifications open from the app", async ({ page }) => {
    await page.goto("/");
    await afterSplash(page);
    await page.getByRole("link", { name: /Notifications/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();
    await page.goto("/activity");
    await expect(page.getByRole("heading", { level: 1, name: "Activity" })).toBeVisible();
  });
});
