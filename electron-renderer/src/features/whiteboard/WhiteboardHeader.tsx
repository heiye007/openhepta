import React, { useState, useRef, useEffect } from 'react';
import {
  Globe,
  MoreHorizontal,
  PanelRight,
  LayoutGrid,
  Clock,
  Link as LinkIcon,
  Users,
  Image as ImageIcon,
  Trash2,
  Copy,
  Check,
  X,
  Share2,
  Lock,
  CheckCircle2,
} from 'lucide-react';
import { heptaClient } from '../../client';

export interface WhiteboardBreadcrumbItem {
  id: string;
  name: string;
  onClick?: () => void;
}

export interface WhiteboardHeaderProps {
  whiteboardId: string;
  whiteboardName: string;
  onUpdateWhiteboardName?: (name: string) => void;
  onExportImage?: () => void;
  onDeleteWhiteboard?: () => void;
  onToggleSidePanel?: () => void;
  onOpenMap?: () => void;
  isSidebarCollapsed?: boolean;
  onExpandSidebar?: () => void;
  breadcrumbs?: WhiteboardBreadcrumbItem[];
  isReadOnly?: boolean;
  isSidePanelOpen?: boolean;
}

export function WhiteboardHeader({
  whiteboardId,
  whiteboardName,
  onUpdateWhiteboardName,
  onExportImage,
  onDeleteWhiteboard,
  onToggleSidePanel,
  onOpenMap,
  isSidebarCollapsed = false,
  onExpandSidebar,
  breadcrumbs,
  isReadOnly = false,
  isSidePanelOpen = false,
}: WhiteboardHeaderProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [currentTitle, setCurrentTitle] = useState(whiteboardName);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showVersionToast, setShowVersionToast] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCurrentTitle(whiteboardName);
  }, [whiteboardName]);

  const [isShared, setIsShared] = useState<boolean>(() => {
    try {
      return localStorage.getItem(`hepta_wb_shared_${whiteboardId}`) === 'true';
    } catch {
      return false;
    }
  });

  const [showShareModal, setShowShareModal] = useState(false);
  const [shareActiveTab, setShareActiveTab] = useState<'share' | 'publish'>('share');
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'edit' | 'view' | 'admin'>('edit');
  const [collaborators, setCollaborators] = useState<Array<{ id: string; name: string; email: string; role: string }>>([
    { id: 'usr-owner', name: '当前用户 (你)', email: 'you@openhepta.local', role: 'Full access' },
  ]);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
        setConfirmingDelete(false);
      }
    };
    if (showMoreMenu) {
      window.addEventListener('mousedown', handleClickOutside);
    }
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [showMoreMenu]);

  useEffect(() => {
    const handleShortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        const url = `hepta://whiteboards/${whiteboardId}`;
        navigator.clipboard?.writeText(url).catch(() => {});
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [whiteboardId]);

  const handleSaveTitle = async () => {
    setIsEditingTitle(false);
    const trimmed = currentTitle.trim() || '未命名白板';
    setCurrentTitle(trimmed);
    if (onUpdateWhiteboardName) {
      onUpdateWhiteboardName(trimmed);
    }
    try {
      await heptaClient.whiteboards.rename(whiteboardId, trimmed);
    } catch (err) {
      console.error('Failed to update whiteboard title:', err);
    }
  };

  const handleTogglePublish = (publish: boolean) => {
    setIsShared(publish);
    try {
      localStorage.setItem(`hepta_wb_shared_${whiteboardId}`, publish ? 'true' : 'false');
    } catch {}
  };

  const handleCopyLink = () => {
    const url = `hepta://whiteboards/${whiteboardId}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleAddCollaborator = () => {
    if (!inviteEmail.trim()) return;
    const newCollab = {
      id: `usr-${Date.now()}`,
      name: inviteEmail.split('@')[0],
      email: inviteEmail.trim(),
      role: inviteRole === 'admin' ? 'Full access' : inviteRole === 'edit' ? 'Can edit' : 'Can view',
    };
    setCollaborators((prev) => [...prev, newCollab]);
    setInviteEmail('');
  };

  return (
    <>
      <header
        className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-3 bg-whiteboard-background border-b border-light-grey select-none"
        style={{
          height: 48,
          backgroundColor: 'var(--whiteboard-background, var(--background-primary))',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div className="flex items-center min-w-0 gap-x-1.5 overflow-hidden py-1">
          {isSidebarCollapsed && (
            <>
              <button
                type="button"
                onClick={onExpandSidebar}
                className="p-1.5 rounded-md hover:bg-light-grey text-middle-hard-grey hover:text-text-color transition shrink-0 cursor-pointer"
                title="Show sidebar (Ctrl+\)"
                aria-label="展开侧边栏"
              >
                <PanelRight size={16} className="-scale-x-100" />
              </button>
              <div className="h-5 w-px bg-light-grey mx-0.5 shrink-0" />
            </>
          )}

          <button
            onClick={onOpenMap}
            aria-label="Whiteboards Map"
            className="p-1.5 rounded-md hover:bg-light-grey text-middle-hard-grey hover:text-text-color transition flex items-center justify-center shrink-0"
            title="白板总览地图"
          >
            <LayoutGrid size={16} />
          </button>

          <span className="text-middle-grey/60 text-sm select-none px-0.5 shrink-0">/</span>

          {breadcrumbs && breadcrumbs.length > 0 && (
            <>
              {breadcrumbs.length > 2 && (
                <>
                  <span className="px-1.5 py-0.5 rounded text-[14px] leading-[20px] font-medium text-middle-hard-grey">
                    ...
                  </span>
                  <span className="text-middle-grey/60 text-sm select-none px-0.5 shrink-0">/</span>
                </>
              )}
              {breadcrumbs.slice(-2).map((crumb) => (
                <React.Fragment key={crumb.id}>
                  <button
                    type="button"
                    aria-label={`Breadcrumb: ${crumb.name}`}
                    onClick={crumb.onClick}
                    className="max-w-60 cursor-pointer select-none truncate rounded px-1.5 py-0.5 text-[14px] leading-[20px] font-medium text-middle-hard-grey hover:bg-light-grey hover:text-text-color transition"
                    title={crumb.name}
                  >
                    {crumb.name}
                  </button>
                  <span className="text-middle-grey/60 text-sm select-none px-0.5 shrink-0">/</span>
                </React.Fragment>
              ))}
            </>
          )}

          <div className="min-w-0 max-w-[492px] flex items-center">
            {isEditingTitle && !isReadOnly ? (
              <input
                ref={titleInputRef}
                type="text"
                autoFocus
                value={currentTitle}
                onChange={(e) => setCurrentTitle(e.target.value)}
                onBlur={handleSaveTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveTitle();
                  if (e.key === 'Escape') {
                    setCurrentTitle(whiteboardName);
                    setIsEditingTitle(false);
                  }
                }}
                className="px-2 py-0.5 rounded bg-background-secondary text-text-color text-[14px] leading-[20px] font-semibold outline-none w-full"
                style={{
                  boxShadow:
                    'inset 0 0 0 1px var(--active-item), 0 0 0 2px var(--middle-transparent-blue)',
                }}
              />
            ) : (
              <span
                onDoubleClick={() => !isReadOnly && setIsEditingTitle(true)}
                onClick={() => !isReadOnly && setIsEditingTitle(true)}
                className={`px-1.5 py-0.5 rounded text-[14px] leading-[20px] font-semibold text-text-color transition truncate ${
                  isReadOnly ? 'cursor-default' : 'hover:bg-light-grey cursor-text'
                }`}
                title={isReadOnly ? currentTitle : '点击或双击重命名白板'}
              >
                {currentTitle || '未命名白板'}
              </span>
            )}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-x-2 shrink-0">
          <div className="flex items-center -space-x-1.5 px-1">
            <div
              className="relative w-7 h-7 rounded-full bg-gradient-to-tr from-amber-500 to-indigo-500 text-white text-[11px] font-bold flex items-center justify-center border-2 border-whiteboard-background shadow-sm cursor-pointer"
              title="当前在线用户: You (Owner)"
            >
              Y
              <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-successful-item border border-white" />
            </div>
            {isShared && (
              <div
                className="w-7 h-7 rounded-full bg-active-item text-white text-[11px] font-bold flex items-center justify-center border-2 border-whiteboard-background shadow-sm"
                title="公开访客已就绪"
              >
                <Users size={12} />
              </div>
            )}
          </div>

          {isReadOnly && (
            <span className="px-2 py-0.5 rounded-full bg-light-grey text-middle-hard-grey text-[11px] font-medium flex items-center gap-1">
              <Lock size={11} />
              <span>View only</span>
            </span>
          )}

          <div className="relative">
            <button
              onClick={() => setShowShareModal(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[14px] leading-[16px] transition ${
                isShared
                  ? 'text-active-item font-semibold bg-active-item/10 hover:bg-active-item/15'
                  : 'text-middle-hard-grey font-medium hover:text-text-color hover:bg-light-grey'
              }`}
              title={isShared ? '白板已公开分享' : '分享与发布白板'}
            >
              {isShared ? (
                <>
                  <Globe size={14} className="text-active-item" />
                  <span>Shared</span>
                </>
              ) : (
                <span>Share</span>
              )}
            </button>
          </div>

          <div className="relative" ref={moreMenuRef}>
            <button
              onClick={() => {
                setShowMoreMenu(!showMoreMenu);
                setConfirmingDelete(false);
              }}
              className={`p-1.5 rounded-md transition ${
                showMoreMenu
                  ? 'bg-light-grey text-text-color'
                  : 'hover:bg-light-grey text-middle-hard-grey hover:text-text-color'
              }`}
              title="白板更多选项"
            >
              <MoreHorizontal size={17} />
            </button>

            {showMoreMenu && (
              <div
                className="absolute right-0 top-full mt-1.5 w-[248px] rounded-xl bg-menu-bg border border-light-grey shadow-main py-1.5 z-50 backdrop-blur-md flex flex-col text-xs select-none"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    setShowVersionToast(true);
                    setTimeout(() => setShowVersionToast(false), 2600);
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 text-text-color hover:bg-light-grey text-left transition"
                >
                  <Clock size={15} className="text-middle-hard-grey" />
                  <span>版本历史 (Version history)</span>
                </button>

                <div className="h-px bg-light-grey my-1" />

                <button
                  onClick={() => {
                    handleCopyLink();
                    setShowMoreMenu(false);
                  }}
                  className="flex items-center justify-between px-3 py-2 text-text-color hover:bg-light-grey text-left transition"
                >
                  <div className="flex items-center gap-2.5">
                    <LinkIcon size={15} className="text-middle-hard-grey" />
                    <span>复制白板链接 (Copy link)</span>
                  </div>
                  <span className="text-[10px] text-middle-grey font-mono">Ctrl+Shift+L</span>
                </button>

                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    setShowShareModal(true);
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 text-text-color hover:bg-light-grey text-left transition"
                >
                  <Users size={15} className="text-middle-hard-grey" />
                  <span>分享与发布 (Share...)</span>
                </button>

                <div className="h-px bg-light-grey my-1" />

                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    onExportImage?.();
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 text-text-color hover:bg-light-grey text-left transition"
                >
                  <ImageIcon size={15} className="text-middle-hard-grey" />
                  <span>导出为高清图片 (Export as image)</span>
                </button>

                <div className="h-px bg-light-grey my-1" />

                {confirmingDelete ? (
                  <div className="px-3 py-2 flex items-center justify-between gap-2 bg-danger-item/10">
                    <span className="text-danger-item font-medium text-[11px]">确认移入回收站？</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setShowMoreMenu(false);
                          setConfirmingDelete(false);
                          onDeleteWhiteboard?.();
                        }}
                        className="px-2 py-0.5 rounded bg-danger-item text-white text-[11px] font-medium hover:brightness-110 transition"
                      >
                        删除
                      </button>
                      <button
                        onClick={() => setConfirmingDelete(false)}
                        className="px-2 py-0.5 rounded bg-light-grey text-text-color text-[11px] hover:bg-light-middle-grey transition"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingDelete(true)}
                    className="flex items-center gap-2.5 px-3 py-2 text-danger-item hover:bg-danger-item/10 text-left transition"
                  >
                    <Trash2 size={15} />
                    <span>删除白板 (Delete whiteboard)</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <button
            onClick={onToggleSidePanel}
            className={`p-1.5 rounded-md transition ${
              isSidePanelOpen
                ? 'bg-active-item/15 text-active-item'
                : 'hover:bg-light-grey text-middle-hard-grey hover:text-text-color'
            }`}
            title="展开/收起右侧引用边栏 (Show side panel)"
          >
            <PanelRight size={17} />
          </button>
        </div>
      </header>

      {(copiedLink || showVersionToast) && (
        <div className="fixed top-14 right-4 z-50 px-3 py-2 rounded-lg bg-menu-bg border border-light-grey shadow-main text-xs text-text-color flex items-center gap-2 animate-in fade-in duration-150">
          <CheckCircle2 size={14} className="text-successful-item shrink-0" />
          <span>
            {copiedLink
              ? '已复制白板深度链接 (hepta://whiteboards/...)'
              : '本地 SQLite WAL 快照自动持久化已启用'}
          </span>
        </div>
      )}

      {showShareModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowShareModal(false)}
        >
          <div
            className="w-full max-w-[480px] rounded-2xl bg-menu-bg border border-light-grey shadow-main overflow-hidden flex flex-col p-6 animate-scale-up"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--menu-bg, var(--background-secondary))',
            }}
          >
            <div className="flex items-center justify-between pb-4 border-b border-light-grey">
              <div className="flex bg-light-grey p-1 rounded-xl gap-1">
                <button
                  onClick={() => setShareActiveTab('share')}
                  className={`px-5 py-1.5 rounded-lg text-xs font-semibold transition ${
                    shareActiveTab === 'share'
                      ? 'bg-background-secondary text-text-color shadow-sm'
                      : 'text-middle-hard-grey hover:text-text-color'
                  }`}
                >
                  Share (协作)
                </button>
                <button
                  onClick={() => setShareActiveTab('publish')}
                  className={`px-5 py-1.5 rounded-lg text-xs font-semibold transition ${
                    shareActiveTab === 'publish'
                      ? 'bg-background-secondary text-text-color shadow-sm'
                      : 'text-middle-hard-grey hover:text-text-color'
                  }`}
                >
                  Publish (网页发布)
                </button>
              </div>

              <button
                onClick={() => setShowShareModal(false)}
                className="p-1 rounded-md hover:bg-light-grey text-middle-grey hover:text-text-color transition"
              >
                <X size={18} />
              </button>
            </div>

            {shareActiveTab === 'share' && (
              <div className="py-4 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-text-color mb-1">邀请协作者 (Invite to collaborate)</h3>
                  <p className="text-xs text-middle-grey">
                    邀请任何人免费加入此白板进行实时双向协作。
                  </p>
                </div>

                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="输入邮箱地址或团队用户名..."
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddCollaborator();
                    }}
                    className="flex-1 px-3 py-2 rounded-xl bg-background-primary border border-light-grey text-xs text-text-color outline-none focus:border-active-item"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as 'edit' | 'view' | 'admin')}
                    className="px-2.5 py-2 rounded-xl bg-background-primary border border-light-grey text-xs text-text-color outline-none cursor-pointer"
                  >
                    <option value="edit">Can edit</option>
                    <option value="view">Can view</option>
                    <option value="admin">Full access</option>
                  </select>
                  <button
                    onClick={handleAddCollaborator}
                    className="px-4 py-2 rounded-xl bg-active-item text-white text-xs font-semibold hover:opacity-90 transition"
                  >
                    邀请
                  </button>
                </div>

                <div className="pt-2">
                  <div className="text-[11px] font-semibold text-middle-grey mb-2 uppercase tracking-wider">
                    已获访问权限的成员
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {collaborators.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between p-2 rounded-xl bg-background-primary border border-light-grey text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-6 h-6 rounded-full bg-active-item/20 text-active-item font-bold flex items-center justify-center text-[10px]">
                            {c.name.slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-text-color">{c.name}</div>
                            <div className="text-[10px] text-middle-grey">{c.email}</div>
                          </div>
                        </div>
                        <span className="text-[11px] text-middle-hard-grey font-medium">{c.role}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-light-grey flex items-center justify-between">
                  <button
                    onClick={handleCopyLink}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl hover:bg-light-grey text-xs font-semibold text-text-color transition"
                  >
                    {copiedLink ? <Check size={14} className="text-successful-item" /> : <Copy size={14} />}
                    <span>{copiedLink ? '链接已复制！' : '复制协作直达链接'}</span>
                  </button>
                  <span className="text-[11px] text-middle-grey font-mono">hepta://whiteboards/...</span>
                </div>
              </div>
            )}

            {shareActiveTab === 'publish' && (
              <div className="py-4 space-y-4">
                <div className="flex items-center justify-between p-4 rounded-xl bg-background-primary border border-light-grey">
                  <div>
                    <h3 className="text-sm font-bold text-text-color mb-0.5">公开发布为静态网页 (Publish to Web)</h3>
                    <p className="text-xs text-middle-grey">
                      将当前白板生成为无需登录即可在任意浏览器访问的只读视觉知识页。
                    </p>
                  </div>
                  <button
                    onClick={() => handleTogglePublish(!isShared)}
                    className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 ease-in-out cursor-pointer ${
                      isShared ? 'bg-active-item' : 'bg-middle-grey'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 ease-in-out ${
                        isShared ? 'translate-x-6' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {isShared ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-middle-hard-grey mb-1.5 block">
                        公开访问 URL
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          readOnly
                          value={`https://openhepta.app/w/${whiteboardId}`}
                          className="flex-1 px-3 py-2 rounded-xl bg-background-primary border border-light-grey text-xs text-text-color font-mono outline-none select-all"
                        />
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`https://openhepta.app/w/${whiteboardId}`);
                            setCopiedLink(true);
                            setTimeout(() => setCopiedLink(false), 2000);
                          }}
                          className="px-3 py-2 rounded-xl bg-light-grey hover:bg-light-grey/80 text-xs font-semibold text-text-color flex items-center gap-1.5 transition"
                        >
                          {copiedLink ? <Check size={14} className="text-successful-item" /> : <Copy size={14} />}
                          <span>{copiedLink ? '已复制' : '复制'}</span>
                        </button>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-background-primary border border-light-grey space-y-2 text-xs">
                      <label className="flex items-center gap-2 cursor-pointer text-text-color">
                        <input type="checkbox" defaultChecked className="rounded text-active-item" />
                        <span>允许访客复制卡片与摘录</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-text-color">
                        <input type="checkbox" defaultChecked className="rounded text-active-item" />
                        <span>显示卡片双向反向链接 (Backlinks)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-text-color">
                        <input type="checkbox" defaultChecked className="rounded text-active-item" />
                        <span>允许搜索引擎索引收录 (SEO Indexing)</span>
                      </label>
                    </div>

                    <div className="pt-2 flex items-center gap-2">
                      <a
                        href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                          `Check out my visual whiteboard "${currentTitle}" on OpenHepta!`
                        )}&url=${encodeURIComponent(`https://openhepta.app/w/${whiteboardId}`)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 py-2 rounded-xl bg-light-grey hover:bg-light-grey/80 text-xs font-semibold text-text-color flex items-center justify-center gap-1.5 transition"
                      >
                        <Share2 size={13} />
                        <span>分享到 X (Twitter)</span>
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-xs text-middle-grey">
                    当前白板处于私有状态，开启上方开关即可生成并获取网页公开链接。
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
