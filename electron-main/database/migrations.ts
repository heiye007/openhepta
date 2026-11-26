export interface Migration {
  version: number;
  name: string;
  up: string[];
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: [
      `CREATE TABLE IF NOT EXISTS cards (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        content_json TEXT NOT NULL DEFAULT '{}',
        content_text TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        color TEXT DEFAULT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_cards_title ON cards(title);`,
      `CREATE INDEX IF NOT EXISTS idx_cards_updated ON cards(updated_at);`,
      `CREATE INDEX IF NOT EXISTS idx_cards_is_deleted ON cards(is_deleted);`,
      `CREATE TABLE IF NOT EXISTS whiteboards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        viewport_pan_x REAL NOT NULL DEFAULT 0.0,
        viewport_pan_y REAL NOT NULL DEFAULT 0.0,
        viewport_zoom REAL NOT NULL DEFAULT 1.0
      );`,
      `CREATE TABLE IF NOT EXISTS whiteboard_objects (
        id TEXT PRIMARY KEY,
        whiteboard_id TEXT NOT NULL,
        object_type TEXT NOT NULL,
        target_id TEXT,
        pos_x REAL NOT NULL,
        pos_y REAL NOT NULL,
        width REAL NOT NULL,
        height REAL NOT NULL,
        z_index INTEGER NOT NULL DEFAULT 0,
        properties_json TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY(whiteboard_id) REFERENCES whiteboards(id) ON DELETE CASCADE
      );`,
      `CREATE TABLE IF NOT EXISTS connections (
        id TEXT PRIMARY KEY,
        whiteboard_id TEXT NOT NULL,
        source_object_id TEXT NOT NULL,
        target_object_id TEXT NOT NULL,
        label TEXT,
        style_json TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY(whiteboard_id) REFERENCES whiteboards(id) ON DELETE CASCADE
      );`,
      `CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        color TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS card_tags (
        card_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        PRIMARY KEY (card_id, tag_id)
      );`,
      `CREATE TABLE IF NOT EXISTS card_references (
        source_card_id TEXT NOT NULL,
        target_card_id TEXT NOT NULL,
        PRIMARY KEY (source_card_id, target_card_id)
      );`,
    ],
  },
  {
    version: 2,
    name: 'fts5_search',
    up: [
      `CREATE VIRTUAL TABLE IF NOT EXISTS cards_fts USING fts5(
        id UNINDEXED,
        title,
        content_text,
        content='cards',
        content_rowid='rowid'
      );`,
      `CREATE TRIGGER IF NOT EXISTS cards_ai AFTER INSERT ON cards BEGIN
        INSERT INTO cards_fts(rowid, id, title, content_text) VALUES (new.rowid, new.id, new.title, new.content_text);
      END;`,
      `CREATE TRIGGER IF NOT EXISTS cards_ad AFTER DELETE ON cards BEGIN
        INSERT INTO cards_fts(cards_fts, rowid, id, title, content_text) VALUES('delete', old.rowid, old.id, old.title, old.content_text);
      END;`,
      `CREATE TRIGGER IF NOT EXISTS cards_au AFTER UPDATE ON cards BEGIN
        INSERT INTO cards_fts(cards_fts, rowid, id, title, content_text) VALUES('delete', old.rowid, old.id, old.title, old.content_text);
        INSERT INTO cards_fts(rowid, id, title, content_text) VALUES (new.rowid, new.id, new.title, new.content_text);
      END;`,
    ],
  },
  {
    version: 3,
    name: 'pdf_epub_reader',
    up: [
      `CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        doc_type TEXT NOT NULL,
        title TEXT NOT NULL,
        file_reference_id TEXT NOT NULL,
        cover_reference_id TEXT,
        total_pages INTEGER DEFAULT 0,
        last_position_json TEXT NOT NULL DEFAULT '{}',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER NOT NULL DEFAULT 0
      );`,
      `CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(doc_type);`,
      `CREATE INDEX IF NOT EXISTS idx_documents_updated ON documents(updated_at);`,
      `CREATE INDEX IF NOT EXISTS idx_documents_is_deleted ON documents(is_deleted);`,
      `CREATE TABLE IF NOT EXISTS highlight_elements (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        source_type TEXT NOT NULL,
        highlight_type TEXT NOT NULL DEFAULT 'text',
        page_number INTEGER,
        epub_cfi TEXT,
        rects_json TEXT NOT NULL DEFAULT '[]',
        text_content TEXT NOT NULL DEFAULT '',
        image_reference_id TEXT,
        note_json TEXT NOT NULL DEFAULT '{}',
        note_text TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT 'yellow',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER NOT NULL DEFAULT 0
      );`,
      `CREATE INDEX IF NOT EXISTS idx_highlights_source ON highlight_elements(source_id);`,
      `CREATE INDEX IF NOT EXISTS idx_highlights_color ON highlight_elements(color);`,
      `CREATE INDEX IF NOT EXISTS idx_highlights_is_deleted ON highlight_elements(is_deleted);`,
    ],
  },
  {
    version: 4,
    name: 'whiteboard_options',
    up: [
      `ALTER TABLE whiteboards ADD COLUMN options_json TEXT NOT NULL DEFAULT '{}';`,
    ],
  },
  {
    version: 5,
    name: 'highlight_tags',
    up: [
      `CREATE TABLE IF NOT EXISTS highlight_tags (
        highlight_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        PRIMARY KEY (highlight_id, tag_id)
      );`,
      `CREATE INDEX IF NOT EXISTS idx_highlight_tags_tag ON highlight_tags(tag_id);`,
    ],
  },
  {
    version: 6,
    name: 'sub_whiteboards',
    up: [
      `ALTER TABLE whiteboards ADD COLUMN parent_whiteboard_id TEXT;`,
      `CREATE INDEX IF NOT EXISTS idx_whiteboards_parent ON whiteboards(parent_whiteboard_id);`,
    ],
  },
  {
    version: 7,
    name: 'tag_database_properties',
    up: [
      `CREATE TABLE IF NOT EXISTS tag_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_folded INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );`,
      `ALTER TABLE tags ADD COLUMN tag_group_id TEXT;`,
      `ALTER TABLE tags ADD COLUMN parent_tag_id TEXT;`,
      `ALTER TABLE tags ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;`,
      `ALTER TABLE tags ADD COLUMN is_folded INTEGER NOT NULL DEFAULT 0;`,
      `ALTER TABLE tags ADD COLUMN kanban_group_by_property_id TEXT;`,
      `CREATE INDEX IF NOT EXISTS idx_tags_group ON tags(tag_group_id);`,
      `CREATE INDEX IF NOT EXISTS idx_tags_parent ON tags(parent_tag_id);`,
      `CREATE TABLE IF NOT EXISTS properties (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        config_json TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS tag_properties (
        tag_id TEXT NOT NULL,
        property_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        width INTEGER NOT NULL DEFAULT 160,
        should_wrap INTEGER NOT NULL DEFAULT 0,
        is_hidden INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (tag_id, property_id)
      );`,
      `CREATE INDEX IF NOT EXISTS idx_tag_properties_prop ON tag_properties(property_id);`,
      `CREATE TABLE IF NOT EXISTS card_property_values (
        card_id TEXT NOT NULL,
        property_id TEXT NOT NULL,
        value_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (card_id, property_id)
      );`,
      `CREATE INDEX IF NOT EXISTS idx_card_prop_values_prop ON card_property_values(property_id);`,
    ],
  },
];
