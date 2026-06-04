import { expect, test } from "@playwright/test";

test.describe("RarePrint storefront", () => {
  test("homepage loads, scrolls on mobile, and key sections are visible", async ({ page }) => {
    await page.goto("/web-to-print");
    await expect(page.locator('header a[href="/web-to-print"]').first()).toBeVisible();
    await expect(page.getByText("Shop By Category")).toBeVisible();

    const before = await page.evaluate(() => window.scrollY);
    await page.evaluate(() => window.scrollBy(0, 900));
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => window.scrollY);
    expect(after).toBeGreaterThan(before);

    await expect(page.getByRole("heading", { name: "Hot Selling" })).toBeVisible();
  });

  test("main navigation opens products", async ({ page }) => {
    await page.goto("/web-to-print");

    await page.getByRole("link", { name: /^(Products|All Products)$/ }).click();
    await expect(page).toHaveURL(/\/web-to-print\/categories/);
    await expect(page.getByRole("heading", { name: /All Print Categories/i })).toBeVisible();
  });

  test("utility pages are reachable", async ({ page }) => {
    for (const path of ["/web-to-print/search", "/web-to-print/cart", "/web-to-print/account", "/web-to-print/track-order"]) {
      await page.goto(path);
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("category and product flow reaches product detail page", async ({ page }) => {
    await page.goto("/web-to-print/categories");
    await page.getByRole("link").filter({ hasText: /Bill Book|Stickers|Letter/i }).first().click();
    await expect(page).toHaveURL(/\/web-to-print\/category\//);

    await page.getByRole("link").filter({ hasText: /Order Now|From|Get Quote/i }).first().click();
    await expect(page).toHaveURL(/\/web-to-print\/product\//);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/Inclusive of All Taxes|Get Quote|Upload Artwork/i).first()).toBeVisible();
  });

  test("product can be added to cart from detail page", async ({ page }) => {
    await page.goto("/web-to-print/product/office-envelope");
    const orderButton = page.getByRole("button", { name: /Add to Cart/i }).first();
    if (await orderButton.count()) {
      await orderButton.click();
      await expect(page.getByText(/Added to cart successfully/i)).toBeVisible();
    } else {
      await expect(page.getByRole("link", { name: /Quote/i }).first()).toBeVisible();
    }
  });

  test("no broken image icons are rendered on homepage", async ({ page }) => {
    await page.goto("/web-to-print");
    const brokenImages = await page.locator("img").evaluateAll((imgs) =>
      imgs.filter((img) => img instanceof HTMLImageElement && img.complete && img.naturalWidth === 0).length,
    );
    expect(brokenImages).toBe(0);
  });
});
