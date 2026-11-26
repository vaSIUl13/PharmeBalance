import { expect, test, type Page, type Route } from "@playwright/test";
import type { ImportDetail, Pharmacy, Principal, TransferDetail, TransferStatus } from "@/lib/head/types";

const timestamp = "2026-01-10T12:00:00.000Z";
const donor = { pharmacyId: 4, code: "E2E-004", name: "Аптека-донор", city: "Київ", address: "Київська, 4",
  isActive: true, latitude: "50.440000", longitude: "30.520000" } satisfies Pharmacy & { latitude: string; longitude: string };
const recipient = { ...donor, pharmacyId: 5, code: "E2E-005", name: "Аптека-реципієнт", address: "Київська, 5" };
const drug = { sku: "E2E-001", name: "Тестовий препарат", dosageForm: "таблетки", strength: null, unit: "уп." };

async function mockApi(page: Page, principal: Principal, handler: (route: Route, path: string) => Promise<void>) {
  await page.route(/https?:\/\/(?!127\.0\.0\.1:3310\/)/, route => route.abort());
  await page.route("http://127.0.0.1:3310/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1/", "");
    if (path === "auth/me") return route.fulfill({ json: principal });
    await handler(route, path);
  });
}

test("manager can sign in, confirm a transfer and read its history", async ({ page }) => {
  const manager = { userId: 7, email: "manager@example.invalid", role: "manager",
    permissions: ["NETWORK_VIEW", "RECOMMENDATION_DECIDE", "STATS_VIEW"], pharmacyIds: [] } satisfies Principal;
  const transfer = {
    recommendationId: 42, quantity: 6, priority: 1, createdAt: timestamp, distanceKm: "2.4", distanceSource: "HAVERSINE",
    donorStock: { stockId: 12, pharmacy: donor, drug },
    recipientStock: { stockId: 13, pharmacy: recipient, drug },
  } satisfies Omit<TransferDetail, "status">;
  const comment = "Перевірено менеджером";
  let status: TransferStatus = "CREATED";
  let openedBatch = false;
  await mockApi(page, manager, async (route, path) => {
    const request = route.request();
    if (path === "auth/login") {
      expect(request.method()).toBe("POST");
      expect(request.headers()["x-pharme-csrf"]).toBe("1");
      expect(request.postDataJSON()).toEqual({ email: manager.email, password: "e2e-password" });
      return route.fulfill({ json: { mfaRequired: false } });
    }
    if (path === "notifications/inbox") return route.fulfill({ json: { items: [{ id: 88, title: "Готові рекомендації перерозподілу",
      message: "Є одна нова рекомендація.", recommendationId: null, recommendationIds: [42], readAt: null, createdAt: timestamp }], unread: 1, next: null } });
    if (path === "notifications/inbox/88/read") return route.fulfill({ status: 204 });
    if (path === "recommendations") {
      if (new URL(request.url()).searchParams.get("notificationId") === "88") openedBatch = true;
      return route.fulfill({ json: [{ ...transfer, status }] });
    }
    if (path === "recommendations/42") return route.fulfill({ json: { ...transfer, status } });
    if (path === "recommendations/42/route") return route.fulfill({ json: { status: "unavailable" } });
    if (path === "recommendations/42/actions/CONFIRM") {
      expect(request.method()).toBe("POST");
      expect(request.headers()["x-pharme-csrf"]).toBe("1");
      expect(request.postDataJSON()).toEqual({ comment });
      status = "CONFIRMED";
      return route.fulfill({ json: { recommendationId: 42, status, replayed: false } });
    }
    if (path === "recommendations/42/history") {
      return route.fulfill({ json: status === "CONFIRMED" ? [{
        actionId: 1, userId: manager.userId, actionTime: timestamp, quantity: transfer.quantity, comment,
        actionType: { code: "CONFIRM", fromStatus: "CREATED", toStatus: "CONFIRMED" },
      }] : [] });
    }
    if (path === "pharmacies") return route.fulfill({ json: { items: [], next: null } });
    if (path === "risks" || path === "surpluses") return route.fulfill({ json: { run: null, items: [], next: null } });
    if (path === "reports/timeline") return route.fulfill({ json: { points: [] } });
    return route.fulfill({ status: 501, json: { message: "Route not covered by the browser fixture" } });
  });

  await page.goto("/login");
  await page.getByLabel("Робочий email").fill(manager.email);
  await page.getByLabel("Пароль", { exact: true }).fill("e2e-password");
  await page.getByRole("button", { name: "Увійти" }).click();
  await expect(page).toHaveURL(/\/manager\/dashboard$/);
  await page.getByRole("button", { name: /Сповіщення/ }).click();
  await page.getByRole("button", { name: /Готові рекомендації перерозподілу/ }).click();
  await expect(page).toHaveURL(/\/manager\/recommendations\?notificationId=88$/);
  await expect(page.getByText("Рекомендації зі сповіщення.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Картка та історія рейсу №42" })).toBeVisible();
  expect(openedBatch).toBe(true);
  await page.getByRole("button", { name: "Підтвердити", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Підтвердити рекомендацію" });
  await dialog.getByLabel("Коментар").fill(comment);
  await dialog.getByRole("button", { name: "Підтвердити", exact: true }).click();
  await expect(page.getByText("Рекомендацію підтверджено, залишок донора зарезервовано.")).toBeVisible();
  await page.getByLabel("Статус").selectOption("CONFIRMED");
  await page.getByRole("link", { name: "Картка та історія рейсу №42" }).click();
  await expect(page).toHaveURL(/\/manager\/transfer\/42$/);
  await expect(page.getByRole("heading", { name: "Історія рейсу" })).toBeVisible();
  await expect(page.getByText("Підтверджено рекомендацію")).toBeVisible();
  await expect(page.getByText(comment)).toBeVisible();
});

test("the manager recommendations list refreshes while it stays open", async ({ page }) => {
  const manager = { userId: 7, email: "manager@example.invalid", role: "manager", permissions: ["NETWORK_VIEW"], pharmacyIds: [] } satisfies Principal;
  let published = false;
  await page.clock.install();
  await mockApi(page, manager, async (route, path) => {
    if (path === "notifications/inbox") return route.fulfill({ json: { items: [], unread: 0, next: null } });
    if (path === "recommendations") return route.fulfill({ json: published ? [{
      recommendationId: 43, status: "CREATED", quantity: 6, priority: 1, createdAt: timestamp,
      donorStock: { stockId: 12, pharmacy: donor, drug }, recipientStock: { stockId: 13, pharmacy: recipient, drug },
    }] : [] });
    return route.fulfill({ status: 501 });
  });
  await page.goto("/manager/recommendations");
  await expect(page.getByText("Рекомендацій ще немає")).toBeVisible();
  published = true;
  await page.clock.fastForward(60_000);
  await expect(page.getByRole("link", { name: "Картка та історія рейсу №43" })).toBeVisible();
});

test("head sees row-level details when an inventory import is rejected", async ({ page }) => {
  const head = { userId: 8, email: "head@example.invalid", role: "head",
    permissions: ["PHARMACY_VIEW", "DATA_IMPORT"], pharmacyIds: [recipient.pharmacyId] } satisfies Principal;
  const fileName = "stock.json";
  const detail = {
    importId: 14, dataType: "STOCKS", sourceFormat: "JSON", fileName, uploadedAt: timestamp, snapshotAt: timestamp,
    recordsTotal: 1, recordsApplied: 0, recordsRejected: 1, status: "REJECTED", errors: [{ row: 1, message: "Невідомий SKU" }],
  } satisfies ImportDetail;
  let uploaded = false;
  await mockApi(page, head, async (route, path) => {
    if (path === "notifications/inbox") return route.fulfill({ json: { items: [], unread: 0, next: null } });
    if (path === "pharmacies/5") return route.fulfill({ json: recipient });
    if (path === "imports") return route.fulfill({ json: { items: uploaded ? [detail] : [], next: null } });
    if (path === "imports/stocks") {
      const request = route.request();
      expect(request.method()).toBe("POST");
      expect(request.headers()["x-pharme-csrf"]).toBe("1");
      expect(request.postData()).toContain('name="pharmacyId"');
      expect(request.postData()).toContain('name="snapshotAt"');
      expect(request.postData()).toContain('filename="' + fileName + '"');
      uploaded = true;
      return route.fulfill({ status: 422, json: detail });
    }
    return route.fulfill({ status: 501, json: { message: "Route not covered by the browser fixture" } });
  });

  await page.goto("/head/import");
  await expect(page.getByText("Імпортів ще не було")).toBeVisible();
  await page.getByLabel("Файл", { exact: true }).setInputFiles({
    name: fileName, mimeType: "application/json", buffer: Buffer.from('[{"sku":"BAD-SKU","quantity":1}]'),
  });
  await page.getByRole("button", { name: "Завантажити", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Результат імпорту" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Невідомий SKU" })).toBeVisible();
  await expect(page.getByRole("row", { name: /stock\.json.*Відхилено/ })).toBeVisible();
});
