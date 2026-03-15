import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useParams, useNavigate, useLocation, Navigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PROJECT_COLORS, isUuidLike } from "@paperclipai/shared";
import { FileText, ImageIcon, Film, Folder, ChevronLeft } from "lucide-react";
import { projectsApi, type WorkspaceFileEntry } from "../api/projects";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { heartbeatsApi } from "../api/heartbeats";
import { assetsApi } from "../api/assets";
import { usePanel } from "../context/PanelContext";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { ProjectProperties, type ProjectConfigFieldKey, type ProjectFieldSaveState } from "../components/ProjectProperties";
import { InlineEditor } from "../components/InlineEditor";
import { StatusBadge } from "../components/StatusBadge";
import { IssuesList } from "../components/IssuesList";
import { MarkdownBody } from "../components/MarkdownBody";
import { PageSkeleton } from "../components/PageSkeleton";
import { PageTabBar } from "../components/PageTabBar";
import { projectRouteRef, cn } from "../lib/utils";
import { Tabs } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { PluginLauncherOutlet } from "@/plugins/launchers";
import { PluginSlotMount, PluginSlotOutlet, usePluginSlots } from "@/plugins/slots";

/* ── Top-level tab types ── */

type ProjectBaseTab = "overview" | "list" | "configuration";
type ProjectPluginTab = `plugin:${string}`;
type ProjectTab = ProjectBaseTab | ProjectPluginTab;

function isProjectPluginTab(value: string | null): value is ProjectPluginTab {
  return typeof value === "string" && value.startsWith("plugin:");
}

function resolveProjectTab(pathname: string, projectId: string): ProjectTab | null {
  const segments = pathname.split("/").filter(Boolean);
  const projectsIdx = segments.indexOf("projects");
  if (projectsIdx === -1 || segments[projectsIdx + 1] !== projectId) return null;
  const tab = segments[projectsIdx + 2];
  if (tab === "overview") return "overview";
  if (tab === "configuration") return "configuration";
  if (tab === "issues") return "list";
  return null;
}

/** Preview item: either from workspace file list or project assets. */
interface PreviewFileItem {
  name: string;
  contentPath: string;
}

/** Classify by filename/contentType for preview: md, image, or video. */
function getPreviewType(item: { name?: string | null; contentType?: string | null }): "md" | "image" | "video" | null {
  const ct = (item.contentType ?? "").toLowerCase();
  const name = (item.name ?? "").toLowerCase();
  if (ct.startsWith("image/") || /\.(jpe?g|png|gif|webp|avif|svg)$/i.test(name)) return "image";
  if (ct.startsWith("video/") || /\.(mp4|webm|ogg|mov|avi)$/i.test(name)) return "video";
  if (
    ct.includes("markdown") ||
    ct === "text/markdown" ||
    ct.startsWith("text/") ||
    /\.mdx?$/i.test(name)
  )
    return "md";
  return null;
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── File preview dialog (md / image / video) ── */

function FilePreviewDialog({
  item,
  previewType,
  open,
  onOpenChange,
}: {
  item: PreviewFileItem | null;
  previewType: "md" | "image" | "video" | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [mdContent, setMdContent] = useState<string | null>(null);
  const [mdError, setMdError] = useState<string | null>(null);
  const [mdLoading, setMdLoading] = useState(false);

  useEffect(() => {
    if (!open || !item || previewType !== "md") {
      setMdContent(null);
      setMdError(null);
      setMdLoading(false);
      return;
    }
    setMdLoading(true);
    setMdError(null);
    fetch(item.contentPath, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText || "Failed to load");
        return res.text();
      })
      .then((text) => {
        setMdContent(text);
        setMdError(null);
      })
      .catch((err) => {
        setMdError(err instanceof Error ? err.message : "Failed to load content");
        setMdContent(null);
      })
      .finally(() => setMdLoading(false));
  }, [open, item?.contentPath, previewType]);

  if (!item) return null;
  const title = item.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex flex-col max-w-[90vw] max-h-[90vh] w-full overflow-hidden",
          previewType === "image" && "p-2",
          (previewType === "video" || previewType === "md") && "max-w-4xl"
        )}
        showCloseButton
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {previewType === "image" && (
          <div className="flex-1 min-h-0 flex items-center justify-center overflow-auto">
            <img
              src={item.contentPath}
              alt={title}
              className="max-w-full max-h-full w-auto h-auto object-contain"
            />
          </div>
        )}
        {previewType === "video" && (
          <div className="flex-1 min-h-0 flex items-center justify-center rounded-md overflow-hidden bg-muted">
            <video
              src={item.contentPath}
              controls
              preload="metadata"
              className="max-w-full max-h-full w-auto h-auto object-contain"
            />
          </div>
        )}
        {previewType === "md" && (
          <div className="flex-1 min-h-0 overflow-auto">
            {mdLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
            {mdError && <p className="text-sm text-destructive">{mdError}</p>}
            {mdContent != null && !mdError && (
              <div className="prose prose-sm dark:prose-invert max-w-none pr-4">
                <MarkdownBody>{mdContent}</MarkdownBody>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Overview tab content ── */

function OverviewContent({
  project,
  projectId,
  companyId,
  onUpdate,
  imageUploadHandler,
}: {
  project: { description: string | null; status: string; targetDate: string | null };
  projectId: string;
  companyId: string | null;
  onUpdate: (data: Record<string, unknown>) => void;
  imageUploadHandler?: (file: File) => Promise<string>;
}) {
  const [preview, setPreview] = useState<{ item: PreviewFileItem; type: "md" | "image" | "video" } | null>(null);
  const [currentPath, setCurrentPath] = useState("");
  const { data: filesData, isLoading: filesLoading } = useQuery({
    queryKey: queryKeys.projects.workspaceFiles(projectId, currentPath),
    queryFn: () =>
      projectsApi.listProjectWorkspaceFiles(
        projectId,
        companyId ?? undefined,
        currentPath || undefined,
      ),
    enabled: !!projectId,
  });
  const entries: WorkspaceFileEntry[] = filesData?.entries ?? [];
  const parentPath = currentPath.includes("/") ? currentPath.replace(/\/[^/]+$/, "") : "";
  const pathSegments = currentPath ? currentPath.split("/").filter(Boolean) : [];

  return (
    <div className="space-y-6">
      <InlineEditor
        value={project.description ?? ""}
        onSave={(description) => onUpdate({ description })}
        as="p"
        className="text-sm text-muted-foreground"
        placeholder="Add a description..."
        multiline
        imageUploadHandler={imageUploadHandler}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">Status</span>
          <div className="mt-1">
            <StatusBadge status={project.status} />
          </div>
        </div>
        {project.targetDate && (
          <div>
            <span className="text-muted-foreground">Target Date</span>
            <p>{project.targetDate}</p>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <h3 className="text-sm font-medium text-foreground">Workspace files</h3>
          {pathSegments.length > 0 ? (
            <nav className="flex items-center gap-1 text-sm text-muted-foreground" aria-label="Breadcrumb">
              <button
                type="button"
                onClick={() => setCurrentPath("")}
                className="hover:text-foreground transition-colors"
              >
                root
              </button>
              {pathSegments.map((segment, i) => {
                const toPath = pathSegments.slice(0, i + 1).join("/");
                return (
                  <span key={toPath} className="flex items-center gap-1">
                    <span>/</span>
                    <button
                      type="button"
                      onClick={() => setCurrentPath(toPath)}
                      className={i < pathSegments.length - 1 ? "hover:text-foreground transition-colors" : "text-foreground"}
                    >
                      {segment}
                    </button>
                  </span>
                );
              })}
            </nav>
          ) : null}
        </div>
        {filesLoading ? (
          <p className="text-sm text-muted-foreground">Loading files...</p>
        ) : !filesData?.workspaceId ? (
          <p className="text-sm text-muted-foreground">No workspace directory configured. Add a workspace with a path (cwd) to list files.</p>
        ) : (
          <ul className="border border-border rounded-md divide-y divide-border">
            {currentPath ? (
              <li>
                <button
                  type="button"
                  onClick={() => setCurrentPath(parentPath)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/80 transition-colors"
                >
                  <ChevronLeft className="shrink-0 size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">..</span>
                </button>
              </li>
            ) : null}
            {entries.map((entry) => {
              if (entry.type === "directory") {
                return (
                  <li key={entry.path}>
                    <button
                      type="button"
                      onClick={() => setCurrentPath(entry.path)}
                      className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/80 transition-colors"
                    >
                      <Folder className="shrink-0 size-4 text-muted-foreground" />
                      <span className="flex-1 truncate">{entry.name}</span>
                    </button>
                  </li>
                );
              }
              const previewType = getPreviewType({ name: entry.name });
              const contentPath = `/api/projects/${encodeURIComponent(projectId)}/files/content?path=${encodeURIComponent(entry.path)}`;
              const item: PreviewFileItem = { name: entry.name, contentPath };
              const Icon =
                previewType === "md" ? FileText : previewType === "image" ? ImageIcon : previewType === "video" ? Film : FileText;
              return (
                <li key={entry.path}>
                  <button
                    type="button"
                    onClick={() => {
                      if (previewType) setPreview({ item, type: previewType });
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 text-left text-sm rounded-none transition-colors",
                      previewType
                        ? "hover:bg-muted/80 cursor-pointer"
                        : "cursor-default opacity-70"
                    )}
                  >
                    <Icon className="shrink-0 size-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{entry.name}</span>
                    {entry.size != null && (
                      <span className="text-muted-foreground shrink-0">{formatByteSize(entry.size)}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {filesData?.workspaceId && entries.length === 0 && !currentPath ? (
          <p className="text-sm text-muted-foreground mt-2">Workspace directory is empty.</p>
        ) : null}
        {filesData?.workspaceId && entries.length === 0 && currentPath ? (
          <p className="text-sm text-muted-foreground mt-2">This folder is empty.</p>
        ) : null}
      </div>

      <FilePreviewDialog
        item={preview?.item ?? null}
        previewType={preview?.type ?? null}
        open={!!preview}
        onOpenChange={(open) => !open && setPreview(null)}
      />
    </div>
  );
}

/* ── Color picker popover ── */

function ColorPicker({
  currentColor,
  onSelect,
}: {
  currentColor: string;
  onSelect: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="shrink-0 h-5 w-5 rounded-md cursor-pointer hover:ring-2 hover:ring-foreground/20 transition-[box-shadow]"
        style={{ backgroundColor: currentColor }}
        aria-label="Change project color"
      />
      {open && (
        <div className="absolute top-full left-0 mt-2 p-2 bg-popover border border-border rounded-lg shadow-lg z-50 w-max">
          <div className="grid grid-cols-5 gap-1.5">
            {PROJECT_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => {
                  onSelect(color);
                  setOpen(false);
                }}
                className={`h-6 w-6 rounded-md cursor-pointer transition-[transform,box-shadow] duration-150 hover:scale-110 ${
                  color === currentColor
                    ? "ring-2 ring-foreground ring-offset-1 ring-offset-background"
                    : "hover:ring-2 hover:ring-foreground/30"
                }`}
                style={{ backgroundColor: color }}
                aria-label={`Select color ${color}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── List (issues) tab content ── */

function ProjectIssuesList({ projectId, companyId }: { projectId: string; companyId: string }) {
  const queryClient = useQueryClient();

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(companyId),
    queryFn: () => heartbeatsApi.liveRunsForCompany(companyId),
    enabled: !!companyId,
    refetchInterval: 5000,
  });

  const liveIssueIds = useMemo(() => {
    const ids = new Set<string>();
    for (const run of liveRuns ?? []) {
      if (run.issueId) ids.add(run.issueId);
    }
    return ids;
  }, [liveRuns]);

  const { data: issues, isLoading, error } = useQuery({
    queryKey: queryKeys.issues.listByProject(companyId, projectId),
    queryFn: () => issuesApi.list(companyId, { projectId }),
    enabled: !!companyId,
  });

  const updateIssue = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      issuesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listByProject(companyId, projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId) });
    },
  });

  return (
    <IssuesList
      issues={issues ?? []}
      isLoading={isLoading}
      error={error as Error | null}
      agents={agents}
      liveIssueIds={liveIssueIds}
      projectId={projectId}
      viewStateKey={`paperclip:project-view:${projectId}`}
      onUpdateIssue={(id, data) => updateIssue.mutate({ id, data })}
    />
  );
}

/* ── Main project page ── */

export function ProjectDetail() {
  const { companyPrefix, projectId, filter } = useParams<{
    companyPrefix?: string;
    projectId: string;
    filter?: string;
  }>();
  const { companies, selectedCompanyId, setSelectedCompanyId } = useCompany();
  const { closePanel } = usePanel();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [fieldSaveStates, setFieldSaveStates] = useState<Partial<Record<ProjectConfigFieldKey, ProjectFieldSaveState>>>({});
  const fieldSaveRequestIds = useRef<Partial<Record<ProjectConfigFieldKey, number>>>({});
  const fieldSaveTimers = useRef<Partial<Record<ProjectConfigFieldKey, ReturnType<typeof setTimeout>>>>({});
  const routeProjectRef = projectId ?? "";
  const routeCompanyId = useMemo(() => {
    if (!companyPrefix) return null;
    const requestedPrefix = companyPrefix.toUpperCase();
    return companies.find((company) => company.issuePrefix.toUpperCase() === requestedPrefix)?.id ?? null;
  }, [companies, companyPrefix]);
  const lookupCompanyId = routeCompanyId ?? selectedCompanyId ?? undefined;
  const canFetchProject = routeProjectRef.length > 0 && (isUuidLike(routeProjectRef) || Boolean(lookupCompanyId));
  const activeRouteTab = routeProjectRef ? resolveProjectTab(location.pathname, routeProjectRef) : null;
  const pluginTabFromSearch = useMemo(() => {
    const tab = new URLSearchParams(location.search).get("tab");
    return isProjectPluginTab(tab) ? tab : null;
  }, [location.search]);
  const activeTab = activeRouteTab ?? pluginTabFromSearch;

  const { data: project, isLoading, error } = useQuery({
    queryKey: [...queryKeys.projects.detail(routeProjectRef), lookupCompanyId ?? null],
    queryFn: () => projectsApi.get(routeProjectRef, lookupCompanyId),
    enabled: canFetchProject,
  });
  const canonicalProjectRef = project ? projectRouteRef(project) : routeProjectRef;
  const projectLookupRef = project?.id ?? routeProjectRef;
  const resolvedCompanyId = project?.companyId ?? selectedCompanyId;
  const {
    slots: pluginDetailSlots,
    isLoading: pluginDetailSlotsLoading,
  } = usePluginSlots({
    slotTypes: ["detailTab"],
    entityType: "project",
    companyId: resolvedCompanyId,
    enabled: !!resolvedCompanyId,
  });
  const pluginTabItems = useMemo(
    () => pluginDetailSlots.map((slot) => ({
      value: `plugin:${slot.pluginKey}:${slot.id}` as ProjectPluginTab,
      label: slot.displayName,
      slot,
    })),
    [pluginDetailSlots],
  );
  const activePluginTab = pluginTabItems.find((item) => item.value === activeTab) ?? null;

  useEffect(() => {
    if (!project?.companyId || project.companyId === selectedCompanyId) return;
    setSelectedCompanyId(project.companyId, { source: "route_sync" });
  }, [project?.companyId, selectedCompanyId, setSelectedCompanyId]);

  const invalidateProject = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(routeProjectRef) });
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectLookupRef) });
    if (resolvedCompanyId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.list(resolvedCompanyId) });
    }
  };

  const updateProject = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      projectsApi.update(projectLookupRef, data, resolvedCompanyId ?? lookupCompanyId),
    onSuccess: invalidateProject,
  });

  const uploadImage = useMutation({
    mutationFn: async (file: File) => {
      if (!resolvedCompanyId) throw new Error("No company selected");
      return assetsApi.uploadImage(resolvedCompanyId, file, `projects/${projectLookupRef || "draft"}`);
    },
    onSuccess: () => {
      if (projectLookupRef) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.assets(projectLookupRef) });
      }
    },
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: "Projects", href: "/projects" },
      { label: project?.name ?? routeProjectRef ?? "Project" },
    ]);
  }, [setBreadcrumbs, project, routeProjectRef]);

  useEffect(() => {
    if (!project) return;
    if (routeProjectRef === canonicalProjectRef) return;
    if (isProjectPluginTab(activeTab)) {
      navigate(`/projects/${canonicalProjectRef}?tab=${encodeURIComponent(activeTab)}`, { replace: true });
      return;
    }
    if (activeTab === "overview") {
      navigate(`/projects/${canonicalProjectRef}/overview`, { replace: true });
      return;
    }
    if (activeTab === "configuration") {
      navigate(`/projects/${canonicalProjectRef}/configuration`, { replace: true });
      return;
    }
    if (activeTab === "list") {
      if (filter) {
        navigate(`/projects/${canonicalProjectRef}/issues/${filter}`, { replace: true });
        return;
      }
      navigate(`/projects/${canonicalProjectRef}/issues`, { replace: true });
      return;
    }
    navigate(`/projects/${canonicalProjectRef}`, { replace: true });
  }, [project, routeProjectRef, canonicalProjectRef, activeTab, filter, navigate]);

  useEffect(() => {
    closePanel();
    return () => closePanel();
  }, [closePanel]);

  useEffect(() => {
    return () => {
      Object.values(fieldSaveTimers.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
    };
  }, []);

  const setFieldState = useCallback((field: ProjectConfigFieldKey, state: ProjectFieldSaveState) => {
    setFieldSaveStates((current) => ({ ...current, [field]: state }));
  }, []);

  const scheduleFieldReset = useCallback((field: ProjectConfigFieldKey, delayMs: number) => {
    const existing = fieldSaveTimers.current[field];
    if (existing) clearTimeout(existing);
    fieldSaveTimers.current[field] = setTimeout(() => {
      setFieldSaveStates((current) => {
        const next = { ...current };
        delete next[field];
        return next;
      });
      delete fieldSaveTimers.current[field];
    }, delayMs);
  }, []);

  const updateProjectField = useCallback(async (field: ProjectConfigFieldKey, data: Record<string, unknown>) => {
    const requestId = (fieldSaveRequestIds.current[field] ?? 0) + 1;
    fieldSaveRequestIds.current[field] = requestId;
    setFieldState(field, "saving");
    try {
      await projectsApi.update(projectLookupRef, data, resolvedCompanyId ?? lookupCompanyId);
      invalidateProject();
      if (fieldSaveRequestIds.current[field] !== requestId) return;
      setFieldState(field, "saved");
      scheduleFieldReset(field, 1800);
    } catch (error) {
      if (fieldSaveRequestIds.current[field] !== requestId) return;
      setFieldState(field, "error");
      scheduleFieldReset(field, 3000);
      throw error;
    }
  }, [invalidateProject, lookupCompanyId, projectLookupRef, resolvedCompanyId, scheduleFieldReset, setFieldState]);

  if (pluginTabFromSearch && !pluginDetailSlotsLoading && !activePluginTab) {
    return <Navigate to={`/projects/${canonicalProjectRef}/issues`} replace />;
  }

  // Redirect bare /projects/:id to /projects/:id/issues
  if (routeProjectRef && activeTab === null) {
    return <Navigate to={`/projects/${canonicalProjectRef}/issues`} replace />;
  }

  if (isLoading) return <PageSkeleton variant="detail" />;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;
  if (!project) return null;

  const handleTabChange = (tab: ProjectTab) => {
    if (isProjectPluginTab(tab)) {
      navigate(`/projects/${canonicalProjectRef}?tab=${encodeURIComponent(tab)}`);
      return;
    }
    if (tab === "overview") {
      navigate(`/projects/${canonicalProjectRef}/overview`);
    } else if (tab === "configuration") {
      navigate(`/projects/${canonicalProjectRef}/configuration`);
    } else {
      navigate(`/projects/${canonicalProjectRef}/issues`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="h-7 flex items-center">
          <ColorPicker
            currentColor={project.color ?? "#6366f1"}
            onSelect={(color) => updateProject.mutate({ color })}
          />
        </div>
        <InlineEditor
          value={project.name}
          onSave={(name) => updateProject.mutate({ name })}
          as="h2"
          className="text-xl font-bold"
        />
      </div>

      <PluginSlotOutlet
        slotTypes={["toolbarButton", "contextMenuItem"]}
        entityType="project"
        context={{
          companyId: resolvedCompanyId ?? null,
          companyPrefix: companyPrefix ?? null,
          projectId: project.id,
          projectRef: canonicalProjectRef,
          entityId: project.id,
          entityType: "project",
        }}
        className="flex flex-wrap gap-2"
        itemClassName="inline-flex"
        missingBehavior="placeholder"
      />

      <PluginLauncherOutlet
        placementZones={["toolbarButton"]}
        entityType="project"
        context={{
          companyId: resolvedCompanyId ?? null,
          companyPrefix: companyPrefix ?? null,
          projectId: project.id,
          projectRef: canonicalProjectRef,
          entityId: project.id,
          entityType: "project",
        }}
        className="flex flex-wrap gap-2"
        itemClassName="inline-flex"
      />

      <Tabs value={activeTab ?? "list"} onValueChange={(value) => handleTabChange(value as ProjectTab)}>
        <PageTabBar
          items={[
            { value: "overview", label: "Overview" },
            { value: "list", label: "List" },
            { value: "configuration", label: "Configuration" },
            ...pluginTabItems.map((item) => ({
              value: item.value,
              label: item.label,
            })),
          ]}
          align="start"
          value={activeTab ?? "list"}
          onValueChange={(value) => handleTabChange(value as ProjectTab)}
        />
      </Tabs>

      {activeTab === "overview" && (
        <OverviewContent
          project={project}
          projectId={project.id}
          companyId={resolvedCompanyId ?? null}
          onUpdate={(data) => updateProject.mutate(data)}
          imageUploadHandler={async (file) => {
            const asset = await uploadImage.mutateAsync(file);
            return asset.contentPath;
          }}
        />
      )}

      {activeTab === "list" && project?.id && resolvedCompanyId && (
        <ProjectIssuesList projectId={project.id} companyId={resolvedCompanyId} />
      )}

      {activeTab === "configuration" && (
        <div className="max-w-4xl">
          <ProjectProperties
            project={project}
            onUpdate={(data) => updateProject.mutate(data)}
            onFieldUpdate={updateProjectField}
            getFieldSaveState={(field) => fieldSaveStates[field] ?? "idle"}
          />
        </div>
      )}

      {activePluginTab && (
        <PluginSlotMount
          slot={activePluginTab.slot}
          context={{
            companyId: resolvedCompanyId,
            companyPrefix: companyPrefix ?? null,
            projectId: project.id,
            projectRef: canonicalProjectRef,
            entityId: project.id,
            entityType: "project",
          }}
          missingBehavior="placeholder"
        />
      )}
    </div>
  );
}
