import type {
  AnnotationColor,
  AppNotification,
  AppUpdateState,
  Card,
  CardBacklinkCountRow,
  CardBacklinkRow,
  CardPropertyValue,
  CardReferenceRow,
  CardTagBindingRow,
  CardWhiteboardBindingRow,
  CardWhiteboardRow,
  Connection,
  CreateCardInput,
  CreateConnectionInput,
  CreateDocumentInput,
  CreateHighlightElementInput,
  CreatePropertyInput,
  CreateWhiteboardObjectInput,
  DocumentRecord,
  HighlightElement,
  HighlightJoinedRow,
  HighlightListFilter,
  HighlightRect,
  LocalFileAddResult,
  MoveObjectsAcrossWhiteboardsInput,
  MoveObjectsAcrossWhiteboardsResult,
  MoveWhiteboardHierarchyInput,
  MoveWhiteboardHierarchyResult,
  NativeThemeSource,
  PickedDocumentFile,
  SystemDiagnosticsState,
  Tag,
  TagGroup,
  TagProperty,
  TagPropertyJoined,
  TagWithCountRow,
  UpdateConnectionPatch,
  UpdatePropertyBindingInput,
  UpdatePropertyInput,
  UpdateTagInput,
  Whiteboard,
  WhiteboardObject,
  WhiteboardObjectPatch,
  WhiteboardOptions,
  WhiteboardStatsRow,
} from './types';

export const IPC_CHANNELS = {
  CARDS_LIST: 'cards:list',
  CARDS_GET: 'cards:get',
  CARDS_CREATE: 'cards:create',
  CARDS_UPDATE_TITLE: 'cards:update-title',
  CARDS_UPDATE_CONTENT: 'cards:update-content',
  CARDS_UPDATE_COLOR: 'cards:update-color',
  CARDS_DELETE: 'cards:delete',
  CARDS_DUPLICATE: 'cards:duplicate',
  CARDS_LIST_TAGS: 'cards:list-tags',
  CARDS_ADD_TAG: 'cards:add-tag',
  CARDS_REMOVE_TAG: 'cards:remove-tag',
  CARDS_LIST_BACKLINKS: 'cards:list-backlinks',
  CARDS_LIST_UNLINKED_MENTIONS: 'cards:list-unlinked-mentions',
  CARDS_LINK_REFERENCE: 'cards:link-reference',
  CARDS_UNLINK_REFERENCE: 'cards:unlink-reference',
  CARDS_LIST_ALL_REFERENCES: 'cards:list-all-references',
  CARDS_LIST_WHITEBOARDS: 'cards:list-whiteboards',
  CARDS_LIST_ALL_CARD_TAGS: 'cards:list-all-card-tags',
  CARDS_LIST_ALL_CARD_WHITEBOARDS: 'cards:list-all-card-whiteboards',
  CARDS_LIST_BACKLINK_COUNTS: 'cards:list-backlink-counts',
  CARDS_SEARCH_FTS: 'cards:search-fts',
  CARDS_LIST_INBOX: 'cards:list-inbox',
  CARDS_UPSERT_JOURNAL: 'cards:upsert-journal',

  WHITEBOARDS_LIST: 'whiteboards:list',
  WHITEBOARDS_GET: 'whiteboards:get',
  WHITEBOARDS_CREATE: 'whiteboards:create',
  WHITEBOARDS_RENAME: 'whiteboards:rename',
  WHITEBOARDS_DELETE: 'whiteboards:delete',
  WHITEBOARDS_DUPLICATE: 'whiteboards:duplicate',
  WHITEBOARDS_UPDATE_VIEWPORT: 'whiteboards:update-viewport',
  WHITEBOARDS_UPDATE_OPTIONS: 'whiteboards:update-options',
  WHITEBOARDS_LIST_OBJECTS: 'whiteboards:list-objects',
  WHITEBOARDS_CREATE_OBJECT: 'whiteboards:create-object',
  WHITEBOARDS_UPDATE_OBJECT_RECT: 'whiteboards:update-object-rect',
  WHITEBOARDS_UPDATE_OBJECT_POSITION: 'whiteboards:update-object-position',
  WHITEBOARDS_UPDATE_OBJECT_SIZE: 'whiteboards:update-object-size',
  WHITEBOARDS_UPDATE_OBJECT_PROPERTIES: 'whiteboards:update-object-properties',
  WHITEBOARDS_UPDATE_OBJECT_Z_INDEX: 'whiteboards:update-object-z-index',
  WHITEBOARDS_BATCH_UPDATE_OBJECTS: 'whiteboards:batch-update-objects',
  WHITEBOARDS_DELETE_OBJECT: 'whiteboards:delete-object',
  WHITEBOARDS_BATCH_DELETE_OBJECTS: 'whiteboards:batch-delete-objects',
  WHITEBOARDS_LIST_CONNECTIONS: 'whiteboards:list-connections',
  WHITEBOARDS_CREATE_CONNECTION: 'whiteboards:create-connection',
  WHITEBOARDS_UPDATE_CONNECTION: 'whiteboards:update-connection',
  WHITEBOARDS_DELETE_CONNECTION: 'whiteboards:delete-connection',
  WHITEBOARDS_GET_STATS_MAP: 'whiteboards:get-stats-map',
  WHITEBOARDS_LIST_IDS_BY_TARGET: 'whiteboards:list-ids-by-target',
  WHITEBOARDS_MOVE_OBJECTS_ACROSS: 'whiteboards:moveObjectsAcross',
  WHITEBOARDS_MOVE_HIERARCHY: 'whiteboards:moveHierarchy',

  DOCUMENTS_LIST: 'documents:list',
  DOCUMENTS_GET: 'documents:get',
  DOCUMENTS_CREATE: 'documents:create',
  DOCUMENTS_UPDATE_POSITION: 'documents:update-position',
  DOCUMENTS_UPDATE_COVER: 'documents:update-cover',
  DOCUMENTS_DELETE: 'documents:delete',

  HIGHLIGHTS_LIST: 'highlights:list',
  HIGHLIGHTS_LIST_BY_SOURCE: 'highlights:list-by-source',
  HIGHLIGHTS_CREATE: 'highlights:create',
  HIGHLIGHTS_UPDATE_NOTE: 'highlights:update-note',
  HIGHLIGHTS_UPDATE_COLOR: 'highlights:update-color',
  HIGHLIGHTS_UPDATE_RECTS: 'highlights:update-rects',
  HIGHLIGHTS_DELETE: 'highlights:delete',
  HIGHLIGHTS_LIST_TAGS: 'highlights:list-tags',
  HIGHLIGHTS_ADD_TAG: 'highlights:add-tag',
  HIGHLIGHTS_REMOVE_TAG: 'highlights:remove-tag',

  TAGS_LIST_WITH_COUNTS: 'tags:list-with-counts',
  TAGS_CREATE: 'tags:create',
  TAGS_UPDATE: 'tags:update',
  TAGS_DELETE: 'tags:delete',
  TAGS_LIST_CARDS_BY_TAG: 'tags:list-cards-by-tag',
  TAGS_LIST_HIGHLIGHTS_BY_TAG: 'tags:list-highlights-by-tag',
  TAGS_ASSIGN_TO_CARD: 'tags:assign-to-card',
  TAGS_REMOVE_FROM_CARD: 'tags:remove-from-card',

  TAG_GROUPS_LIST: 'tag-groups:list',
  TAG_GROUPS_CREATE: 'tag-groups:create',
  TAG_GROUPS_UPDATE: 'tag-groups:update',
  TAG_GROUPS_DELETE: 'tag-groups:delete',

  PROPERTIES_LIST_ALL: 'properties:list-all',
  PROPERTIES_LIST_BY_TAG: 'properties:list-by-tag',
  PROPERTIES_LIST_FOR_CARD: 'properties:list-for-card',
  PROPERTIES_CREATE_FOR_TAG: 'properties:create-for-tag',
  PROPERTIES_ATTACH_TO_TAG: 'properties:attach-to-tag',
  PROPERTIES_DETACH_FROM_TAG: 'properties:detach-from-tag',
  PROPERTIES_UPDATE: 'properties:update',
  PROPERTIES_UPDATE_BINDING: 'properties:update-binding',
  PROPERTIES_DELETE: 'properties:delete',
  PROPERTIES_DELETE_OPTION: 'properties:delete-option',

  CARD_PROPERTIES_LIST_BY_TAG: 'card-properties:list-by-tag',
  CARD_PROPERTIES_LIST_BY_CARD: 'card-properties:list-by-card',
  CARD_PROPERTIES_SET_VALUE: 'card-properties:set-value',
  CARD_PROPERTIES_CLEAR_VALUE: 'card-properties:clear-value',

  LOCAL_FILE_ADD: 'local-file:add',
  LOCAL_FILE_PICK_DOCUMENTS: 'local-file:pick-documents',
  LOCAL_FILE_READ_BUFFER: 'local-file:read-buffer',
  LOCAL_FILE_SAVE_IMAGE: 'local-file:save-image',
  LOCAL_FILE_ACQUIRE_PREVIEW: 'local-file:acquire-preview',
  LOCAL_FILE_OPEN_EXTERNAL: 'local-file:open-external',

  NOTIFICATIONS_SEND: 'notifications:send',
  NOTIFICATIONS_LIST_RECENT: 'notifications:list-recent',

  UPDATE_GET_STATE: 'update:get-state',
  UPDATE_CHECK: 'update:check',

  SYSTEM_GET_CLI_STATUS: 'system:get-cli-status',
  SYSTEM_GET_DIAGNOSTICS: 'system:get-diagnostics',
  SYSTEM_SET_NATIVE_THEME: 'system:set-native-theme',
  SYSTEM_CREATE_WINDOW: 'system:create-window',
} as const;

export interface HeptaCardsApi {
  list: (search?: string) => Promise<Card[]>;
  get: (id: string) => Promise<Card | null>;
  create: (input?: CreateCardInput) => Promise<Card>;
  updateTitle: (id: string, title: string) => Promise<void>;
  updateContent: (id: string, contentJson: string, contentText: string) => Promise<void>;
  updateColor: (id: string, color: string | null) => Promise<void>;
  delete: (id: string) => Promise<void>;
  duplicate: (id: string) => Promise<Card | null>;
  listTags: (cardId: string) => Promise<Tag[]>;
  addTag: (cardId: string, tagName: string) => Promise<Tag>;
  removeTag: (cardId: string, tagId: string) => Promise<void>;
  listBacklinks: (cardId: string) => Promise<CardBacklinkRow[]>;
  listUnlinkedMentions: (cardId: string) => Promise<Card[]>;
  linkReference: (sourceCardId: string, targetCardId: string) => Promise<void>;
  unlinkReference: (sourceCardId: string, targetCardId: string) => Promise<void>;
  listAllReferences: () => Promise<CardReferenceRow[]>;
  listWhiteboards: (cardId: string) => Promise<CardWhiteboardRow[]>;
  listAllCardTags: () => Promise<CardTagBindingRow[]>;
  listAllCardWhiteboards: () => Promise<CardWhiteboardBindingRow[]>;
  listBacklinkCounts: () => Promise<CardBacklinkCountRow[]>;
  searchFts: (query: string, limit?: number) => Promise<Card[]>;
  listInbox: () => Promise<Card[]>;
  upsertJournal: (dateKey: string, contentJson: string, contentText: string) => Promise<Card | null>;
}

export interface HeptaWhiteboardsApi {
  list: () => Promise<Whiteboard[]>;
  get: (id: string) => Promise<Whiteboard | null>;
  create: (name?: string, parentWhiteboardId?: string | null) => Promise<Whiteboard>;
  rename: (id: string, name: string) => Promise<void>;
  delete: (id: string) => Promise<void>;
  duplicate: (id: string) => Promise<Whiteboard | null>;
  updateViewport: (id: string, panX: number, panY: number, zoom: number) => Promise<void>;
  updateOptions: (id: string, options: Partial<WhiteboardOptions>) => Promise<void>;
  listObjects: (whiteboardId: string) => Promise<WhiteboardObject[]>;
  createObject: (input: CreateWhiteboardObjectInput) => Promise<WhiteboardObject>;
  updateObjectRect: (id: string, posX: number, posY: number, width: number, height: number) => Promise<void>;
  updateObjectPosition: (id: string, posX: number, posY: number) => Promise<void>;
  updateObjectSize: (id: string, width: number, height: number) => Promise<void>;
  updateObjectProperties: (id: string, propertiesJson: string) => Promise<void>;
  updateObjectZIndex: (id: string, zIndex: number) => Promise<void>;
  batchUpdateObjects: (updates: WhiteboardObjectPatch[]) => Promise<void>;
  deleteObject: (id: string) => Promise<void>;
  batchDeleteObjects: (ids: string[]) => Promise<void>;
  listConnections: (whiteboardId: string) => Promise<Connection[]>;
  createConnection: (input: CreateConnectionInput) => Promise<Connection>;
  updateConnection: (id: string, patch: UpdateConnectionPatch) => Promise<void>;
  deleteConnection: (id: string) => Promise<void>;
  getStatsMap: () => Promise<Record<string, WhiteboardStatsRow>>;
  listWhiteboardIdsByTarget: (targetId: string) => Promise<string[]>;
  moveObjectsAcross: (
    input: MoveObjectsAcrossWhiteboardsInput
  ) => Promise<MoveObjectsAcrossWhiteboardsResult>;
  moveHierarchy: (
    input: MoveWhiteboardHierarchyInput
  ) => Promise<MoveWhiteboardHierarchyResult>;
}

export interface HeptaDocumentsApi {
  list: () => Promise<DocumentRecord[]>;
  get: (id: string) => Promise<DocumentRecord | null>;
  create: (input: CreateDocumentInput) => Promise<DocumentRecord>;
  updatePosition: (id: string, lastPositionJson: string, totalPages?: number) => Promise<void>;
  updateCover: (id: string, coverReferenceId: string) => Promise<void>;
  delete: (id: string) => Promise<void>;
}

export interface HeptaHighlightsApi {
  list: (filter?: HighlightListFilter) => Promise<HighlightJoinedRow[]>;
  listBySource: (sourceId: string) => Promise<HighlightElement[]>;
  create: (input: CreateHighlightElementInput) => Promise<HighlightElement>;
  updateNote: (id: string, noteText: string, noteJson?: string) => Promise<void>;
  updateColor: (id: string, color: AnnotationColor) => Promise<void>;
  updateRects: (id: string, rects: HighlightRect[], imageReferenceId?: string) => Promise<void>;
  delete: (id: string) => Promise<void>;
  listTags: (highlightId: string) => Promise<Tag[]>;
  addTag: (highlightId: string, tagName: string) => Promise<Tag>;
  removeTag: (highlightId: string, tagId: string) => Promise<void>;
}

export interface HeptaTagsApi {
  listWithCounts: () => Promise<TagWithCountRow[]>;
  create: (
    name: string,
    color?: string | null,
    tagGroupId?: string | null,
    parentTagId?: string | null
  ) => Promise<Tag>;
  update: (input: UpdateTagInput) => Promise<void>;
  delete: (id: string) => Promise<void>;
  listCardsByTag: (tagId: string) => Promise<Card[]>;
  listHighlightsByTag: (tagId: string) => Promise<HighlightJoinedRow[]>;
  assignToCard: (cardId: string, tagId: string) => Promise<void>;
  removeFromCard: (cardId: string, tagId: string) => Promise<void>;
  listGroups: () => Promise<TagGroup[]>;
  createGroup: (name: string) => Promise<TagGroup>;
  updateGroup: (input: {
    id: string;
    name?: string;
    isFolded?: number;
    sortOrder?: number;
  }) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
}

export interface HeptaPropertiesApi {
  listAll: () => Promise<TagPropertyJoined[]>;
  listByTag: (tagId: string) => Promise<TagPropertyJoined[]>;
  listForCard: (cardId: string) => Promise<TagPropertyJoined[]>;
  createForTag: (input: CreatePropertyInput) => Promise<TagPropertyJoined>;
  attachToTag: (tagId: string, propertyId: string) => Promise<void>;
  detachFromTag: (tagId: string, propertyId: string) => Promise<void>;
  update: (input: UpdatePropertyInput) => Promise<TagProperty | null>;
  updateBinding: (input: UpdatePropertyBindingInput) => Promise<void>;
  delete: (propertyId: string) => Promise<void>;
  deleteOption: (
    propertyId: string,
    optionId: string,
    deleteTaggedCards?: boolean
  ) => Promise<void>;
  listValuesByTag: (tagId: string) => Promise<CardPropertyValue[]>;
  listValuesByCard: (cardId: string) => Promise<CardPropertyValue[]>;
  setValue: (cardId: string, propertyId: string, valueJson: string) => Promise<void>;
  clearValue: (cardId: string, propertyId: string) => Promise<void>;
}

export interface HeptaLocalFileApi {
  add: (fileInfo: { path: string; name: string }) => Promise<LocalFileAddResult>;
  pickDocuments: () => Promise<PickedDocumentFile[]>;
  readBuffer: (referenceId: string) => Promise<Uint8Array>;
  saveImage: (dataUrl: string, name: string) => Promise<{ referenceId: string; previewUrl: string }>;
  acquirePreview: (referenceId: string) => Promise<{ previewUrl: string; width?: number; height?: number }>;
  openExternal: (referenceId: string) => Promise<void>;
  getPathForFile?: (file: { path?: string; name: string }) => string;
}

export interface HeptaNotificationsApi {
  send: (input: { title: string; body: string }) => Promise<AppNotification>;
  listRecent: () => Promise<AppNotification[]>;
}

export interface HeptaUpdateApi {
  getState: () => Promise<AppUpdateState>;
  checkForUpdates: () => Promise<AppUpdateState>;
}

export interface HeptaSystemApi {
  getCliStatus: () => Promise<{ isRunning: boolean; port: number }>;
  getDiagnostics: () => Promise<SystemDiagnosticsState>;
  setNativeTheme: (theme: NativeThemeSource) => void;
  createWindow: () => void;
}

export interface HeptaElectronApi {
  cards: HeptaCardsApi;
  whiteboards: HeptaWhiteboardsApi;
  documents: HeptaDocumentsApi;
  highlights: HeptaHighlightsApi;
  tags: HeptaTagsApi;
  properties: HeptaPropertiesApi;
  localFile: HeptaLocalFileApi;
  notifications: HeptaNotificationsApi;
  update: HeptaUpdateApi;
  system: HeptaSystemApi;
  cli: {
    getStatus: () => Promise<{ isRunning: boolean; port: number }>;
  };
  diagnostics: {
    getState: () => Promise<SystemDiagnosticsState>;
  };
  setNativeTheme: (theme: NativeThemeSource) => void;
  createWindow: () => void;
}
