import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Default root for agency-agents repo (git submodule or copy).
 * Resolves to repo root: from server/src/services or server/dist/services we go up to repo, then vendor/agency-agents.
 * Override with AGENCY_AGENTS_DIR.
 */
export function getAgencyAgentsDir(): string | null {
  const fromEnv = process.env.AGENCY_AGENTS_DIR?.trim();
  if (fromEnv) {
    const resolved = path.resolve(fromEnv);
    return fs.existsSync(resolved) && fs.statSync(resolved).isDirectory() ? resolved : null;
  }
  // From server/src/services or server/dist/services -> ../../.. = server, ../../../.. = repo root (monorepo)
  const serverRoot = path.join(__dirname, "..", "..");
  const repoRoot = path.join(serverRoot, "..");
  const candidates = [
    path.join(repoRoot, "vendor", "agency-agents"),
    path.resolve(process.cwd(), "vendor", "agency-agents"),
  ];
  for (const dir of candidates) {
    const resolved = path.resolve(dir);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) return resolved;
  }
  return null;
}

const MANIFEST_PATH = path.join(__dirname, "..", "..", "agency-agents-manifest.json");

export interface DivisionEntry {
  id: string;
  label: string;
  order: number;
}

export interface TemplateEntry {
  id: string;
  division: string;
  name: string;
  role: string;
  path: string;
}

export interface AgencyTemplatesManifest {
  divisions: DivisionEntry[];
  templates: TemplateEntry[];
}

function loadManifest(): AgencyTemplatesManifest | null {
  if (!fs.existsSync(MANIFEST_PATH)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8")) as unknown;
    if (
      raw &&
      typeof raw === "object" &&
      Array.isArray((raw as AgencyTemplatesManifest).divisions) &&
      Array.isArray((raw as AgencyTemplatesManifest).templates)
    ) {
      return raw as AgencyTemplatesManifest;
    }
  } catch {
    // invalid or missing
  }
  return null;
}

export interface AgencyTemplatePublic {
  id: string;
  name: string;
  role: string;
}

export interface AgencyTemplatesResponse {
  divisions: DivisionEntry[];
  templatesByDivision: Record<string, AgencyTemplatePublic[]>;
}

/**
 * Returns agency templates grouped by division. Only includes templates whose file exists under AGENCY_AGENTS_DIR.
 */
export function getAgencyTemplates(): AgencyTemplatesResponse {
  const baseDir = getAgencyAgentsDir();
  const manifest = loadManifest();
  if (!baseDir || !manifest) {
    return { divisions: [], templatesByDivision: {} };
  }
  const divisionMap = new Map<string, DivisionEntry>();
  for (const d of manifest.divisions) {
    divisionMap.set(d.id, d);
  }
  const templatesByDivision: Record<string, AgencyTemplatePublic[]> = {};
  for (const t of manifest.templates) {
    const absPath = path.join(baseDir, t.path);
    const normalized = path.resolve(absPath);
    if (!normalized.startsWith(path.resolve(baseDir)) || normalized === path.resolve(baseDir)) continue;
    if (!fs.existsSync(normalized) || !fs.statSync(normalized).isFile()) continue;
    const list = templatesByDivision[t.division] ?? [];
    list.push({ id: t.id, name: t.name, role: t.role });
    templatesByDivision[t.division] = list;
  }
  const divisionsWithTemplates = manifest.divisions.filter((d) => (templatesByDivision[d.id]?.length ?? 0) > 0);
  return {
    divisions: divisionsWithTemplates,
    templatesByDivision,
  };
}

/**
 * Resolves agencyTemplateId to an absolute instructions file path. Returns null if id invalid or path outside base.
 */
export function resolveAgencyTemplatePath(agencyTemplateId: string): string | null {
  const baseDir = getAgencyAgentsDir();
  const manifest = loadManifest();
  if (!baseDir || !manifest) return null;
  const template = manifest.templates.find((t) => t.id === agencyTemplateId);
  if (!template) return null;
  const absPath = path.resolve(baseDir, template.path);
  if (!absPath.startsWith(path.resolve(baseDir)) || absPath === path.resolve(baseDir)) return null;
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) return null;
  return absPath;
}

/**
 * Returns the raw markdown content of a template file, or null if not found/invalid.
 */
export function getAgencyTemplateContent(agencyTemplateId: string): string | null {
  const absPath = resolveAgencyTemplatePath(agencyTemplateId);
  if (!absPath) return null;
  try {
    return fs.readFileSync(absPath, "utf-8");
  } catch {
    return null;
  }
}
