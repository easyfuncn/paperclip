import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { agencyTemplatesRoutes } from "../routes/agency-templates.js";

function createApp() {
  const app = express();
  app.use("/api", agencyTemplatesRoutes());
  return app;
}

describe("GET /api/agency-templates", () => {
  it("returns divisions and templatesByDivision", async () => {
    const app = createApp();
    const res = await request(app).get("/api/agency-templates");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("divisions");
    expect(res.body).toHaveProperty("templatesByDivision");
    expect(Array.isArray(res.body.divisions)).toBe(true);
    expect(typeof res.body.templatesByDivision).toBe("object");
  });
});
