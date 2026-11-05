import { expect, test } from "@playwright/test";
import { afterSplash, recoveryCode, STATE } from "./helpers";

test("a backup restores on a new phone with the recovery code", async ({ browser }) => {
  // Phone 1: back everything up.
  const one = await browser.newContext({ storageState: STATE });
  const p1 = await one.newPage();
  await p1.goto("/settings");
  await afterSplash(p1);
  await p1.getByRole("button", { name: "Back up now" }).click();
  await expect(p1.getByText(/Backed up just now/)).toBeVisible({ timeout: 15_000 });
  await one.close();

  // Phone 2: a fresh browser with nothing on it.
  const two = await browser.newContext();
  const p2 = await two.newPage();
  await p2.goto("/");
  await afterSplash(p2);
  await expect(p2).toHaveURL(/\/welcome$/);
  await p2.getByRole("link", { name: "I have a recovery code" }).click();

  // A wrong code is refused with a clear message.
  await p2.getByLabel("Recovery code").fill("ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ");
  await p2.getByRole("button", { name: "Open my store" }).click();
  await expect(p2.getByRole("alert").filter({ hasText: "didn’t match a store" })).toBeVisible();

  // The real code, typed in lowercase without dashes, works.
  await p2.getByLabel("Recovery code").fill("");
  await p2
    .getByLabel("Recovery code")
    .pressSequentially(recoveryCode().replace(/-/g, "").toLowerCase());
  await p2.getByLabel("Name this device").fill("E2E phone 2");
  await p2.getByRole("button", { name: "Open my store" }).click();
  await expect(p2.getByText("Andito pa lahat.")).toBeVisible({ timeout: 30_000 });
  await expect(p2.getByText("E2E Sari-sari is open on this device.")).toBeVisible();
  await p2.getByRole("link", { name: "Open my listahan" }).click();
  await expect(p2.getByRole("heading", { name: "E2E Sari-sari" })).toBeVisible();
  await two.close();
});
