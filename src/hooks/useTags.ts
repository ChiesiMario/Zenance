import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Tag } from '@/services/db/db';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from '@/store/useAppStore';

// 模組級單例記憶體快取：紀錄各帳本最新一次成功 Resolve 的標籤列表，消除組件首次掛載的空白空隙
const lastTagsCache: Record<string, Tag[]> = {};
const lastArchivedTagsCache: Record<string, Tag[]> = {};
const lastAllTagsCache: Record<string, Tag[]> = {};

export function useTags() {
  const { activeLedgerId } = useAppStore();

  const tags = useLiveQuery(
    () => {
      if (!activeLedgerId) return Promise.resolve([] as Tag[]);
      return db.tags
        .where('ledgerId')
        .equals(activeLedgerId)
        .filter(t => !t.deleted && !t.archived)
        .sortBy('name');
    },
    [activeLedgerId]
  );

  const archivedTags = useLiveQuery(
    () => {
      if (!activeLedgerId) return Promise.resolve([] as Tag[]);
      return db.tags
        .where('ledgerId')
        .equals(activeLedgerId)
        .filter(t => !t.deleted && t.archived === true)
        .sortBy('name');
    },
    [activeLedgerId]
  );

  const allTags = useLiveQuery(
    () => {
      if (!activeLedgerId) return Promise.resolve([] as Tag[]);
      return db.tags
        .where('ledgerId')
        .equals(activeLedgerId)
        .filter(t => !t.deleted)
        .sortBy('name');
    },
    [activeLedgerId]
  );

  if (activeLedgerId && tags !== undefined) {
    lastTagsCache[activeLedgerId] = tags;
  }
  if (activeLedgerId && archivedTags !== undefined) {
    lastArchivedTagsCache[activeLedgerId] = archivedTags;
  }
  if (activeLedgerId && allTags !== undefined) {
    lastAllTagsCache[activeLedgerId] = allTags;
  }

  const effectiveTags = tags !== undefined
    ? tags
    : (activeLedgerId ? lastTagsCache[activeLedgerId] : undefined);

  const effectiveArchivedTags = archivedTags !== undefined
    ? archivedTags
    : (activeLedgerId ? lastArchivedTagsCache[activeLedgerId] : undefined);

  const effectiveAllTags = allTags !== undefined
    ? allTags
    : (activeLedgerId ? lastAllTagsCache[activeLedgerId] : undefined);

  const addTag = async (name: string, color?: string): Promise<Tag> => {
    if (!activeLedgerId) throw new Error('No active ledger');
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error('Tag name cannot be empty');

    // 檢查是否存在同名標籤（若已軟刪除則復原）
    const existing = await db.tags
      .where('ledgerId')
      .equals(activeLedgerId)
      .filter(t => t.name.toLowerCase() === trimmedName.toLowerCase())
      .first();

    if (existing) {
      if (existing.deleted) {
        const updated: Tag = {
          ...existing,
          deleted: false,
          archived: false,
          color: color || existing.color,
          updatedAt: new Date().toISOString(),
          rev: (existing.rev || 1) + 1,
        };
        await db.tags.put(updated);
        return updated;
      }
      return existing;
    }

    const newTag: Tag = {
      id: uuidv4(),
      ledgerId: activeLedgerId,
      name: trimmedName,
      color,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deleted: false,
      archived: false,
      rev: 1,
    };
    await db.tags.add(newTag);
    return newTag;
  };

  const updateTag = async (id: string, name: string, color?: string): Promise<void> => {
    const existing = await db.tags.get(id);
    if (!existing) return;
    const trimmedName = name.trim();
    if (!trimmedName) return;

    await db.tags.update(id, {
      name: trimmedName,
      ...(color !== undefined ? { color } : {}),
      updatedAt: new Date().toISOString(),
      rev: (existing.rev || 1) + 1,
    });
  };

  const archiveTag = async (id: string): Promise<void> => {
    const existing = await db.tags.get(id);
    if (!existing) return;
    await db.tags.update(id, {
      archived: true,
      updatedAt: new Date().toISOString(),
      rev: (existing.rev || 1) + 1,
    });
  };

  const unarchiveTag = async (id: string): Promise<void> => {
    const existing = await db.tags.get(id);
    if (!existing) return;
    await db.tags.update(id, {
      archived: false,
      updatedAt: new Date().toISOString(),
      rev: (existing.rev || 1) + 1,
    });
  };

  const deleteTag = async (id: string): Promise<{ success: boolean; reason?: string }> => {
    const txCount = await db.transactions
      .filter(t => !t.deleted && Boolean(t.tagIds?.includes(id)))
      .count();

    if (txCount > 0) {
      return { success: false, reason: 'has_transactions' };
    }

    const existing = await db.tags.get(id);
    if (!existing) return { success: false, reason: 'not_found' };

    await db.tags.update(id, {
      deleted: true,
      updatedAt: new Date().toISOString(),
      rev: (existing.rev || 1) + 1,
    });

    return { success: true };
  };

  return {
    tags: effectiveTags,
    archivedTags: effectiveArchivedTags,
    allTags: effectiveAllTags,
    addTag,
    updateTag,
    archiveTag,
    unarchiveTag,
    deleteTag,
  };
}
