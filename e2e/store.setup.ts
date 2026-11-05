import { expect, test as setup } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { afterSplash, CODE, STATE } from "./helpers";

/** Starts the one store the other tests share, and saves its recovery code and browser state. */
setup("start a store and confirm the recovery code", async ({ page }) => {
  await page.goto("/welcome");
  await afterSplash(page);
  await page.getByRole("link", { name: "Start my store" }).click();

  await page.getByLabel("Store name").fill("E2E Sari-sari");
  await page.getByLabel(/Default credit limit/).fill("");
  await page.getByRole("button", { name: "Continue" }).click();

  const codeCard = page.getByRole("region", { name: "Recovery code" });
  await expect(codeCard).toBeVisible({ timeout: 20_000 });
  const groups = (await codeCard.innerText()).match(/\b[0-9A-Z]{5}\b/g) ?? [];
  expect(groups).toHaveLength(5);

  const next = page.getByRole("button", { name: "Continue" });
  await expect(next).toBeDisabled();
  await page.getByRole("checkbox", { name: "I wrote it down" }).check();
  await next.click();

  await page.getByLabel("Group 5 of your code").fill("ZZZZZ");
  await expect(page.getByRole("button", { name: "Open my store" })).toBeDisabled();
  await page.getByLabel("Group 5 of your code").fill(groups[4]!.toLowerCase());
  await page.getByRole("button", { name: "Open my store" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "E2E Sari-sari" })).toBeVisible();

  mkdirSync("e2e/.auth", { recursive: true });
  writeFileSync(CODE, groups.join("-"));
  await page.context().storageState({ path: STATE, indexedDB: true });
});
