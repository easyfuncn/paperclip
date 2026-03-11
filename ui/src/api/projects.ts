import type { Project, ProjectWorkspace } from "@paperclipai/shared";
import { api } from "./client";

function withCompanyScope(path: string, companyId?: string) {
  if (!companyId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}companyId=${encodeURIComponent(companyId)}`;
}

function projectPath(id: string, companyId?: string, suffix = "") {
  return withCompanyScope(`/projects/${encodeURIComponent(id)}${suffix}`, companyId);
}

export const projectsApi = {
  list: (companyId: string) => api.get<Project[]>(`/companies/${companyId}/projects`),
  get: (id: string, companyId?: string) => api.get<Project>(projectPath(id, companyId)),
  create: (companyId: string, data: Record<string, unknown>) =>
    api.post<Project>(`/companies/${companyId}/projects`, data),
  update: (id: string, data: Record<string, unknown>, companyId?: string) =>
    api.patch<Project>(projectPath(id, companyId), data),
  listWorkspaces: (projectId: string, companyId?: string) =>
    api.get<ProjectWorkspace[]>(projectPath(projectId, companyId, "/workspaces")),
  createWorkspace: (projectId: string, data: Record<string, unknown>, companyId?: string) =>
    api.post<ProjectWorkspace>(projectPath(projectId, companyId, "/workspaces"), data),
  updateWorkspace: (projectId: string, workspaceId: string, data: Record<string, unknown>, companyId?: string) =>
    api.patch<ProjectWorkspace>(
      projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}`),
      data,
    ),
  removeWorkspace: (projectId: string, workspaceId: string, companyId?: string) =>
    api.delete<ProjectWorkspace>(projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}`)),
  remove: (id: string, companyId?: string) => api.delete<Project>(projectPath(id, companyId)),
  listProjectAssets: (projectId: string, companyId?: string) =>
    api.get<{ items: ProjectAssetItem[] }>(projectPath(projectId, companyId, "/assets")),
  listProjectWorkspaceFiles: (projectId: string, companyId?: string, subPath?: string) => {
    const base = projectPath(projectId, companyId, "/files");
    const url = subPath ? `${base}${base.includes("?") ? "&" : "?"}path=${encodeURIComponent(subPath)}` : base;
    return api.get<ProjectWorkspaceFilesResponse>(url);
  },
};

export interface ProjectAssetItem {
  id: string;
  objectKey: string;
  contentType: string;
  byteSize: number;
  originalFilename: string | null;
  createdAt: string;
  contentPath: string;
}

export interface WorkspaceFileEntry {
  name: string;
  type: "file" | "directory";
  path: string;
  size?: number;
}

export interface ProjectWorkspaceFilesResponse {
  workspaceId: string | null;
  path: string;
  entries: WorkspaceFileEntry[];
}
