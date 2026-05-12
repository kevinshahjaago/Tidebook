import "./setup";
import request from "supertest";
import { createApp } from "../../app";
import { prisma, truncateAllTables, seedTestData } from "./setup";

const app = createApp();

beforeAll(async () => {
  await truncateAllTables();
  await seedTestData();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function loginAdmin(): Promise<{ accessToken: string; cookie: string }> {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "admin@test.com", password: "TestPass123!" });
  const cookie = res.headers["set-cookie"]?.[0] ?? "";
  return { accessToken: res.body.accessToken, cookie };
}

describe("POST /api/v1/auth/login", () => {
  it("returns access token and sets refresh cookie on valid credentials", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@test.com", password: "TestPass123!" });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.email).toBe("admin@test.com");
    expect(res.body.user.role).toBe("ADMIN");
    // refresh_token should be an httpOnly cookie
    expect(res.headers["set-cookie"]).toBeDefined();
    expect(res.headers["set-cookie"][0]).toContain("refresh_token");
    expect(res.headers["set-cookie"][0]).toContain("HttpOnly");
  });

  it("returns 401 for wrong password", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@test.com", password: "wrongpassword" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns 401 for unknown email", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nobody@test.com", password: "TestPass123!" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("locks account after 5 failed attempts", async () => {
    // Create a separate user to test lockout without affecting other tests
    const bcrypt = await import("bcrypt");
    const hash = await bcrypt.hash("CorrectPass123!", 4);
    await prisma.user.create({
      data: {
        id: "user-lockout-test",
        email: "lockout@test.com",
        passwordHash: hash,
        role: "READ_ONLY",
        isActive: true,
      },
    });

    // 5 failed attempts
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "lockout@test.com", password: "wrong" });
    }

    // 6th attempt with correct password should be locked
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "lockout@test.com", password: "CorrectPass123!" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("ACCOUNT_LOCKED");
  });

  it("returns 400 for invalid email format", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "not-an-email", password: "TestPass123!" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/v1/auth/refresh", () => {
  it("issues a new access token when refresh cookie is valid", async () => {
    const { cookie } = await loginAdmin();

    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    // A new refresh cookie should be set (token rotation)
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("returns 401 when no refresh cookie is present", async () => {
    const res = await request(app).post("/api/v1/auth/refresh");
    expect(res.status).toBe(401);
  });

  it("invalidates old refresh token after rotation (replay attack prevention)", async () => {
    const { cookie } = await loginAdmin();

    // First refresh — valid
    const first = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", cookie);
    expect(first.status).toBe(200);

    // Replay original cookie — tokenVersion has been incremented, must fail
    const replay = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", cookie);
    expect(replay.status).toBe(401);
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("clears cookie and invalidates token via tokenVersion increment", async () => {
    const { accessToken, cookie } = await loginAdmin();

    const logoutRes = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(logoutRes.status).toBe(200);

    // Old access token should now be rejected on a protected route
    const protectedRes = await request(app)
      .get("/api/v1/admin/bookings")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(protectedRes.status).toBe(401);
  });

  it("returns 401 when no access token is provided", async () => {
    const res = await request(app).post("/api/v1/auth/logout");
    expect(res.status).toBe(401);
  });
});

describe("Admin route protection", () => {
  it("returns 401 when accessing admin route without token", async () => {
    const res = await request(app).get("/api/v1/admin/bookings");
    expect(res.status).toBe(401);
  });

  it("returns 200 when accessing admin route with valid token", async () => {
    const { accessToken } = await loginAdmin();
    const res = await request(app)
      .get("/api/v1/admin/bookings")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });

  it("returns 403 when a READ_ONLY user attempts a confirm action", async () => {
    const bcrypt = await import("bcrypt");
    const hash = await bcrypt.hash("ReadOnly123!", 4);
    await prisma.user.create({
      data: {
        id: "user-readonly-test",
        email: "readonly@test.com",
        passwordHash: hash,
        role: "READ_ONLY",
        isActive: true,
      },
    });

    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "readonly@test.com", password: "ReadOnly123!" });

    const { accessToken } = loginRes.body;

    const res = await request(app)
      .post("/api/v1/admin/bookings/fake-id/confirm")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});
