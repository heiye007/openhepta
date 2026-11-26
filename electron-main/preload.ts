import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { HeptaElectronApi, IPC_CHANNELS } from '../shared/api';
import {
  AnnotationColor,
  CreateCardInput,
  CreateConnectionInput,
  CreateDocumentInput,
  CreateHighlightElementInput,
  CreatePropertyInput,
  CreateWhiteboardObjectInput,
  HighlightListFilter,
  HighlightRect,
  MoveObjectsAcrossWhiteboardsInput,
  MoveWhiteboardHierarchyInput,
  NativeThemeSource,
  UpdateConnectionPatch,
  UpdatePropertyBindingInput,
  UpdatePropertyInput,
  UpdateTagInput,
  WhiteboardObjectPatch,
} from '../shared/types';

const api: HeptaElectronApi = {
  cards: {
    list: (search?: string) => ipcRenderer.invoke(IPC_CHANNELS.CARDS_LIST, { search }),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.CARDS_GET, { id }),
    create: (input?: CreateCardInput) => ipcRenderer.invoke(IPC_CHANNELS.CARDS_CREATE, input),
    updateTitle: (id: string, title: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CARDS_UPDATE_TITLE, { id, title }),
    updateContent: (id: string, contentJson: string, contentText: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CARDS_UPDATE_CONTENT, { id, contentJson, contentText }),
    updateColor: (id: string, color: string | null) =>
      ipcRenderer.invoke(IPC_CHANNELS.CARDS_UPDATE_COLOR, { id, color }),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.CARDS_DELETE, { id }),
    duplicate: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.CARDS_DUPLICATE, { id }),
    listTags: (cardId: string) => ipcRenderer.invoke(IPC_CHANNELS.CARDS_LIST_TAGS, { cardId }),
    addTag: (cardId: string, tagName: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CARDS_ADD_TAG, { cardId, tagName }),
    removeTag: (cardId: string, tagId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CARDS_REMOVE_TAG, { cardId, tagId }),
    listBacklinks: (cardId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CARDS_LIST_BACKLINKS, { cardId }),
    listUnlinkedMentions: (cardId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CARDS_LIST_UNLINKED_MENTIONS, { cardId }),
    linkReference: (sourceCardId: string, targetCardId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CARDS_LINK_REFERENCE, { sourceCardId, targetCardId }),
    unlinkReference: (sourceCardId: string, targetCardId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CARDS_UNLINK_REFERENCE, { sourceCardId, targetCardId }),
    listAllReferences: () => ipcRenderer.invoke(IPC_CHANNELS.CARDS_LIST_ALL_REFERENCES),
    listWhiteboards: (cardId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CARDS_LIST_WHITEBOARDS, { cardId }),
    listAllCardTags: () => ipcRenderer.invoke(IPC_CHANNELS.CARDS_LIST_ALL_CARD_TAGS),
    listAllCardWhiteboards: () =>
      ipcRenderer.invoke(IPC_CHANNELS.CARDS_LIST_ALL_CARD_WHITEBOARDS),
    listBacklinkCounts: () => ipcRenderer.invoke(IPC_CHANNELS.CARDS_LIST_BACKLINK_COUNTS),
    searchFts: (query: string, limit?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.CARDS_SEARCH_FTS, { query, limit }),
    listInbox: () => ipcRenderer.invoke(IPC_CHANNELS.CARDS_LIST_INBOX),
    upsertJournal: (dateKey: string, contentJson: string, contentText: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CARDS_UPSERT_JOURNAL, { dateKey, contentJson, contentText }),
  },

  whiteboards: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.WHITEBOARDS_LIST),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.WHITEBOARDS_GET, { id }),
    create: (name?: string, parentWhiteboardId?: string | null) =>
      ipcRenderer.invoke(IPC_CHANNELS.WHITEBOARDS_CREATE, { name, parentWhiteboardId }),
    rename: (id: string, name: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.WHITEBOARDS_RENAME, { id, name }),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.WHITEBOARDS_DELETE, { id }),
    duplicate: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.WHITEBOARDS_DUPLICATE, { id }),
    updateViewport: (id: string, panX: number, panY: number, zoom: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.WHITEBOARDS_UPDATE_VIEWPORT, { id, panX, panY, zoom }),
    updateOptions: (id: string, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.WHITEBOARDS_UPDATE_OPTIONS, { id, options }),
    listObjects: (whiteboardId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.WHITEBOARDS_LIST_OBJECTS, { whiteboardId }),
    createObject: (input: CreateWhiteboardObjectInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.WHITEBOARDS_CREATE_OBJECT, input),
    updateObjectRect: (id: string, posX: number, posY: number, width: number, height: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.WHITEBOARDS_UPDATE_OBJECT_RECT, {
        id,
        posX,
        posY,
        width,
        height,
      }),
    updateObjectPosition: (id: string, posX: number, posY: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.WHITEBOARDS_UPDATE_OBJECT_POSITION, { id, posX, posY }),
    updateObjectSize: (id: string, width: number, height: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.WHITEBOARDS_UPDATE_OBJECT_SIZE, { id, width, height }),
    updateObjectProperties: (id: string, propertiesJson: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.WHITEBOARDS_UPDATE_OBJECT_PROPERTIES, {
        id,
        propertiesJson,
      }),
    updateObjectZIndex: (id: string, zIndex: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.WHITEBOARDS_UPDATE_OBJECT_Z_INDEX, { id, zIndex }),
    batchUpdateObjects: (updates: WhiteboardObjectPatch[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.WHITEBOARDS_BATCH_UPDATE_OBJECTS, { updates }),
    deleteObject: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.WHITEBOARDS_DELETE_OBJECT, { id }),
    batchDeleteObjects: (ids: string[]) =>
      ipcRenderer.invoke(IPC_CHANNELS.WHITEBOARDS_BATCH_DELETE_OBJECTS, { ids }),
    listConnections: (whiteboardId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.WHITEBOARDS_LIST_CONNECTIONS, { whiteboardId }),
    createConnection: (input: CreateConnectionInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.WHITEBOARDS_CREATE_CONNECTION, input),
    updateConnection: (id: string, patch: UpdateConnectionPatch) =>
      ipcRenderer.invoke(IPC_CHANNELS.WHITEBOARDS_UPDATE_CONNECTION, { id, patch }),
    deleteConnection: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.WHITEBOARDS_DELETE_CONNECTION, { id }),
    getStatsMap: () => ipcRenderer.invoke(IPC_CHANNELS.WHITEBOARDS_GET_STATS_MAP),
    listWhiteboardIdsByTarget: (targetId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.WHITEBOARDS_LIST_IDS_BY_TARGET, { targetId }),
    moveObjectsAcross: (input: MoveObjectsAcrossWhiteboardsInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.WHITEBOARDS_MOVE_OBJECTS_ACROSS, input),
    moveHierarchy: (input: MoveWhiteboardHierarchyInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.WHITEBOARDS_MOVE_HIERARCHY, input),
  },

  documents: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.DOCUMENTS_LIST),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DOCUMENTS_GET, { id }),
    create: (input: CreateDocumentInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.DOCUMENTS_CREATE, input),
    updatePosition: (id: string, lastPositionJson: string, totalPages?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.DOCUMENTS_UPDATE_POSITION, {
        id,
        lastPositionJson,
        totalPages,
      }),
    updateCover: (id: string, coverReferenceId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.DOCUMENTS_UPDATE_COVER, { id, coverReferenceId }),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DOCUMENTS_DELETE, { id }),
  },

  highlights: {
    list: (filter?: HighlightListFilter) =>
      ipcRenderer.invoke(IPC_CHANNELS.HIGHLIGHTS_LIST, filter),
    listBySource: (sourceId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.HIGHLIGHTS_LIST_BY_SOURCE, { sourceId }),
    create: (input: CreateHighlightElementInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.HIGHLIGHTS_CREATE, input),
    updateNote: (id: string, noteText: string, noteJson?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.HIGHLIGHTS_UPDATE_NOTE, { id, noteText, noteJson }),
    updateColor: (id: string, color: AnnotationColor) =>
      ipcRenderer.invoke(IPC_CHANNELS.HIGHLIGHTS_UPDATE_COLOR, { id, color }),
    updateRects: (id: string, rects: HighlightRect[], imageReferenceId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.HIGHLIGHTS_UPDATE_RECTS, { id, rects, imageReferenceId }),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.HIGHLIGHTS_DELETE, { id }),
    listTags: (highlightId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.HIGHLIGHTS_LIST_TAGS, { highlightId }),
    addTag: (highlightId: string, tagName: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.HIGHLIGHTS_ADD_TAG, { highlightId, tagName }),
    removeTag: (highlightId: string, tagId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.HIGHLIGHTS_REMOVE_TAG, { highlightId, tagId }),
  },

  tags: {
    listWithCounts: () => ipcRenderer.invoke(IPC_CHANNELS.TAGS_LIST_WITH_COUNTS),
    create: (
      name: string,
      color?: string | null,
      tagGroupId?: string | null,
      parentTagId?: string | null
    ) => ipcRenderer.invoke(IPC_CHANNELS.TAGS_CREATE, { name, color, tagGroupId, parentTagId }),
    update: (input: UpdateTagInput) => ipcRenderer.invoke(IPC_CHANNELS.TAGS_UPDATE, input),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.TAGS_DELETE, { id }),
    listCardsByTag: (tagId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.TAGS_LIST_CARDS_BY_TAG, { tagId }),
    listHighlightsByTag: (tagId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.TAGS_LIST_HIGHLIGHTS_BY_TAG, { tagId }),
    assignToCard: (cardId: string, tagId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.TAGS_ASSIGN_TO_CARD, { cardId, tagId }),
    removeFromCard: (cardId: string, tagId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.TAGS_REMOVE_FROM_CARD, { cardId, tagId }),
    listGroups: () => ipcRenderer.invoke(IPC_CHANNELS.TAG_GROUPS_LIST),
    createGroup: (name: string) => ipcRenderer.invoke(IPC_CHANNELS.TAG_GROUPS_CREATE, { name }),
    updateGroup: (input: {
      id: string;
      name?: string;
      isFolded?: number;
      sortOrder?: number;
    }) => ipcRenderer.invoke(IPC_CHANNELS.TAG_GROUPS_UPDATE, input),
    deleteGroup: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.TAG_GROUPS_DELETE, { id }),
  },

  properties: {
    listAll: () => ipcRenderer.invoke(IPC_CHANNELS.PROPERTIES_LIST_ALL),
    listByTag: (tagId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROPERTIES_LIST_BY_TAG, { tagId }),
    listForCard: (cardId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROPERTIES_LIST_FOR_CARD, { cardId }),
    createForTag: (input: CreatePropertyInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROPERTIES_CREATE_FOR_TAG, input),
    attachToTag: (tagId: string, propertyId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROPERTIES_ATTACH_TO_TAG, { tagId, propertyId }),
    detachFromTag: (tagId: string, propertyId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROPERTIES_DETACH_FROM_TAG, { tagId, propertyId }),
    update: (input: UpdatePropertyInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROPERTIES_UPDATE, input),
    updateBinding: (input: UpdatePropertyBindingInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROPERTIES_UPDATE_BINDING, input),
    delete: (propertyId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROPERTIES_DELETE, { propertyId }),
    deleteOption: (propertyId: string, optionId: string, deleteTaggedCards?: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROPERTIES_DELETE_OPTION, {
        propertyId,
        optionId,
        deleteTaggedCards,
      }),
    listValuesByTag: (tagId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CARD_PROPERTIES_LIST_BY_TAG, { tagId }),
    listValuesByCard: (cardId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CARD_PROPERTIES_LIST_BY_CARD, { cardId }),
    setValue: (cardId: string, propertyId: string, valueJson: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CARD_PROPERTIES_SET_VALUE, {
        cardId,
        propertyId,
        valueJson,
      }),
    clearValue: (cardId: string, propertyId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CARD_PROPERTIES_CLEAR_VALUE, { cardId, propertyId }),
  },

  localFile: {
    add: (fileInfo: { path: string; name: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCAL_FILE_ADD, fileInfo),
    acquirePreview: (referenceId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCAL_FILE_ACQUIRE_PREVIEW, { referenceId }),
    openExternal: (referenceId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCAL_FILE_OPEN_EXTERNAL, { referenceId }),
    pickDocuments: () => ipcRenderer.invoke(IPC_CHANNELS.LOCAL_FILE_PICK_DOCUMENTS),
    readBuffer: (referenceId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCAL_FILE_READ_BUFFER, { referenceId }),
    saveImage: (dataUrl: string, name: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.LOCAL_FILE_SAVE_IMAGE, { dataUrl, name }),
    getPathForFile: (file: { path?: string; name: string }) =>
      webUtils.getPathForFile(file as unknown as Electron.FileFilter & File),
  },

  notifications: {
    send: (input: { title: string; body: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATIONS_SEND, input),
    listRecent: () => ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATIONS_LIST_RECENT),
  },

  update: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_GET_STATE),
    checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CHECK),
  },

  system: {
    getCliStatus: () => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_GET_CLI_STATUS),
    getDiagnostics: () => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_GET_DIAGNOSTICS),
    setNativeTheme: (theme: NativeThemeSource) => {
      ipcRenderer.send(IPC_CHANNELS.SYSTEM_SET_NATIVE_THEME, theme);
    },
    createWindow: () => {
      ipcRenderer.send(IPC_CHANNELS.SYSTEM_CREATE_WINDOW);
    },
  },

  cli: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_GET_CLI_STATUS),
  },

  diagnostics: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_GET_DIAGNOSTICS),
  },

  setNativeTheme: (theme: NativeThemeSource) => {
    ipcRenderer.send(IPC_CHANNELS.SYSTEM_SET_NATIVE_THEME, theme);
  },

  createWindow: () => {
    ipcRenderer.send(IPC_CHANNELS.SYSTEM_CREATE_WINDOW);
  },
};

contextBridge.exposeInMainWorld('heptaElectronApi', api);
