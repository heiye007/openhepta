import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import {
  Card,
  DocumentRecord,
  HEPTA_DEFAULT_DIMENSIONS,
  Whiteboard,
} from '@shared/types';
import { heptaClient } from './client';
import { AppModalProvider } from './primitives/AppModal';
import { Sidebar, SidebarView } from './features/sidebar';
import { WhiteboardCanvas } from './features/whiteboard';

const WhiteboardsView = lazy(() =>
  import('./features/whiteboards-library').then((m) => ({ default: m.WhiteboardsView }))
);
const CardLibraryView = lazy(() =>
  import('./features/card-library').then((m) => ({ default: m.CardLibraryView }))
);
const FullCardModal = lazy(() =>
  import('./features/card-library').then((m) => ({ default: m.FullCardModal }))
);
const CardDrawer = lazy(() =>
  import('./features/card-drawer').then((m) => ({ default: m.CardDrawer }))
);
const JournalView = lazy(() =>
  import('./features/journal').then((m) => ({ default: m.JournalView }))
);
const InboxView = lazy(() =>
  import('./features/inbox').then((m) => ({ default: m.InboxView }))
);
const TagsView = lazy(() =>
  import('./features/tags').then((m) => ({ default: m.TagsView }))
);
const HighlightsView = lazy(() =>
  import('./features/highlights').then((m) => ({ default: m.HighlightsView }))
);
const GlobalSearchModal = lazy(() =>
  import('./features/search').then((m) => ({ default: m.GlobalSearchModal }))
);
const ChatView = lazy(() =>
  import('./features/chat').then((m) => ({ default: m.ChatView }))
);
const SystemStatusView = lazy(() =>
  import('./features/system-status').then((m) => ({ default: m.SystemStatusView }))
);
const DocumentReaderShell = lazy(() =>
  import('./features/reader').then((m) => ({ default: m.DocumentReaderShell }))
);

function AppContent() {
  const [currentView, setCurrentView] = useState<SidebarView>('whiteboard');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    heptaClient.system.setNativeTheme(theme);
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const [whiteboards, setWhiteboards] = useState<Whiteboard[]>([]);
  const [activeWhiteboardId, setActiveWhiteboardId] = useState<string>('wb-main');
  const [pinnedWhiteboardIds, setPinnedWhiteboardIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('openhepta-pinned-whiteboards');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const handleTogglePinWhiteboard = useCallback((wbId: string) => {
    setPinnedWhiteboardIds((prev) => {
      const next = prev.includes(wbId) ? prev.filter((id) => id !== wbId) : [wbId, ...prev];
      try {
        localStorage.setItem('openhepta-pinned-whiteboards', JSON.stringify(next));
      } catch {
      }
      return next;
    });
  }, []);

  const [cards, setCards] = useState<Card[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const [sidePanelCardIds, setSidePanelCardIds] = useState<string[]>([]);
  const [sidePanelDocFocusMap, setSidePanelDocFocusMap] = useState<
    Record<string, string | null | undefined>
  >({});
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);

  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [fullCardId, setFullCardId] = useState<string | null>(null);

  const [activeReader, setActiveReader] = useState<{
    documentId: string;
    highlightId?: string | null;
  } | null>(null);
  const [canvasRefreshKey, setCanvasRefreshKey] = useState(0);

  const handleOpenCardInSidePanel = useCallback((cardId: string) => {
    setSidePanelCardIds((prev) => {
      if (prev.includes(cardId)) {
        return [cardId, ...prev.filter((id) => id !== cardId)];
      }
      return [cardId, ...prev];
    });
    setIsSidePanelOpen(true);
  }, []);

  const handleRemoveSidePanelReference = useCallback((cardId: string) => {
    setSidePanelCardIds((prev) => prev.filter((id) => id !== cardId));
  }, []);

  const loadWhiteboards = useCallback(async () => {
    try {
      let wbs = await heptaClient.whiteboards.list();
      if (wbs.length === 0) {
        await heptaClient.whiteboards.create('Main Space');
        wbs = await heptaClient.whiteboards.list();
      }
      setWhiteboards(wbs);
      setActiveWhiteboardId((curr) =>
        wbs.length > 0 && !wbs.some((w) => w.id === curr) ? wbs[0].id : curr
      );
    } catch (err) {
      console.error('Failed to load whiteboards:', err);
    }
  }, []);

  const loadCards = useCallback(async () => {
    try {
      const results = await heptaClient.cards.list(searchQuery.trim() || undefined);
      setCards(results);
    } catch (err) {
      console.error('Failed to load cards:', err);
    }
  }, [searchQuery]);

  const loadDocuments = useCallback(async () => {
    try {
      const docs = await heptaClient.documents.list();
      setDocuments(docs || []);
    } catch (err) {
      console.error('Failed to load documents:', err);
    }
  }, []);

  useEffect(() => {
    loadWhiteboards();
  }, [loadWhiteboards]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments, canvasRefreshKey]);

  const handleCreateNewWhiteboard = async () => {
    try {
      const created = await heptaClient.whiteboards.create('Untitled Whiteboard');
      await loadWhiteboards();
      setActiveWhiteboardId(created.id);
      setCurrentView('whiteboard');
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateWhiteboardName = async (id: string, name: string) => {
    try {
      await heptaClient.whiteboards.rename(id, name);
      setWhiteboards((prev) => prev.map((w) => (w.id === id ? { ...w, name } : w)));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteWhiteboard = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation?.();
    if (whiteboards.length <= 1) return;
    try {
      await heptaClient.whiteboards.delete(id);
      await loadWhiteboards();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateCard = useCallback(
    async (title: string, contentText = '', color?: string) => {
      try {
        const created = await heptaClient.cards.create({
          title: title.trim(),
          contentJson: '{}',
          contentText: contentText.trim(),
          color: color || null,
        });
        await loadCards();
        handleOpenCardInSidePanel(created.id);
      } catch (err) {
        console.error(err);
      }
    },
    [loadCards, handleOpenCardInSidePanel]
  );

  const handleCreateQuickCard = useCallback(async () => {
    await handleCreateCard('Untitled', '');
  }, [handleCreateCard]);

  const handleDuplicateCard = useCallback(
    async (card: Card) => {
      try {
        const duplicated = await heptaClient.cards.duplicate(card.id);
        await loadCards();
        if (duplicated) {
          setFullCardId(duplicated.id);
        }
      } catch (err) {
        console.error('Failed to duplicate card:', err);
      }
    },
    [loadCards]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleCreateQuickCard();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCreateQuickCard]);

  useEffect(() => {
    const handleOpenWhiteboard = (e: Event) => {
      const detail = (e as CustomEvent<{ whiteboardId?: string }>).detail;
      if (detail?.whiteboardId) {
        setActiveWhiteboardId(detail.whiteboardId);
        setCurrentView('whiteboard');
      }
    };
    const handleRequestWhiteboards = (e: Event) => {
      const detail = (
        e as CustomEvent<{ resolve?: (rows: Array<{ id: string; name: string }>) => void }>
      ).detail;
      if (!detail?.resolve) return;
      heptaClient.whiteboards
        .list()
        .then((rows) => detail.resolve?.(rows.map((w) => ({ id: w.id, name: w.name }))))
        .catch(() => detail.resolve?.([]));
    };
    const handleCreateWhiteboardFromEditor = (e: Event) => {
      const detail = (
        e as CustomEvent<{
          name?: string;
          resolve?: (row: { id: string; name: string } | null) => void;
        }>
      ).detail;
      if (!detail?.resolve) return;
      heptaClient.whiteboards
        .create(detail.name || 'Untitled Whiteboard')
        .then(async (created) => {
          await loadWhiteboards();
          detail.resolve?.({ id: created.id, name: created.name });
        })
        .catch(() => detail.resolve?.(null));
    };

    window.addEventListener('openhepta:open-whiteboard', handleOpenWhiteboard);
    window.addEventListener('openhepta:request-whiteboards', handleRequestWhiteboards);
    window.addEventListener('openhepta:create-whiteboard', handleCreateWhiteboardFromEditor);
    return () => {
      window.removeEventListener('openhepta:open-whiteboard', handleOpenWhiteboard);
      window.removeEventListener('openhepta:request-whiteboards', handleRequestWhiteboards);
      window.removeEventListener('openhepta:create-whiteboard', handleCreateWhiteboardFromEditor);
    };
  }, [loadWhiteboards]);

  const handleAddCardToWhiteboard = async (cardId: string, whiteboardId?: string) => {
    const targetWbId = whiteboardId || activeWhiteboardId;
    const initialProps = JSON.stringify({
      color: 'white',
      isFolded: false,
      isAutoHeight: true,
      foldedHeight: 46,
    });
    try {
      await heptaClient.whiteboards.createObject({
        whiteboardId: targetWbId,
        objectType: 'card',
        targetId: cardId,
        posX: 250,
        posY: 200,
        width: 520,
        height: 720,
        zIndex: 10,
        propertiesJson: initialProps,
      });
      setActiveWhiteboardId(targetWbId);
      setCurrentView('whiteboard');
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenDocument = useCallback(
    (documentId: string, highlightId?: string | null) => {
      setSidePanelCardIds((prev) => [documentId, ...prev.filter((id) => id !== documentId)]);
      setSidePanelDocFocusMap((prev) => ({
        ...prev,
        [documentId]: highlightId ?? null,
      }));
      setIsSidePanelOpen(true);
      void loadDocuments();
    },
    [loadDocuments]
  );

  const handleOpenFullDocument = useCallback(
    (documentId: string, highlightId?: string | null) => {
      setActiveReader({ documentId, highlightId: highlightId ?? null });
    },
    []
  );

  const handleAddDocumentToWhiteboard = useCallback(
    async (doc: DocumentRecord) => {
      const dims = HEPTA_DEFAULT_DIMENSIONS[doc.doc_type] ?? { width: 420, height: 560 };
      try {
        await heptaClient.whiteboards.createObject({
          whiteboardId: activeWhiteboardId,
          objectType: doc.doc_type,
          targetId: doc.id,
          posX: 240,
          posY: 180,
          width: dims.width,
          height: dims.height,
          zIndex: 10,
          propertiesJson: '{}',
        });
        setCanvasRefreshKey((k) => k + 1);
        setCurrentView('whiteboard');
      } catch (err) {
        console.error('Failed to add document to whiteboard:', err);
      }
    },
    [activeWhiteboardId]
  );

  const handleAddHighlightToWhiteboard = useCallback(
    async (highlightId: string) => {
      const dims = HEPTA_DEFAULT_DIMENSIONS.highlight ?? { width: 380, height: 180 };
      try {
        await heptaClient.whiteboards.createObject({
          whiteboardId: activeWhiteboardId,
          objectType: 'highlight',
          targetId: highlightId,
          posX: 280,
          posY: 220,
          width: dims.width,
          height: dims.height,
          zIndex: 12,
          propertiesJson: '{}',
        });
        setCanvasRefreshKey((k) => k + 1);
        setActiveReader(null);
        setCurrentView('whiteboard');
      } catch (err) {
        console.error('Failed to add highlight to whiteboard:', err);
      }
    },
    [activeWhiteboardId]
  );

  const handleUpdateCardTitle = async (cardId: string, title: string) => {
    try {
      await heptaClient.cards.updateTitle(cardId, title);
      loadCards();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateCardContent = async (
    cardId: string,
    content: { json: string; text: string }
  ) => {
    try {
      await heptaClient.cards.updateContent(cardId, content.json, content.text);
      loadCards();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateCardColor = async (id: string, color: string) => {
    try {
      await heptaClient.cards.updateColor(id, color);
      loadCards();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    try {
      await heptaClient.cards.delete(cardId);
      setSidePanelCardIds((prev) => prev.filter((id) => id !== cardId));
      setFullCardId((prev) => (prev === cardId ? null : prev));
      loadCards();
    } catch (err) {
      console.error(err);
    }
  };

  const currentWhiteboard = useMemo(() => {
    return whiteboards.find((w) => w.id === activeWhiteboardId) || whiteboards[0];
  }, [whiteboards, activeWhiteboardId]);

  const fullCard = useMemo(
    () => (fullCardId ? cards.find((c) => c.id === fullCardId) || null : null),
    [cards, fullCardId]
  );

  const handleInsertNewCardAfter = async (afterCardId: string) => {
    try {
      const created = await heptaClient.cards.create({
        title: 'Untitled',
        contentJson: '{}',
        contentText: '',
      });
      await loadCards();
      setSidePanelCardIds((prev) => {
        const idx = prev.indexOf(afterCardId);
        if (idx === -1) return [created.id, ...prev];
        const next = [...prev];
        next.splice(idx + 1, 0, created.id);
        return next;
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleSwapReference = (cardId: string) => {
    setSidePanelCardIds((prev) => {
      if (prev.length <= 1) return prev;
      const idx = prev.indexOf(cardId);
      if (idx === -1) return prev;
      const targetIdx = idx === 0 ? 1 : 0;
      const next = [...prev];
      const temp = next[idx];
      next[idx] = next[targetIdx];
      next[targetIdx] = temp;
      return next;
    });
  };

  const handleSwitchWhiteboard = useCallback((wbId: string) => {
    setActiveWhiteboardId(wbId);
    setCurrentView('whiteboard');
  }, []);

  const handleCreateSubWhiteboard = useCallback(
    async (parentWhiteboardId: string) => {
      try {
        const created = await heptaClient.whiteboards.create('未命名子白板', parentWhiteboardId);
        const parentObjects = await heptaClient.whiteboards.listObjects(parentWhiteboardId);
        let anchorX = 160;
        let anchorY = 160;
        if (parentObjects.length > 0) {
          let maxX = -Infinity;
          let minY = Infinity;
          for (const item of parentObjects) {
            maxX = Math.max(maxX, item.pos_x + item.width);
            minY = Math.min(minY, item.pos_y);
          }
          anchorX = Math.round(maxX + 80);
          anchorY = Math.round(minY);
        }
        await heptaClient.whiteboards.createObject({
          whiteboardId: parentWhiteboardId,
          objectType: 'whiteboard_shortcut',
          targetId: created.id,
          posX: anchorX,
          posY: anchorY,
          width: 640,
          height: 420,
          propertiesJson: JSON.stringify({
            name: created.name,
            color: 'white',
            isChild: true,
          }),
        });
        await loadWhiteboards();
        window.dispatchEvent(new CustomEvent('openhepta:whiteboards-changed'));
        setActiveWhiteboardId(created.id);
        setCurrentView('whiteboard');
      } catch (err) {
        console.error('Failed to create sub-whiteboard:', err);
      }
    },
    [loadWhiteboards]
  );

  const whiteboardBreadcrumbs = useMemo(() => {
    if (!currentWhiteboard || !currentWhiteboard.parent_whiteboard_id) return [];
    const chain: Array<{ id: string; name: string; onClick?: () => void }> = [];
    let cur: Whiteboard | undefined = currentWhiteboard;
    const visited = new Set<string>();

    while (cur && cur.parent_whiteboard_id && !visited.has(cur.id)) {
      visited.add(cur.id);
      const parent = whiteboards.find((w) => w.id === cur!.parent_whiteboard_id);
      if (parent) {
        const parentId = parent.id;
        chain.unshift({
          id: parentId,
          name: parent.name,
          onClick: () => handleSwitchWhiteboard(parentId),
        });
        cur = parent;
      } else {
        break;
      }
    }
    return chain;
  }, [currentWhiteboard, whiteboards, handleSwitchWhiteboard]);

  useEffect(() => {
    const handleCliCommand = (evt: Event) => {
      const detail = (evt as CustomEvent<Record<string, unknown>>).detail;
      if (!detail || typeof detail.type !== 'string') return;
      switch (detail.type) {
        case 'navigate': {
          if (typeof detail.view === 'string') {
            setCurrentView(detail.view as SidebarView);
          }
          break;
        }
        case 'open-whiteboard': {
          if (typeof detail.whiteboardId === 'string') {
            setActiveWhiteboardId(detail.whiteboardId);
            setCurrentView('whiteboard');
            void loadWhiteboards();
          }
          break;
        }
        case 'toggle-sidebar': {
          if (typeof detail.collapsed === 'boolean') {
            setIsSidebarCollapsed(detail.collapsed);
          } else {
            setIsSidebarCollapsed((prev) => !prev);
          }
          break;
        }
        case 'open-card': {
          if (typeof detail.cardId === 'string') {
            if (detail.full === true) {
              setFullCardId(detail.cardId);
            } else {
              handleOpenCardInSidePanel(detail.cardId);
            }
          }
          break;
        }
        case 'toggle-drawer': {
          if (typeof detail.open === 'boolean') {
            setIsSidePanelOpen(detail.open);
          } else {
            setIsSidePanelOpen((prev) => !prev);
          }
          break;
        }
        case 'open-document': {
          if (typeof detail.documentId === 'string') {
            handleOpenDocument(
              detail.documentId,
              typeof detail.highlightId === 'string' ? detail.highlightId : undefined
            );
          }
          break;
        }
        case 'toggle-search': {
          if (typeof detail.open === 'boolean') {
            setIsSearchModalOpen(detail.open);
          } else {
            setIsSearchModalOpen((prev) => !prev);
          }
          break;
        }
        case 'set-theme': {
          if (detail.mode === 'light' || detail.mode === 'dark') {
            setTheme(detail.mode);
          }
          break;
        }
        case 'refresh-all': {
          void loadWhiteboards();
          void loadCards();
          void loadDocuments();
          setCanvasRefreshKey((k) => k + 1);
          window.dispatchEvent(new CustomEvent('openhepta:whiteboards-changed'));
          break;
        }
      }
    };
    window.addEventListener('openhepta:cli-command', handleCliCommand);
    return () => window.removeEventListener('openhepta:cli-command', handleCliCommand);
  }, [handleOpenCardInSidePanel, handleOpenDocument, loadCards, loadDocuments, loadWhiteboards]);

  return (
    <div
      data-current-view={currentView}
      data-drawer-open={String(isSidePanelOpen)}
      data-theme-mode={theme}
      className="flex w-screen h-screen overflow-hidden bg-background-primary text-text-color font-sans select-none"
    >
      <Sidebar
        currentView={currentView}
        setCurrentView={setCurrentView}
        whiteboards={whiteboards}
        activeWhiteboardId={activeWhiteboardId}
        setActiveWhiteboardId={setActiveWhiteboardId}
        onCreateWhiteboard={handleCreateNewWhiteboard}
        onDeleteWhiteboard={(id) => handleDeleteWhiteboard(id)}
        onRenameWhiteboard={handleUpdateWhiteboardName}
        onOpenSearch={() => setIsSearchModalOpen((prev) => !prev)}
        onCreateCard={handleCreateQuickCard}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        onOpenSettings={() => setCurrentView('status')}
        onOpenGallery={() => setCurrentView('map')}
        pinnedWhiteboardIds={pinnedWhiteboardIds}
        onTogglePinWhiteboard={handleTogglePinWhiteboard}
        onCreateSubWhiteboard={handleCreateSubWhiteboard}
        cardsCount={cards.length}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        currentTheme={theme}
        onToggleTheme={handleToggleTheme}
      />

      <main className="flex-1 h-full relative overflow-hidden flex bg-background-primary">
        <div className="flex-1 h-full relative overflow-hidden flex flex-col min-w-0">
          <Suspense fallback={null}>
            {currentView === 'whiteboard' && currentWhiteboard && (
            <WhiteboardCanvas
              key={currentWhiteboard.id}
              whiteboardId={currentWhiteboard.id}
              whiteboardName={currentWhiteboard.name}
              onUpdateWhiteboardName={handleUpdateWhiteboardName}
              cards={cards}
              onRefreshCards={loadCards}
              onOpenCardDrawer={handleOpenCardInSidePanel}
              onOpenFullCard={(cardId) => setFullCardId(cardId)}
              onDeleteWhiteboard={(id) => handleDeleteWhiteboard(id)}
              onOpenMap={() => setCurrentView('map')}
              isSidebarCollapsed={isSidebarCollapsed}
              onExpandSidebar={() => setIsSidebarCollapsed(false)}
              isSidePanelOpen={isSidePanelOpen}
              onToggleSidePanel={() => setIsSidePanelOpen((prev) => !prev)}
              onSwitchWhiteboard={handleSwitchWhiteboard}
              onOpenDocument={(docId, hlId) => handleOpenDocument(docId, hlId)}
              refreshKey={canvasRefreshKey}
              breadcrumbs={whiteboardBreadcrumbs}
            />
          )}

          {currentView === 'map' && (
            <WhiteboardsView
              whiteboards={whiteboards}
              activeWhiteboardId={activeWhiteboardId}
              pinnedIds={pinnedWhiteboardIds}
              onTogglePin={handleTogglePinWhiteboard}
              onSelectWhiteboard={handleSwitchWhiteboard}
              onCreateWhiteboard={handleCreateNewWhiteboard}
              onRenameWhiteboard={handleUpdateWhiteboardName}
              onDeleteWhiteboard={(id) => handleDeleteWhiteboard(id)}
              onReloadWhiteboards={loadWhiteboards}
              isSidebarCollapsed={isSidebarCollapsed}
              onExpandSidebar={() => setIsSidebarCollapsed(false)}
            />
          )}

          {currentView === 'cards' && (
            <CardLibraryView
              cards={cards}
              whiteboards={whiteboards}
              onOpenCardInSidePanel={handleOpenCardInSidePanel}
              onOpenFullCard={(id) => setFullCardId(id)}
              onAddCardToWhiteboard={handleAddCardToWhiteboard}
              onCreateCard={handleCreateCard}
              onDeleteCard={handleDeleteCard}
              onUpdateColor={handleUpdateCardColor}
              onRefreshCards={loadCards}
              onOpenDocument={(docId) => handleOpenDocument(docId)}
              onAddDocumentToWhiteboard={handleAddDocumentToWhiteboard}
              refreshKey={canvasRefreshKey}
              isSidebarCollapsed={isSidebarCollapsed}
              onExpandSidebar={() => setIsSidebarCollapsed(false)}
            />
          )}

          {currentView === 'journal' && (
            <JournalView
              cards={cards}
              onRefreshCards={loadCards}
              onOpenCardInSidePanel={handleOpenCardInSidePanel}
              onAddCardToWhiteboard={(id) => handleAddCardToWhiteboard(id)}
              isSidebarCollapsed={isSidebarCollapsed}
              onExpandSidebar={() => setIsSidebarCollapsed(false)}
            />
          )}

          {currentView === 'status' && (
            <SystemStatusView
              cardsCount={cards.length}
              whiteboardsCount={whiteboards.length}
              isSidebarCollapsed={isSidebarCollapsed}
              onExpandSidebar={() => setIsSidebarCollapsed(false)}
            />
          )}

          {currentView === 'inbox' && (
            <InboxView
              whiteboards={whiteboards}
              activeWhiteboardId={activeWhiteboardId}
              onRefreshCards={loadCards}
              onOpenCardInSidePanel={handleOpenCardInSidePanel}
              onAddCardToWhiteboard={handleAddCardToWhiteboard}
              onDeleteCard={handleDeleteCard}
              isSidebarCollapsed={isSidebarCollapsed}
              onExpandSidebar={() => setIsSidebarCollapsed(false)}
            />
          )}

          {currentView === 'tags' && (
            <TagsView
              allCards={cards}
              onOpenCardInSidePanel={handleOpenCardInSidePanel}
              onAddCardToWhiteboard={(id) => handleAddCardToWhiteboard(id)}
              onOpenDocument={(docId, hlId) => handleOpenDocument(docId, hlId)}
              onAddHighlightToWhiteboard={handleAddHighlightToWhiteboard}
              isSidebarCollapsed={isSidebarCollapsed}
              onExpandSidebar={() => setIsSidebarCollapsed(false)}
              isSidePanelOpen={isSidePanelOpen}
              onToggleSidePanel={() => setIsSidePanelOpen((prev) => !prev)}
            />
          )}

          {currentView === 'highlights' && (
            <HighlightsView
              cards={cards}
              onOpenCardInSidePanel={handleOpenCardInSidePanel}
              onAddCardToWhiteboard={(id) => handleAddCardToWhiteboard(id)}
              onOpenDocument={(docId, hlId) => handleOpenDocument(docId, hlId)}
              onAddHighlightToWhiteboard={handleAddHighlightToWhiteboard}
              refreshKey={canvasRefreshKey}
              isSidebarCollapsed={isSidebarCollapsed}
              onExpandSidebar={() => setIsSidebarCollapsed(false)}
            />
          )}

          {currentView === 'chat' && (
            <ChatView
              cards={cards}
              whiteboardsCount={whiteboards.length}
              onOpenCardInSidePanel={handleOpenCardInSidePanel}
              isSidebarCollapsed={isSidebarCollapsed}
              onExpandSidebar={() => setIsSidebarCollapsed(false)}
            />
          )}
          </Suspense>
        </div>

        {(isSidePanelOpen || sidePanelCardIds.length > 0) && (
          <Suspense fallback={null}>
            <CardDrawer
              cardIds={sidePanelCardIds}
              allCards={cards}
              isOpen={isSidePanelOpen}
              onClose={() => setIsSidePanelOpen(false)}
              onUpdateTitle={handleUpdateCardTitle}
              onUpdateContent={handleUpdateCardContent}
              onDeleteCard={handleDeleteCard}
              onUpdateColor={handleUpdateCardColor}
              onRemoveReference={handleRemoveSidePanelReference}
              onReorderReferences={setSidePanelCardIds}
              onAddReference={(id) => {
                setSidePanelCardIds((prev) => (prev.includes(id) ? prev : [id, ...prev]));
                setIsSidePanelOpen(true);
              }}
              onInsertNewCardAfter={handleInsertNewCardAfter}
              onSwapReference={handleSwapReference}
              onSwitchWhiteboard={handleSwitchWhiteboard}
              onOpenFullCard={(id) => setFullCardId(id)}
              onAddToWhiteboard={(id) => handleAddCardToWhiteboard(id)}
              documents={documents}
              sidePanelDocFocusMap={sidePanelDocFocusMap}
              onOpenFullDocument={handleOpenFullDocument}
              renderDocumentReader={(doc, focusHlId) => (
                <Suspense fallback={null}>
                  <DocumentReaderShell
                    documentId={doc.id}
                    focusHighlightId={focusHlId}
                    embedded
                    onAddHighlightToWhiteboard={handleAddHighlightToWhiteboard}
                    onDocumentUpdated={() => {
                      setCanvasRefreshKey((k) => k + 1);
                      void loadDocuments();
                    }}
                  />
                </Suspense>
              )}
            />
          </Suspense>
        )}
      </main>

      {isSearchModalOpen && (
        <Suspense fallback={null}>
          <GlobalSearchModal
            isOpen={isSearchModalOpen}
            onClose={() => setIsSearchModalOpen(false)}
            cards={cards}
            whiteboards={whiteboards}
            onSelectCard={(cardId, fullView) => {
              if (fullView) {
                setFullCardId(cardId);
              } else {
                handleOpenCardInSidePanel(cardId);
              }
            }}
            onSelectWhiteboard={handleSwitchWhiteboard}
            onCreateCardWithTitle={(title) => handleCreateCard(title, '')}
          />
        </Suspense>
      )}

      {fullCard && (
        <Suspense fallback={null}>
          <FullCardModal
            card={fullCard}
            allCards={cards}
            whiteboards={whiteboards}
            onClose={() => setFullCardId(null)}
            onUpdateTitle={handleUpdateCardTitle}
            onUpdateContent={handleUpdateCardContent}
            onUpdateColor={handleUpdateCardColor}
            onDeleteCard={handleDeleteCard}
            onOpenInSidePanel={handleOpenCardInSidePanel}
            onAddToWhiteboard={handleAddCardToWhiteboard}
            onSwitchWhiteboard={handleSwitchWhiteboard}
            onSelectCard={(id) => setFullCardId(id)}
            onDuplicateCard={handleDuplicateCard}
          />
        </Suspense>
      )}

      {activeReader && (
        <Suspense fallback={null}>
          <DocumentReaderShell
            documentId={activeReader.documentId}
            focusHighlightId={activeReader.highlightId}
            onClose={() => {
              setActiveReader(null);
              setCanvasRefreshKey((k) => k + 1);
            }}
            onAddHighlightToWhiteboard={handleAddHighlightToWhiteboard}
            onDocumentUpdated={() => {
              loadCards();
              setCanvasRefreshKey((k) => k + 1);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AppModalProvider>
      <AppContent />
    </AppModalProvider>
  );
}
