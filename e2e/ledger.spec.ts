import { expect, test } from "@playwright/test";
import { afterSplash, balanceOf, STATE, typeAmount } from "./helpers";

test.use({ storageState: STATE });

test("a client's utang and bayad add up, with undo and void", async ({ page }) => {
  await page.goto("/");
  await afterSplash(page);
  await page.getByRole("link", { name: "Add a client" }).first().click();

  // A name is required.
  await page.getByRole("button", { name: "Save client" }).click();
  await expect(page.getByText("Enter the client's name")).toBeVisible();

  await page.getByLabel("Name").fill("Aling Nena");
  await page.getByLabel(/Starting balance/).fill("500");
  await page.getByRole("button", { name: "Save client" }).click();
  await expect(page).toHaveURL(/\/client\?id=/);
  await expect(balanceOf(page)).toContainText("₱500.00");
  // An empty store limit means the ₱1,000 default.
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

  // Void the 150: it stays on the page, crossed out, and the balance is corrected.
  await page.getByRole("row", { name: /Bigas, mantika/ }).click();
  await page.getByRole("dialog", { name: "Void this entry?" }).getByRole("button").first().click();
  await expect(balanceOf(page)).toContainText("₱300.00");
  await expect(page.getByText(/Voided/)).toBeVisible();

  // The statement agrees with the ledger.
  await page.getByRole("link", { name: "Statement" }).click();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.getByRole("article")).toContainText("Balance due");
  await expect(page.getByRole("article")).toContainText("₱300.00");
});
