import { expect, test } from "@playwright/test";
import { afterSplash, balanceOf, STATE, typeAmount } from "./helpers";

test.use({ storageState: STATE });

test("a borrower's utang and bayad add up, with undo and void", async ({ page }) => {
  await page.goto("/");
  await afterSplash(page);
  await page.getByRole("link", { name: "Add a borrower" }).first().click();

  // A name is required.
  await page.getByRole("button", { name: "Save borrower" }).click();
  await expect(page.getByText("Enter the borrower's name")).toBeVisible();

  await page.getByLabel("Name").fill("Aling Nena");
  await page.getByLabel(/Starting balance/).fill("500");
  await page.getByRole("button", { name: "Save borrower" }).click();
  await expect(page).toHaveURL(/\/borrower\?id=/);
  await expect(balanceOf(page)).toContainText("₱500.00");
  // An empty default limit means the ₱1,000 default.
  await expect(balanceOf(page)).toContainText("limit ₱1,000");

  // Utang with the calculator: 3 × 25 + 75 = 150.
  await page.getByRole("link", { name: "Utang", exact: true }).click();
  await typeAmount(page, "3×25+75");
  await page.getByPlaceholder(/Note/).fill("Bigas, mantika");
  await page.getByRole("button", { name: /Save utang · ₱150\.00/ }).click();
  await expect(page.getByRole("status").getByText(/Utang saved/)).toBeVisible();
  await expect(balanceOf(page)).toContainText("₱650.00");

  // A second visit to the entry screen starts fresh (no leftover amount or type).
  await page.getByRole("link", { name: "Bayad", exact: true }).click();
  await expect(page.getByRole("button", { name: "Enter an amount" })).toBeVisible();
  await typeAmount(page, "200");
  await page.getByRole("button", { name: /Save bayad · ₱200\.00/ }).click();
  await expect(balanceOf(page)).toContainText("₱450.00");

  // Undo from the toast.
  await page.getByRole("link", { name: "Bayad", exact: true }).click();
  await typeAmount(page, "100");
  await page.getByRole("button", { name: /Save bayad/ }).click();
  await expect(balanceOf(page)).toContainText("₱350.00");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(balanceOf(page)).toContainText("₱450.00");

  // Forgot the note on the 200 bayad: add it later. Only the note changes, not the balance.
  await page.getByRole("button", { name: /^Bayad/ }).click();
  const sheet = page.getByRole("dialog", { name: /Bayad · ₱200\.00/ });
  await expect(sheet.getByRole("button", { name: "Add note" })).toBeDisabled();
  await sheet.getByLabel("Note").fill("GCash");
  await sheet.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByRole("status").getByText(/Note saved/)).toBeVisible();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("button", { name: /GCash/ })).toContainText("Note edited");
  await expect(balanceOf(page)).toContainText("₱450.00");

  // Void the 150: it stays on the page, crossed out, and the balance is corrected.
  await page.getByRole("button", { name: /Bigas, mantika/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Entered twice" }).click();
  await expect(balanceOf(page)).toContainText("₱300.00");
  await expect(page.getByText(/Voided/).filter({ visible: true })).toBeVisible();

  // The statement agrees with the ledger.
  await page.getByRole("link", { name: "Statement" }).click();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.getByRole("article")).toContainText("Balance due");
  await expect(page.getByRole("article")).toContainText("₱300.00");
});
