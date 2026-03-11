import { and, asc, eq, like } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { assets } from "@paperclipai/db";

/** ObjectKey prefix for assets under a project namespace (assets/projects/:projectId). */
function projectAssetsObjectKeyPrefix(companyId: string, projectId: string): string {
  return `${companyId}/assets/projects/${projectId}/`;
}

export function assetService(db: Db) {
  return {
    create: (companyId: string, data: Omit<typeof assets.$inferInsert, "companyId">) =>
      db
        .insert(assets)
        .values({ ...data, companyId })
        .returning()
        .then((rows) => rows[0]),

    getById: (id: string) =>
      db
        .select()
        .from(assets)
        .where(eq(assets.id, id))
        .then((rows) => rows[0] ?? null),

    listByProject: (companyId: string, projectId: string) => {
      const prefix = projectAssetsObjectKeyPrefix(companyId, projectId);
      return db
        .select({
          id: assets.id,
          objectKey: assets.objectKey,
          contentType: assets.contentType,
          byteSize: assets.byteSize,
          originalFilename: assets.originalFilename,
          createdAt: assets.createdAt,
        })
        .from(assets)
        .where(and(eq(assets.companyId, companyId), like(assets.objectKey, `${prefix}%`)))
        .orderBy(asc(assets.createdAt));
    },
  };
}

