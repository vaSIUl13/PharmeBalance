import { expect, test } from "@playwright/test";

const saline = { drugId: 1, sku: "SKU-001", name: "Saline", dosageForm: "spray", strength: null, unit: "pack",
  isActive: true, registration: null };
const ibuprofen = { ...saline, drugId: 2, sku: "SKU-002", name: "Ibuprofen" };

test("drug search filters from one letter and clearing it restores the catalogue", async ({ page }) => {
  await page.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url());
    switch (url.pathname) {
      case "/api/v1/auth/me":
        return route.fulfill({ json: { userId: 1, email: "admin@example.invalid", role: "admin",
          permissions: ["REFERENCE_EDIT"], pharmacyIds: [] } });
      case "/api/v1/notifications/inbox":
        return route.fulfill({ json: { items: [], next: null, unread: 0 } });
      case "/api/v1/drugs":
        return route.fulfill({ json: { items: url.searchParams.get("q") === "s" ? [saline] : [saline, ibuprofen], next: null } });
      default:
        return route.fulfill({ status: 404 });
    }
  });

  await page.goto("/admin/drugs");
  await expect(page.getByText("Ibuprofen", { exact: true })).toBeVisible();
  const search = page.getByRole("searchbox", { name: "Пошук" });
  await search.fill("s");
  await expect(page.getByText("Ibuprofen", { exact: true })).toHaveCount(0, { timeout: 3_000 });
  await expect(page.getByText("Saline", { exact: true })).toBeVisible();
  await search.clear();
  await expect(page.getByText("Ibuprofen", { exact: true })).toBeVisible();
});
