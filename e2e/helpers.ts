import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

export const STATE = "e2e/.auth/store.json";
export const CODE = "e2e/.auth/code.txt";

export const recoveryCode = () => readFileSync(CODE, "utf8").trim();

/** Waits past the app-start splash (shown on the first page load of a tab). */
export async function afterSplash(page: Page) {
  await expect(page.locator(".loader-overlay")).toHaveCount(0, { timeout: 15_000 });
}

/** Types an amount on the entry screen's calculator keys. */
export async function typeAmount(page: Page, keys: string) {
  const names: Record<string, string> = {
    "+": "Plus",
    "-": "Minus",
    "×": "Times",
    ".": "Decimal point",
  };
  for (const k of keys) {
    await page
      .getByRole("group", { name: "Calculator" })
      .getByRole("button", { name: names[k] ?? k, exact: true })
      .click();
  }
}

/** The balance card's big number on a client's page. */
export const balanceOf = (page: Page) => page.getByRole("region", { name: "Balance" });
