import { PanelRight } from 'lucide-react';

export interface SidebarExpandButtonProps {
  visible?: boolean;
  onExpand?: () => void;
  showDivider?: boolean;
}

export function SidebarExpandButton({
  visible = false,
  onExpand,
  showDivider = true,
}: SidebarExpandButtonProps) {
  if (!visible || !onExpand) return null;

  return (
    <div className="flex items-center shrink-0">
      <button
        type="button"
        onClick={onExpand}
        className="p-1.5 rounded-md hover:bg-light-grey text-middle-hard-grey hover:text-text-color transition shrink-0 cursor-pointer"
        title="Show sidebar (Ctrl+\)"
        aria-label="展开侧边栏"
      >
        <PanelRight size={16} className="-scale-x-100" />
      </button>
      {showDivider && <div className="h-5 w-px bg-light-grey mx-1.5 shrink-0" />}
    </div>
  );
}
