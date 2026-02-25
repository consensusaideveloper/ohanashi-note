import { test } from "@playwright/test";

test("capture homepage screenshot", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: "e2e/screenshots/homepage.png",
    fullPage: true,
  });
});
