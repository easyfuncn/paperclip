import { Router } from "express";
import { getAgencyTemplates, getAgencyTemplateContent } from "../services/agency-templates.js";

export function agencyTemplatesRoutes() {
  const router = Router();
  router.get("/agency-templates", (_req, res) => {
    const data = getAgencyTemplates();
    res.json(data);
  });
  router.get("/agency-templates/content", (req, res) => {
    const templateId = typeof req.query.templateId === "string" ? req.query.templateId.trim() : "";
    if (!templateId) {
      res.status(400).json({ error: "Missing templateId query parameter" });
      return;
    }
    const content = getAgencyTemplateContent(templateId);
    if (content === null) {
      res.status(404).json({ error: "Template not found or unavailable" });
      return;
    }
    res.type("text/plain; charset=utf-8").send(content);
  });
  return router;
}
