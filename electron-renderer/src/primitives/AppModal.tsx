import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { X, AlertTriangle, Info, HelpCircle } from 'lucide-react';

export type ModalVariant = 'default' | 'danger';

export interface BaseModalOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ModalVariant;
}

export interface AlertOptions extends BaseModalOptions {}

export interface ConfirmOptions extends BaseModalOptions {}

export interface PromptOptions extends BaseModalOptions {
  placeholder?: string;
  defaultValue?: string;
}

type ModalRequest =
  | {
      kind: 'alert';
      options: AlertOptions;
      resolve: () => void;
    }
  | {
      kind: 'confirm';
      options: ConfirmOptions;
      resolve: (confirmed: boolean) => void;
    }
  | {
      kind: 'prompt';
      options: PromptOptions;
      resolve: (value: string | null) => void;
    };

export interface AppModalContextValue {
  showAlert: (options: AlertOptions | string) => Promise<void>;
  showConfirm: (options: ConfirmOptions | string) => Promise<boolean>;
  showPrompt: (options: PromptOptions | string) => Promise<string | null>;
}

const AppModalContext = createContext<AppModalContextValue | null>(null);

export function useAppModal(): AppModalContextValue {
  const ctx = useContext(AppModalContext);
  if (!ctx) {
    throw new Error('useAppModal must be used within an AppModalProvider');
  }
  return ctx;
}

export interface ModalDialogProps {
  request: ModalRequest;
  onDismiss: () => void;
  onConfirm: (promptValue?: string) => void;
}

export function ModalDialog({ request, onDismiss, onConfirm }: ModalDialogProps) {
  const { kind, options } = request;
  const variant = options.variant ?? 'default';
  const [promptValue, setPromptValue] = useState(
    kind === 'prompt' ? options.defaultValue ?? '' : ''
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (kind === 'prompt') {
      setPromptValue(options.defaultValue ?? '');
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    } else if (kind === 'confirm' && variant === 'danger') {
      requestAnimationFrame(() => cancelBtnRef.current?.focus());
    } else {
      requestAnimationFrame(() => confirmBtnRef.current?.focus());
    }
  }, [request, kind, variant, options]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onDismiss();
      } else if (e.key === 'Enter' && kind !== 'prompt') {
        const active = document.activeElement;
        if (active === cancelBtnRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        onConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [kind, onDismiss, onConfirm]);

  const defaultTitle =
    kind === 'alert'
      ? 'Notice'
      : kind === 'confirm'
      ? variant === 'danger'
        ? 'Confirm deletion'
        : 'Confirm'
      : 'Input';

  const title = options.title || defaultTitle;
  const confirmLabel =
    options.confirmText ||
    (kind === 'alert' ? 'OK' : variant === 'danger' ? 'Delete' : 'Confirm');
  const cancelLabel = options.cancelText || 'Cancel';

  const Icon =
    variant === 'danger' ? AlertTriangle : kind === 'confirm' ? HelpCircle : Info;

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-scrim backdrop-blur-sm p-4"
      onClick={onDismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-modal-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] rounded-xl bg-background-secondary border border-light-grey shadow-main overflow-hidden text-text-color"
      >
        <div className="px-5 pt-4 pb-2 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                variant === 'danger'
                  ? 'bg-danger-item/15 text-danger-item'
                  : 'bg-middle-transparent-blue text-active-item'
              }`}
            >
              <Icon size={15} />
            </div>
            <h2
              id="app-modal-title"
              className="text-[14.5px] font-semibold text-text-color truncate"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="p-1 rounded-md hover:bg-light-grey text-middle-grey hover:text-text-color transition cursor-pointer shrink-0"
            aria-label="Close dialog"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-2 space-y-3">
          <p className="text-[13px] text-middle-hard-grey leading-relaxed break-words">
            {options.message}
          </p>

          {kind === 'prompt' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onConfirm(promptValue);
              }}
            >
              <input
                ref={inputRef}
                type="text"
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                placeholder={options.placeholder || ''}
                className="w-full h-9 px-3 rounded-lg bg-background-primary border border-light-grey focus:border-active-item text-[13px] text-text-color placeholder:text-middle-grey outline-none transition"
              />
            </form>
          )}
        </div>

        <div className="px-5 py-3.5 mt-1 bg-background-primary/50 border-t border-light-grey flex items-center justify-end gap-2">
          {kind !== 'alert' && (
            <button
              ref={cancelBtnRef}
              type="button"
              onClick={onDismiss}
              className="h-8 px-3 rounded-md bg-background-secondary border border-light-grey hover:bg-light-grey text-[12.5px] font-medium text-middle-hard-grey hover:text-text-color transition cursor-pointer"
            >
              {cancelLabel}
            </button>
          )}
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={() => onConfirm(kind === 'prompt' ? promptValue : undefined)}
            className={`h-8 px-3.5 rounded-md text-[12.5px] font-medium text-white hover:brightness-105 transition cursor-pointer ${
              variant === 'danger' ? 'bg-danger-item' : 'bg-active-item'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppModalProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<ModalRequest[]>([]);

  const showAlert = useCallback((opts: AlertOptions | string) => {
    const options: AlertOptions = typeof opts === 'string' ? { message: opts } : opts;
    return new Promise<void>((resolve) => {
      setQueue((prev) => [...prev, { kind: 'alert', options, resolve }]);
    });
  }, []);

  const showConfirm = useCallback((opts: ConfirmOptions | string) => {
    const options: ConfirmOptions = typeof opts === 'string' ? { message: opts } : opts;
    return new Promise<boolean>((resolve) => {
      setQueue((prev) => [...prev, { kind: 'confirm', options, resolve }]);
    });
  }, []);

  const showPrompt = useCallback((opts: PromptOptions | string) => {
    const options: PromptOptions = typeof opts === 'string' ? { message: opts } : opts;
    return new Promise<string | null>((resolve) => {
      setQueue((prev) => [...prev, { kind: 'prompt', options, resolve }]);
    });
  }, []);

  const currentRequest = queue[0] ?? null;

  const handleDismiss = useCallback(() => {
    setQueue((prev) => {
      const [head, ...rest] = prev;
      if (!head) return prev;
      if (head.kind === 'alert') head.resolve();
      else if (head.kind === 'confirm') head.resolve(false);
      else head.resolve(null);
      return rest;
    });
  }, []);

  const handleConfirm = useCallback((promptValue?: string) => {
    setQueue((prev) => {
      const [head, ...rest] = prev;
      if (!head) return prev;
      if (head.kind === 'alert') head.resolve();
      else if (head.kind === 'confirm') head.resolve(true);
      else head.resolve(promptValue ?? '');
      return rest;
    });
  }, []);

  return (
    <AppModalContext.Provider value={{ showAlert, showConfirm, showPrompt }}>
      {children}
      {currentRequest && (
        <ModalDialog
          request={currentRequest}
          onDismiss={handleDismiss}
          onConfirm={handleConfirm}
        />
      )}
    </AppModalContext.Provider>
  );
}
