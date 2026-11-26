import type { HeptaElectronApi } from '../../../shared/api';
import type {
  AnnotationColor,
  AppNotification,
  AppUpdateState,
  Card,
  Connection,
  CreateCardInput,
  CreateConnectionInput,
  CreateDocumentInput,
  CreateHighlightElementInput,
  CreatePropertyInput,
  CreateWhiteboardObjectInput,
  DocumentRecord,
  HighlightElement,
  HighlightListFilter,
  HighlightRect,
  MoveObjectsAcrossWhiteboardsInput,
  MoveObjectsAcrossWhiteboardsResult,
  MoveWhiteboardHierarchyInput,
  MoveWhiteboardHierarchyResult,
  NativeThemeSource,
  SystemDiagnosticsState,
  Tag,
  TagGroup,
  TagPropertyJoined,
  UpdateConnectionPatch,
  UpdatePropertyBindingInput,
  UpdatePropertyInput,
  UpdateTagInput,
  Whiteboard,
  WhiteboardObject,
  WhiteboardObjectPatch,
} from '../../../shared/types';
import { HEPTA_DEFAULT_DIMENSIONS } from '../../../shared/types';

function getRawApi(): HeptaElectronApi | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { heptaElectronApi?: HeptaElectronApi }).heptaElectronApi;
}

const fallbackCard = (input?: CreateCardInput): Card => {
  const now = Date.now();
  return {
    id: input?.id || `card-${now}`,
    title: input?.title ?? 'Untitled',
    content_json: input?.contentJson ?? JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }),
    content_text: input?.contentText ?? '',
    created_at: now,
    updated_at: now,
    is_deleted: 0,
    color: input?.color ?? null,
  };
};

const fallbackWhiteboard = (name?: string, parentWhiteboardId?: string | null): Whiteboard => {
  const now = Date.now();
  return {
    id: `wb-${now}`,
    name: name || 'Untitled Whiteboard',
    created_at: now,
    updated_at: now,
    is_deleted: 0,
    viewport_pan_x: 0,
    viewport_pan_y: 0,
    viewport_zoom: 1,
    parent_whiteboard_id: parentWhiteboardId ?? null,
  };
};

const fallbackWhiteboardObject = (input: CreateWhiteboardObjectInput): WhiteboardObject => {
  const dims = HEPTA_DEFAULT_DIMENSIONS[input.objectType] || HEPTA_DEFAULT_DIMENSIONS.card;
  return {
    id: input.id || `obj-${Date.now()}`,
    whiteboard_id: input.whiteboardId,
    object_type: input.objectType,
    target_id: input.targetId ?? null,
    pos_x: input.posX,
    pos_y: input.posY,
    width: input.width ?? dims.width,
    height: input.height ?? dims.height,
    z_index: input.zIndex ?? 1,
    properties_json: input.propertiesJson ?? '{}',
  };
};

const fallbackConnection = (input: CreateConnectionInput): Connection => ({
  id: input.id || `conn-${Date.now()}`,
  whiteboard_id: input.whiteboardId,
  source_object_id: input.sourceObjectId,
  target_object_id: input.targetObjectId,
  label: input.label ?? null,
  style_json: input.styleJson ?? '{}',
});

const fallbackDocument = (input: CreateDocumentInput): DocumentRecord => {
  const now = Date.now();
  return {
    id: input.id || `doc-${now}`,
    title: input.title,
    doc_type: input.docType,
    file_reference_id: input.fileReferenceId,
    cover_reference_id: input.coverReferenceId ?? null,
    total_pages: input.totalPages ?? 0,
    last_position_json: input.lastPositionJson ?? '{}',
    metadata_json: input.metadataJson ?? '{}',
    created_at: now,
    updated_at: now,
    is_deleted: 0,
  };
};

const fallbackHighlight = (input: CreateHighlightElementInput): HighlightElement => {
  const now = Date.now();
  return {
    id: input.id || `hl-${now}`,
    source_type: input.sourceType,
    source_id: input.sourceId,
    highlight_type: input.highlightType ?? 'text',
    text_content: input.textContent ?? '',
    note_text: input.noteText ?? '',
    note_json: input.noteJson ?? '{}',
    color: input.color ?? 'yellow',
    page_number: input.pageNumber ?? 1,
    epub_cfi: input.epubCfi ?? null,
    rects_json: input.rectsJson ?? JSON.stringify(input.rects ?? []),
    image_reference_id: input.imageReferenceId ?? null,
    created_at: now,
    updated_at: now,
    is_deleted: 0,
  };
};

const fallbackTag = (name: string, color?: string | null): Tag => ({
  id: `tag-${Date.now()}`,
  name,
  color: color ?? '#207dff',
});

const fallbackUpdateState = (): AppUpdateState => ({
  status: 'idle',
  currentVersion: '0.1.0',
  latestVersion: '0.1.0',
  lastCheckedAt: Date.now(),
  errorMessage: null,
});

const fallbackDiagnostics = (): SystemDiagnosticsState => ({
  isEnabled: true,
  uptime: 0,
  platform: 'browser',
  arch: 'x64',
  electronVersion: '0.0.0',
  nodeVersion: '0.0.0',
});

export const heptaClient: HeptaElectronApi = {
  cards: {
    list: async (search?: string) => (await getRawApi()?.cards?.list?.(search)) ?? [],
    get: async (id: string) => (await getRawApi()?.cards?.get?.(id)) ?? null,
    create: async (input?: CreateCardInput) =>
      (await getRawApi()?.cards?.create?.(input)) ?? fallbackCard(input),
    updateTitle: async (id: string, title: string) => {
      await getRawApi()?.cards?.updateTitle?.(id, title);
    },
    updateContent: async (id: string, contentJson: string, contentText: string) => {
      await getRawApi()?.cards?.updateContent?.(id, contentJson, contentText);
    },
    updateColor: async (id: string, color: string | null) => {
      await getRawApi()?.cards?.updateColor?.(id, color);
    },
    delete: async (id: string) => {
      await getRawApi()?.cards?.delete?.(id);
    },
    duplicate: async (id: string) => (await getRawApi()?.cards?.duplicate?.(id)) ?? null,
    listTags: async (cardId: string) => (await getRawApi()?.cards?.listTags?.(cardId)) ?? [],
    addTag: async (cardId: string, tagName: string) =>
      (await getRawApi()?.cards?.addTag?.(cardId, tagName)) ?? fallbackTag(tagName),
    removeTag: async (cardId: string, tagId: string) => {
      await getRawApi()?.cards?.removeTag?.(cardId, tagId);
    },
    listBacklinks: async (cardId: string) => (await getRawApi()?.cards?.listBacklinks?.(cardId)) ?? [],
    listUnlinkedMentions: async (cardId: string) =>
      (await getRawApi()?.cards?.listUnlinkedMentions?.(cardId)) ?? [],
    linkReference: async (sourceCardId: string, targetCardId: string) => {
      await getRawApi()?.cards?.linkReference?.(sourceCardId, targetCardId);
    },
    unlinkReference: async (sourceCardId: string, targetCardId: string) => {
      await getRawApi()?.cards?.unlinkReference?.(sourceCardId, targetCardId);
    },
    listAllReferences: async () => (await getRawApi()?.cards?.listAllReferences?.()) ?? [],
    listWhiteboards: async (cardId: string) =>
      (await getRawApi()?.cards?.listWhiteboards?.(cardId)) ?? [],
    listAllCardTags: async () => (await getRawApi()?.cards?.listAllCardTags?.()) ?? [],
    listAllCardWhiteboards: async () => (await getRawApi()?.cards?.listAllCardWhiteboards?.()) ?? [],
    listBacklinkCounts: async () => (await getRawApi()?.cards?.listBacklinkCounts?.()) ?? [],
    searchFts: async (query: string, limit?: number) =>
      (await getRawApi()?.cards?.searchFts?.(query, limit)) ?? [],
    listInbox: async () => (await getRawApi()?.cards?.listInbox?.()) ?? [],
    upsertJournal: async (dateKey: string, contentJson: string, contentText: string) =>
      (await getRawApi()?.cards?.upsertJournal?.(dateKey, contentJson, contentText)) ?? null,
  },

  whiteboards: {
    list: async () => (await getRawApi()?.whiteboards?.list?.()) ?? [],
    get: async (id: string) => (await getRawApi()?.whiteboards?.get?.(id)) ?? null,
    create: async (name?: string, parentWhiteboardId?: string | null) =>
      (await getRawApi()?.whiteboards?.create?.(name, parentWhiteboardId)) ??
      fallbackWhiteboard(name, parentWhiteboardId),
    rename: async (id: string, name: string) => {
      await getRawApi()?.whiteboards?.rename?.(id, name);
    },
    delete: async (id: string) => {
      await getRawApi()?.whiteboards?.delete?.(id);
    },
    duplicate: async (id: string) => (await getRawApi()?.whiteboards?.duplicate?.(id)) ?? null,
    updateViewport: async (id: string, panX: number, panY: number, zoom: number) => {
      await getRawApi()?.whiteboards?.updateViewport?.(id, panX, panY, zoom);
    },
    updateOptions: async (id: string, options) => {
      await getRawApi()?.whiteboards?.updateOptions?.(id, options);
    },
    listObjects: async (whiteboardId: string) =>
      (await getRawApi()?.whiteboards?.listObjects?.(whiteboardId)) ?? [],
    createObject: async (input: CreateWhiteboardObjectInput) =>
      (await getRawApi()?.whiteboards?.createObject?.(input)) ?? fallbackWhiteboardObject(input),
    updateObjectRect: async (id: string, posX: number, posY: number, width: number, height: number) => {
      await getRawApi()?.whiteboards?.updateObjectRect?.(id, posX, posY, width, height);
    },
    updateObjectPosition: async (id: string, posX: number, posY: number) => {
      await getRawApi()?.whiteboards?.updateObjectPosition?.(id, posX, posY);
    },
    updateObjectSize: async (id: string, width: number, height: number) => {
      await getRawApi()?.whiteboards?.updateObjectSize?.(id, width, height);
    },
    updateObjectProperties: async (id: string, propertiesJson: string) => {
      await getRawApi()?.whiteboards?.updateObjectProperties?.(id, propertiesJson);
    },
    updateObjectZIndex: async (id: string, zIndex: number) => {
      await getRawApi()?.whiteboards?.updateObjectZIndex?.(id, zIndex);
    },
    batchUpdateObjects: async (updates: WhiteboardObjectPatch[]) => {
      await getRawApi()?.whiteboards?.batchUpdateObjects?.(updates);
    },
    deleteObject: async (id: string) => {
      await getRawApi()?.whiteboards?.deleteObject?.(id);
    },
    batchDeleteObjects: async (ids: string[]) => {
      await getRawApi()?.whiteboards?.batchDeleteObjects?.(ids);
    },
    listConnections: async (whiteboardId: string) =>
      (await getRawApi()?.whiteboards?.listConnections?.(whiteboardId)) ?? [],
    createConnection: async (input: CreateConnectionInput) =>
      (await getRawApi()?.whiteboards?.createConnection?.(input)) ?? fallbackConnection(input),
    updateConnection: async (id: string, patch: UpdateConnectionPatch) => {
      await getRawApi()?.whiteboards?.updateConnection?.(id, patch);
    },
    deleteConnection: async (id: string) => {
      await getRawApi()?.whiteboards?.deleteConnection?.(id);
    },
    getStatsMap: async () => (await getRawApi()?.whiteboards?.getStatsMap?.()) ?? {},
    listWhiteboardIdsByTarget: async (targetId: string) =>
      (await getRawApi()?.whiteboards?.listWhiteboardIdsByTarget?.(targetId)) ?? [],
    moveObjectsAcross: async (
      input: MoveObjectsAcrossWhiteboardsInput
    ): Promise<MoveObjectsAcrossWhiteboardsResult> =>
      (await getRawApi()?.whiteboards?.moveObjectsAcross?.(input)) ?? {
        movedObjectIds: [],
        cycleBlockedIds: [],
        movedConnectionCount: 0,
        deletedConnectionCount: 0,
      },
    moveHierarchy: async (
      input: MoveWhiteboardHierarchyInput
    ): Promise<MoveWhiteboardHierarchyResult> =>
      (await getRawApi()?.whiteboards?.moveHierarchy?.(input)) ?? {
        status: 'notFound',
      },
  },

  documents: {
    list: async () => (await getRawApi()?.documents?.list?.()) ?? [],
    get: async (id: string) => (await getRawApi()?.documents?.get?.(id)) ?? null,
    create: async (input: CreateDocumentInput) =>
      (await getRawApi()?.documents?.create?.(input)) ?? fallbackDocument(input),
    updatePosition: async (id: string, lastPositionJson: string, totalPages?: number) => {
      await getRawApi()?.documents?.updatePosition?.(id, lastPositionJson, totalPages);
    },
    updateCover: async (id: string, coverReferenceId: string) => {
      await getRawApi()?.documents?.updateCover?.(id, coverReferenceId);
    },
    delete: async (id: string) => {
      await getRawApi()?.documents?.delete?.(id);
    },
  },

  highlights: {
    list: async (filter?: HighlightListFilter) =>
      (await getRawApi()?.highlights?.list?.(filter)) ?? [],
    listBySource: async (sourceId: string) =>
      (await getRawApi()?.highlights?.listBySource?.(sourceId)) ?? [],
    create: async (input: CreateHighlightElementInput) =>
      (await getRawApi()?.highlights?.create?.(input)) ?? fallbackHighlight(input),
    updateNote: async (id: string, noteText: string, noteJson?: string) => {
      await getRawApi()?.highlights?.updateNote?.(id, noteText, noteJson);
    },
    updateColor: async (id: string, color: AnnotationColor) => {
      await getRawApi()?.highlights?.updateColor?.(id, color);
    },
    updateRects: async (id: string, rects: HighlightRect[], imageReferenceId?: string) => {
      await getRawApi()?.highlights?.updateRects?.(id, rects, imageReferenceId);
    },
    delete: async (id: string) => {
      await getRawApi()?.highlights?.delete?.(id);
    },
    listTags: async (highlightId: string) =>
      (await getRawApi()?.highlights?.listTags?.(highlightId)) ?? [],
    addTag: async (highlightId: string, tagName: string) =>
      (await getRawApi()?.highlights?.addTag?.(highlightId, tagName)) ?? fallbackTag(tagName),
    removeTag: async (highlightId: string, tagId: string) => {
      await getRawApi()?.highlights?.removeTag?.(highlightId, tagId);
    },
  },

  tags: {
    listWithCounts: async () => (await getRawApi()?.tags?.listWithCounts?.()) ?? [],
    create: async (
      name: string,
      color?: string | null,
      tagGroupId?: string | null,
      parentTagId?: string | null
    ) =>
      (await getRawApi()?.tags?.create?.(name, color, tagGroupId, parentTagId)) ??
      fallbackTag(name, color),
    update: async (input: UpdateTagInput) => {
      await getRawApi()?.tags?.update?.(input);
    },
    delete: async (id: string) => {
      await getRawApi()?.tags?.delete?.(id);
    },
    listCardsByTag: async (tagId: string) =>
      (await getRawApi()?.tags?.listCardsByTag?.(tagId)) ?? [],
    listHighlightsByTag: async (tagId: string) =>
      (await getRawApi()?.tags?.listHighlightsByTag?.(tagId)) ?? [],
    assignToCard: async (cardId: string, tagId: string) => {
      await getRawApi()?.tags?.assignToCard?.(cardId, tagId);
    },
    removeFromCard: async (cardId: string, tagId: string) => {
      await getRawApi()?.tags?.removeFromCard?.(cardId, tagId);
    },
    listGroups: async () => (await getRawApi()?.tags?.listGroups?.()) ?? [],
    createGroup: async (name: string): Promise<TagGroup> =>
      (await getRawApi()?.tags?.createGroup?.(name)) ?? {
        id: `taggrp-${Date.now()}`,
        name,
        sort_order: 0,
        is_folded: 0,
        created_at: Date.now(),
        updated_at: Date.now(),
      },
    updateGroup: async (input: {
      id: string;
      name?: string;
      isFolded?: number;
      sortOrder?: number;
    }) => {
      await getRawApi()?.tags?.updateGroup?.(input);
    },
    deleteGroup: async (id: string) => {
      await getRawApi()?.tags?.deleteGroup?.(id);
    },
  },

  properties: {
    listAll: async () => (await getRawApi()?.properties?.listAll?.()) ?? [],
    listByTag: async (tagId: string) =>
      (await getRawApi()?.properties?.listByTag?.(tagId)) ?? [],
    listForCard: async (cardId: string) =>
      (await getRawApi()?.properties?.listForCard?.(cardId)) ?? [],
    createForTag: async (input: CreatePropertyInput): Promise<TagPropertyJoined> =>
      (await getRawApi()?.properties?.createForTag?.(input)) ?? {
        id: `prop-${Date.now()}`,
        name: input.name,
        type: input.type,
        config_json: JSON.stringify(input.config ?? {}),
        created_at: Date.now(),
        updated_at: Date.now(),
        tag_id: input.tagId,
        sort_order: 0,
        width: 160,
        should_wrap: 0,
        is_hidden: 0,
        bound_tag_ids: [input.tagId],
      },
    attachToTag: async (tagId: string, propertyId: string) => {
      await getRawApi()?.properties?.attachToTag?.(tagId, propertyId);
    },
    detachFromTag: async (tagId: string, propertyId: string) => {
      await getRawApi()?.properties?.detachFromTag?.(tagId, propertyId);
    },
    update: async (input: UpdatePropertyInput) =>
      (await getRawApi()?.properties?.update?.(input)) ?? null,
    updateBinding: async (input: UpdatePropertyBindingInput) => {
      await getRawApi()?.properties?.updateBinding?.(input);
    },
    delete: async (propertyId: string) => {
      await getRawApi()?.properties?.delete?.(propertyId);
    },
    deleteOption: async (propertyId: string, optionId: string, deleteTaggedCards?: boolean) => {
      await getRawApi()?.properties?.deleteOption?.(propertyId, optionId, deleteTaggedCards);
    },
    listValuesByTag: async (tagId: string) =>
      (await getRawApi()?.properties?.listValuesByTag?.(tagId)) ?? [],
    listValuesByCard: async (cardId: string) =>
      (await getRawApi()?.properties?.listValuesByCard?.(cardId)) ?? [],
    setValue: async (cardId: string, propertyId: string, valueJson: string) => {
      await getRawApi()?.properties?.setValue?.(cardId, propertyId, valueJson);
    },
    clearValue: async (cardId: string, propertyId: string) => {
      await getRawApi()?.properties?.clearValue?.(cardId, propertyId);
    },
  },

  localFile: {
    add: async (fileInfo: { path: string; name: string }) =>
      (await getRawApi()?.localFile?.add?.(fileInfo)) ?? {
        referenceId: `ref-${Date.now()}`,
        sha256: '',
        previewUrl: '',
        fileName: fileInfo.name,
        fileSize: 0,
        mimeType: 'application/octet-stream',
      },
    pickDocuments: async () => (await getRawApi()?.localFile?.pickDocuments?.()) ?? [],
    readBuffer: async (referenceId: string) =>
      (await getRawApi()?.localFile?.readBuffer?.(referenceId)) ?? new Uint8Array(0),
    saveImage: async (dataUrl: string, name: string) =>
      (await getRawApi()?.localFile?.saveImage?.(dataUrl, name)) ?? {
        referenceId: `img-${Date.now()}`,
        previewUrl: dataUrl,
      },
    acquirePreview: async (referenceId: string) =>
      (await getRawApi()?.localFile?.acquirePreview?.(referenceId)) ?? { previewUrl: '' },
    openExternal: async (referenceId: string) => {
      await getRawApi()?.localFile?.openExternal?.(referenceId);
    },
    getPathForFile: (file: { path?: string; name: string }) =>
      getRawApi()?.localFile?.getPathForFile?.(file) ?? file.path ?? '',
  },

  notifications: {
    send: async (input: { title: string; body: string }): Promise<AppNotification> =>
      (await getRawApi()?.notifications?.send?.(input)) ?? {
        id: `notif-${Date.now()}`,
        title: input.title,
        body: input.body,
        createdAt: Date.now(),
      },
    listRecent: async () => (await getRawApi()?.notifications?.listRecent?.()) ?? [],
  },

  update: {
    getState: async () => (await getRawApi()?.update?.getState?.()) ?? fallbackUpdateState(),
    checkForUpdates: async () =>
      (await getRawApi()?.update?.checkForUpdates?.()) ?? fallbackUpdateState(),
  },

  system: {
    getCliStatus: async () =>
      (await getRawApi()?.system?.getCliStatus?.()) ?? { isRunning: false, port: 0 },
    getDiagnostics: async () =>
      (await getRawApi()?.system?.getDiagnostics?.()) ?? fallbackDiagnostics(),
    setNativeTheme: (theme: NativeThemeSource) => {
      getRawApi()?.system?.setNativeTheme?.(theme);
    },
    createWindow: () => {
      getRawApi()?.system?.createWindow?.();
    },
  },

  cli: {
    getStatus: async () =>
      (await getRawApi()?.cli?.getStatus?.()) ?? { isRunning: false, port: 0 },
  },

  diagnostics: {
    getState: async () =>
      (await getRawApi()?.diagnostics?.getState?.()) ?? fallbackDiagnostics(),
  },

  setNativeTheme: (theme: NativeThemeSource) => {
    getRawApi()?.setNativeTheme?.(theme);
  },

  createWindow: () => {
    getRawApi()?.createWindow?.();
  },
};
