export interface Card {
  id: string;
  title: string;
  content_json: string;
  content_text: string;
  created_at: number;
  updated_at: number;
  is_deleted: number;
  color?: string | null;
}

export interface WhiteboardOptions {
  subWhiteboardView: 'list' | 'preview';
  showTagsAndProperties: boolean;
  isFullTitleFoldedCardMode: boolean;
  isLargeTextAtSmallZoom: boolean;
  showMentionLinks: boolean;
  smartGuidesEnabled: boolean;
  showGridBackground: boolean;
  snapToGrid: boolean;
  showMinimap: boolean;
  isFocusMode: boolean;
  connectionDepth: number;
  focusModeOpacity: number;
  previewMode: 'static' | 'markdown';
  navigationMode: 'mouse' | 'trackpad';
}

export interface Whiteboard {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  is_deleted: number;
  viewport_pan_x: number;
  viewport_pan_y: number;
  viewport_zoom: number;
  options_json?: string;
  parent_whiteboard_id?: string | null;
}

export interface CreateWhiteboardInput {
  name?: string;
  parentWhiteboardId?: string | null;
}

export type WhiteboardObjectType =
  | 'card'
  | 'section'
  | 'mindmap_node'
  | 'text'
  | 'media'
  | 'journal'
  | 'whiteboard_shortcut'
  | 'pdf'
  | 'epub'
  | 'highlight';

export interface ObjectDimensions {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
}

export const HEPTA_DEFAULT_DIMENSIONS: Record<string, ObjectDimensions> = {
  card: { width: 520, height: 720, minWidth: 308, minHeight: 229.5 },
  section: { width: 600, height: 480, minWidth: 280, minHeight: 100 },
  mindmap_node: { width: 360, height: 200, minWidth: 200, minHeight: 120 },
  text: { width: 406, height: 41.5, minWidth: 100, minHeight: 30 },
  journal: { width: 520, height: 223.5, minWidth: 308, minHeight: 223.5 },
  media: { width: 520, height: 294, minWidth: 308, minHeight: 64 },
  sub_whiteboard: { width: 640, height: 420, minWidth: 220, minHeight: 128 },
  whiteboard_shortcut: { width: 640, height: 128, minWidth: 220, minHeight: 128 },
  pdf: { width: 420, height: 560, minWidth: 260, minHeight: 320 },
  epub: { width: 420, height: 560, minWidth: 260, minHeight: 320 },
  highlight: { width: 380, height: 180, minWidth: 240, minHeight: 100 },
};

export interface SubWhiteboardProperties {
  name?: string;
  color?: string;
  isChild?: boolean;
  isAutoSize?: boolean;
}

export interface WhiteboardChildItemSummary {
  id: string;
  objectType: WhiteboardObjectType;
  title: string;
  color: string;
  isChildWhiteboard?: boolean;
}

export interface MoveObjectsAcrossWhiteboardsInput {
  sourceWhiteboardId: string;
  targetWhiteboardId: string;
  objectIds: string[];
  copy?: boolean;
}

export interface MoveObjectsAcrossWhiteboardsResult {
  movedObjectIds: string[];
  cycleBlockedIds: string[];
  movedConnectionCount: number;
  deletedConnectionCount: number;
}

export interface MoveWhiteboardHierarchyInput {
  whiteboardId: string;
  targetParentWhiteboardId: string | null;
}

export interface MoveWhiteboardHierarchyResult {
  status: 'moved' | 'alreadyAtTarget' | 'cycleBlocked' | 'notFound';
}

export interface ConnectionStyle {
  type: 'curve' | 'straight' | 'elbow';
  beginPos?: 'auto' | 'top' | 'bottom' | 'left' | 'right';
  endPos?: 'auto' | 'top' | 'bottom' | 'left' | 'right';
  beginStyle?: 'none' | 'default' | 'lineArrow';
  endStyle?: 'none' | 'default' | 'lineArrow';
  lineStyle?: 'regular' | 'dashed';
  strokeWidth: number;
  strokeColor: string;
  dashed?: boolean;
}

export type AlignmentType =
  | 'left'
  | 'centerHorizontally'
  | 'right'
  | 'top'
  | 'centerVertically'
  | 'bottom';

export type ArrangeLayoutType = 'row' | 'column' | 'grid';

export interface WhiteboardObject {
  id: string;
  whiteboard_id: string;
  object_type: WhiteboardObjectType;
  target_id: string | null;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  z_index: number;
  properties_json: string;
}

export interface Connection {
  id: string;
  whiteboard_id: string;
  source_object_id: string;
  target_object_id: string;
  label?: string | null;
  style_json: string;
}

export type OptionColor =
  | 'white'
  | 'yellow'
  | 'red'
  | 'blue'
  | 'green'
  | 'black'
  | 'orange'
  | 'purple';

export interface TagGroup {
  id: string;
  name: string;
  sort_order: number;
  is_folded: number;
  created_at: number;
  updated_at: number;
}

export interface Tag {
  id: string;
  name: string;
  color?: string | null;
  tag_group_id?: string | null;
  parent_tag_id?: string | null;
  sort_order?: number;
  is_folded?: number;
  kanban_group_by_property_id?: string | null;
}

export interface TagWithCountRow extends Tag {
  card_count: number;
  highlight_count?: number;
}

export type PropertyType =
  | 'text'
  | 'number'
  | 'select'
  | 'multiSelect'
  | 'date'
  | 'checkbox'
  | 'url'
  | 'phone'
  | 'email'
  | 'relation';

export interface PropertyOption {
  id: string;
  name: string;
  color: OptionColor;
}

export interface PropertyConfig {
  options?: PropertyOption[];
  tagId?: string;
}

export interface TagProperty {
  id: string;
  name: string;
  type: PropertyType;
  config_json: string;
  created_at: number;
  updated_at: number;
}

export interface TagPropertyJoined extends TagProperty {
  tag_id: string;
  sort_order: number;
  width: number;
  should_wrap: number;
  is_hidden: number;
  bound_tag_ids?: string[];
}

export interface CardPropertyValue {
  card_id: string;
  property_id: string;
  value_json: string;
  updated_at: number;
}

export interface RelationCardRef {
  id: string;
  type: 'card';
}

export interface DatePropertyValue {
  start: string;
}

export interface UpdateTagInput {
  id: string;
  name?: string;
  color?: string | null;
  tagGroupId?: string | null;
  parentTagId?: string | null;
  sortOrder?: number;
  isFolded?: number;
  kanbanGroupByPropertyId?: string | null;
}

export interface CreatePropertyInput {
  tagId: string;
  name: string;
  type: PropertyType;
  config?: PropertyConfig;
}

export interface UpdatePropertyInput {
  id: string;
  name?: string;
  config?: PropertyConfig;
}

export interface UpdatePropertyBindingInput {
  tagId: string;
  propertyId: string;
  sortOrder?: number;
  width?: number;
  shouldWrap?: number;
  isHidden?: number;
}

export interface CardTagBindingRow {
  card_id: string;
  tag_id: string;
  name: string;
  color: string | null;
}

export interface CardBacklinkRow {
  id: string;
  title: string;
  content_text: string;
  updated_at: number;
}

export interface CardWhiteboardRow {
  id: string;
  name: string;
  updated_at: number;
}

export interface CardReferenceRow {
  source_card_id: string;
  target_card_id: string;
}

export interface CardBacklinkCountRow {
  target_card_id: string;
  cnt: number;
}

export interface CardWhiteboardBindingRow {
  target_id: string;
  whiteboard_id: string;
  name: string;
}

export interface WhiteboardStatsRow {
  cards: number;
  sections: number;
  mindmaps: number;
  media: number;
  subWhiteboards: number;
  connections: number;
  totalObjects: number;
  objects: WhiteboardObject[];
  connList: Connection[];
  cardColorMap: Record<string, string | null>;
  highlightColorMap: Record<string, string>;
  itemSummaries?: WhiteboardChildItemSummary[];
  hasOtherContent?: boolean;
}

export type AnnotationColor =
  | 'yellow'
  | 'red'
  | 'green'
  | 'blue'
  | 'purple'
  | 'orange'
  | 'pink';

export type DocumentType = 'pdf' | 'epub';

export interface DocumentRecord {
  id: string;
  doc_type: DocumentType;
  title: string;
  file_reference_id: string;
  cover_reference_id?: string | null;
  total_pages: number;
  last_position_json: string;
  metadata_json: string;
  created_at: number;
  updated_at: number;
  is_deleted: number;
}

export type HighlightSourceType = 'pdf' | 'epub' | 'card';
export type HighlightType = 'text' | 'area';

export interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface HighlightElement {
  id: string;
  source_id: string;
  source_type: HighlightSourceType;
  highlight_type: HighlightType;
  page_number?: number | null;
  epub_cfi?: string | null;
  rects_json: string;
  text_content: string;
  image_reference_id?: string | null;
  note_json: string;
  note_text: string;
  color: AnnotationColor;
  created_at: number;
  updated_at: number;
  is_deleted: number;
  tags?: Tag[];
}

export interface HighlightJoinedRow extends HighlightElement {
  doc_title?: string | null;
  doc_type?: string | null;
}

export interface PickedDocumentFile {
  path: string;
  name: string;
  docType: DocumentType;
}

export interface LocalFileReference {
  reference_id: string;
  sha256: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  created_at: number;
  updated_at: number;
}

export interface LocalFileInstance {
  instance_id: string;
  reference_id: string;
  owner_id: string;
  is_deleted: number;
  created_at: number;
}

export interface LocalFileAddResult {
  referenceId: string;
  sha256: string;
  previewUrl: string;
  reference?: LocalFileReference;
  instance?: LocalFileInstance;
}

export interface DbRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface DbStatement {
  sql: string;
  params?: unknown[];
}

export type NativeThemeSource = 'light' | 'dark' | 'system';

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  createdAt: number;
}

export interface AppUpdateState {
  currentVersion: string;
  latestVersion: string;
  status: 'idle' | 'checking' | 'up-to-date' | 'available' | 'error';
  lastCheckedAt: number | null;
  errorMessage?: string | null;
}

export interface SystemDiagnosticsState {
  isEnabled: boolean;
  uptime: number;
  platform: string;
  arch: string;
  electronVersion: string;
  nodeVersion: string;
}

export interface CreateCardInput {
  id?: string;
  title?: string;
  contentJson?: string;
  contentText?: string;
  color?: string | null;
}

export interface CreateWhiteboardObjectInput {
  id?: string;
  whiteboardId: string;
  objectType: WhiteboardObjectType;
  targetId?: string | null;
  posX: number;
  posY: number;
  width?: number;
  height?: number;
  zIndex?: number;
  propertiesJson?: string;
}

export interface WhiteboardObjectPatch {
  id: string;
  posX?: number;
  posY?: number;
  width?: number;
  height?: number;
  zIndex?: number;
  propertiesJson?: string;
}

export interface CreateConnectionInput {
  id?: string;
  whiteboardId: string;
  sourceObjectId: string;
  targetObjectId: string;
  label?: string | null;
  styleJson?: string;
}

export interface UpdateConnectionPatch {
  label?: string | null;
  styleJson?: string;
}

export interface CreateDocumentInput {
  id?: string;
  docType: DocumentType;
  title: string;
  fileReferenceId: string;
  coverReferenceId?: string | null;
  totalPages?: number;
  lastPositionJson?: string;
  metadataJson?: string;
}

export interface CreateHighlightElementInput {
  id?: string;
  sourceId: string;
  sourceType: HighlightSourceType;
  highlightType?: HighlightType;
  pageNumber?: number | null;
  epubCfi?: string | null;
  rects?: HighlightRect[];
  rectsJson?: string;
  textContent: string;
  imageReferenceId?: string | null;
  noteJson?: string;
  noteText?: string;
  color: AnnotationColor;
}

export interface HighlightListFilter {
  sourceType?: HighlightSourceType | 'all';
  color?: AnnotationColor | 'all';
  search?: string;
}

export type MindMapLayout = 'horizontal' | 'vertical';

export type MindMapNodeSide = 'left' | 'right';

export type MindMapResolvedSide = 'left' | 'right' | 'top' | 'bottom';

export type MindMapNodeType =
  | 'textNode'
  | 'cardNode'
  | 'textElementNode'
  | 'highlightElementNode';

export type MindMapEdgeColor =
  | 'blue'
  | 'green'
  | 'orange'
  | 'purple'
  | 'red'
  | 'yellow'
  | 'pink'
  | 'gray';

export interface MindMapNodeData {
  id: string;
  type: MindMapNodeType;
  parentId: string | null;
  childNodeIds: string[];
  side: MindMapNodeSide | null;
  edgeColor: MindMapEdgeColor;
  isCollapsed: boolean;
  content: string;
  cardId?: string | null;
  highlightId?: string | null;
  sourceObjectId?: string | null;
  width?: number;
  height?: number;
  lastEditedTime: number;
}

export interface MindMapData {
  version: 2;
  layout: MindMapLayout;
  rootNodeId: string;
  nodes: MindMapNodeData[];
  lastEditedTime: number;
}
