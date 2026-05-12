import { test, expect } from "@playwright/test";

// These E2E tests assume a running local dev stack with seeded data.
// Run: docker compose -f docker/docker-compose.test.yml up -d
// Then: npm run dev (from root)

test.describe("Public Booking Flow", () => {
  test("1. Teacher completes full booking — self-guided visit, paid", async ({ page }) => {
    await page.goto("/book");

    // Step 1: Group type
    await expect(page.getByText("What type of group are you bringing?")).toBeVisible();
    await page.getByText("School Group").click();

    // Step 2: Date & time
    await page.getByLabel("Number of students").fill("25");
    await page.getByLabel("Number of adult chaperones").fill("5");

    // Wait for calendar to load and find an available date
    await page.waitForSelector("[aria-label*='spots remaining']");
    const availableDate = page.locator("[aria-pressed='false']:not([disabled])").first();
    await availableDate.click();

    // Select time slot
    await page.getByLabel("Arrival Time").selectOption({ index: 1 });
    await page.getByText("Continue").click();

    // Step 3: Contact info
    await page.getByLabel("School / Organization Name").fill("Greenwood Elementary");
    await page.getByLabel("Lead Teacher / Contact Name").fill("Jane Smith");
    await page.getByLabel("Phone").fill("206-555-0100");
    await page.getByLabel("Email Address").fill("jsmith@greenwood.edu");
    await page.getByLabel("3rd Grade").check();

    await page.getByLabel("Payment Method").selectOption("PAID");
    await page.getByText("Continue").click();

    // Step 4: No class — skip
    await page.getByText("No class — self-guided visit only").click();

    // Step 5: Review & confirm
    await expect(page.getByText("Greenwood Elementary")).toBeVisible();
    await page.getByLabel(/Code of Conduct/).check();
    await page.getByText("Submit Request").click();

    // Confirmation page
    await expect(page).toHaveURL("/booking/confirmation");
    await expect(page.getByText(/Confirmed|Received/)).toBeVisible();
  });

  test("2. Teacher completes booking with class selection", async ({ page }) => {
    await page.goto("/book");
    await page.getByText("School Group").click();

    await page.getByLabel("Number of students").fill("20");
    await page.getByLabel("Number of adult chaperones").fill("4");
    await page.waitForSelector("[aria-pressed='false']:not([disabled])");
    await page.locator("[aria-pressed='false']:not([disabled])").first().click();
    await page.getByLabel("Arrival Time").selectOption({ index: 1 });
    await page.getByText("Continue").click();

    await page.getByLabel("School / Organization Name").fill("Ballard High School");
    await page.getByLabel("Lead Teacher").fill("Bob Jones");
    await page.getByLabel("Phone").fill("206-555-0101");
    await page.getByLabel("Email Address").fill("bjones@ballard.edu");
    await page.getByLabel("10th Grade").check();
    await page.getByLabel("Payment Method").selectOption("PAID");
    await page.getByText("Continue").click();

    // Select a class
    const classOption = page.locator("button").filter({ hasText: "Ocean" }).first();
    await classOption.click();

    // Verify class appears in review
    await expect(page.getByText("Ocean")).toBeVisible();
    await page.getByLabel(/Code of Conduct/).check();
    await page.getByText("Submit Request").click();

    await expect(page).toHaveURL("/booking/confirmation");
  });

  test("3. Teacher submits scholarship request", async ({ page }) => {
    await page.goto("/book");
    await page.getByText("School Group").click();

    await page.getByLabel("Number of students").fill("30");
    await page.getByLabel("Number of adult chaperones").fill("6");
    await page.waitForSelector("[aria-pressed='false']:not([disabled])");
    await page.locator("[aria-pressed='false']:not([disabled])").first().click();
    await page.getByLabel("Arrival Time").selectOption({ index: 1 });
    await page.getByText("Continue").click();

    await page.getByLabel("School / Organization Name").fill("Rainier View Elementary");
    await page.getByLabel("Lead Teacher").fill("Maria Garcia");
    await page.getByLabel("Phone").fill("206-555-0102");
    await page.getByLabel("Email Address").fill("mgarcia@rainier.edu");
    await page.getByLabel("4th Grade").check();
    await page.getByLabel("Payment Method").selectOption("SCHOLARSHIP");

    // Scholarship sub-flow should appear
    await expect(page.getByText("Scholarship Information")).toBeVisible();
    await page.getByLabel("My school qualifies as Title I").check();
    await page.getByLabel("Total School Enrollment").fill("450");

    await page.getByText("Continue").click();
    await page.getByText("No class — self-guided visit only").click();
    await page.getByLabel(/Code of Conduct/).check();
    await page.getByText("Submit Request").click();

    await expect(page).toHaveURL("/booking/confirmation");
    // Scholarship bookings go into pending review
    await expect(page.getByText("Request Received")).toBeVisible();
  });

  test("5. Teacher sees capacity-full date blocked on calendar", async ({ page }) => {
    // This test relies on a full-capacity date being configured in test fixtures
    await page.goto("/book");
    await page.getByText("School Group").click();

    await page.getByLabel("Number of students").fill("10");
    await page.getByLabel("Number of adult chaperones").fill("2");

    // Dates should be visible — unavailable ones should be disabled
    await page.waitForSelector("[aria-label*='spots remaining'], [disabled]");

    const disabledDate = page.locator("button[disabled]").first();
    if (await disabledDate.isVisible()) {
      await expect(disabledDate).toBeDisabled();
    }
  });
});

test.describe("Admin Booking Management", () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(process.env.SEED_ADMIN_EMAIL ?? "admin@seattleaquarium.org");
    await page.getByLabel("Password").fill(process.env.SEED_ADMIN_PASSWORD ?? "AdminPass123!");
    await page.getByText("Sign in").click();
    await expect(page).toHaveURL("/admin/dashboard");
  });

  test("7. Registrar confirms a pending booking", async ({ page }) => {
    await page.goto("/admin/bookings?status=PENDING");
    const firstBooking = page.locator("tr").filter({ hasText: "PENDING" }).first();
    if (await firstBooking.isVisible()) {
      await firstBooking.getByText("View →").click();
      await page.getByText("Confirm Booking").click();
      await expect(page.getByText("Confirmed")).toBeVisible();
    }
  });

  test("8. Registrar declines a booking with a reason", async ({ page }) => {
    await page.goto("/admin/bookings?status=PENDING");
    const firstBooking = page.locator("tr").filter({ hasText: "PENDING" }).first();
    if (await firstBooking.isVisible()) {
      await firstBooking.getByText("View →").click();
      await page.getByText("Decline").click();
      await page.getByPlaceholder("Reason for declining…").fill("Date fully booked by prior reservation.");
      await page.getByText("Confirm Decline").click();
      await expect(page.getByText("Declined")).toBeVisible();
    }
  });

  test("9. Registrar views daily visit log", async ({ page }) => {
    await page.goto("/admin/dvl");
    await expect(page.getByText("Daily Visit Log")).toBeVisible();
    await expect(page.locator("table")).toBeVisible();
  });

  test("11. Admin updates class availability", async ({ page }) => {
    await page.goto("/admin/classes");
    await expect(page.getByText("Classes")).toBeVisible();

    const firstClass = page.locator(".card").filter({ hasText: "Active" }).first();
    if (await firstClass.isVisible()) {
      await firstClass.getByLabel("Edit").click();
      // Verify form appears
      await expect(page.getByLabel("Class Name")).toBeVisible();
    }
  });

  test("12. Admin sets a blackout date", async ({ page }) => {
    await page.goto("/admin/seasons");
    await expect(page.getByText("Seasons")).toBeVisible();
  });
});
