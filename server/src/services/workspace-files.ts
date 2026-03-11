import path from "node:path";
import fs from "node:fs/promises";
import type { ProjectWorkspace } from "@paperclipai/shared";

export interface WorkspaceFileEntry {
  name: string;
  type: "file" | "directory";
  path: string;
  size?: number;
}

const SEP = path.sep;

/**
 * Resolve a relative path under baseDir. Returns null if path escapes.
 */
export function resolveUnder(baseDir: string, relativePath: string): string | null {
  const normalized = path.normalize(relativePath);
  if (normalized.includes("..") || path.isAbsolute(normalized)) return null;
  const resolved = path.resolve(baseDir, normalized);
  const baseSlash = baseDir.endsWith(SEP) ? baseDir : baseDir + SEP;
  if (resolved !== baseDir && !resolved.startsWith(baseSlash)) return null;
  return resolved;
}

/**
 * List directory entries under workspace cwd. Returns [] if cwd missing or not a directory.
 */
export async function listWorkspaceDirectory(
  workspace: ProjectWorkspace,
  subPath = "",
): Promise<WorkspaceFileEntry[]> {
  const cwd = workspace.cwd?.trim();
  if (!cwd) return [];
  const dirPath = subPath ? resolveUnder(cwd, subPath) : cwd;
  if (!dirPath) return [];
  try {
    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) return [];
  } catch {
    return [];
  }
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const result: WorkspaceFileEntry[] = [];
  for (const e of entries) {
    const entryPath = subPath ? `${subPath.replace(/\/$/, "")}/${e.name}` : e.name;
    const fullPath = path.join(dirPath, e.name);
    if (e.isDirectory()) {
      result.push({ name: e.name, type: "directory", path: entryPath });
    } else if (e.isFile()) {
      let size: number | undefined;
      try {
        size = (await fs.stat(fullPath)).size;
      } catch {
        /* ignore */
      }
      result.push({ name: e.name, type: "file", path: entryPath, size });
    }
  }
  return result.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

/**
 * Resolve workspace that has cwd for a project (primary first).
 */
export function getWorkspaceWithCwd(workspaces: ProjectWorkspace[]): ProjectWorkspace | null {
  const primary = workspaces.find((w) => w.isPrimary) ?? workspaces[0] ?? null;
  if (primary?.cwd?.trim()) return primary;
  return workspaces.find((w) => w.cwd?.trim()) ?? null;
}
