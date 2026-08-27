"use client";

/**
 * =============================================================================
 * Shared primitives for the recruiter workspace.
 * =============================================================================
 * The old portal was one 1,977-line file that re-implemented a modal six times
 * (none of them keyboard-accessible), swallowed every error into `console.warn`,
 * and asked for destructive confirmation through the browser's native
 * `confirm()`. These primitives exist so each panel gets the accessible,
 * error-surfacing version for free.
 *
 * Design tokens live in `styles` below rather than being retyped per component:
 * cream page `#FAF6F0`, card `#FCFAF7`, border `#DFD5C6`, ink `#262626`, muted
 * `#6E6359`, clay accent `#C85A32` (hover `#B83A14`), green `#2E5A44`.
 * Lucide stroke icons only — no emojis.
 */

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw, X } from "lucide-react";

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C85A32]";

export const styles = {
  focusRing: FOCUS_RING,
  card: "bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl shadow-3xs",
  panel: "bg-[#FAF6F0]/80 border border-[#DFD5C6] rounded-xl",
  input: `w-full px-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32] disabled:opacity-60 disabled:cursor-not-allowed placeholder:text-[#6E6359]/50`,
  label: "block text-xs font-bold font-mono text-[#262626]",
  hint: "text-[10px] font-mono text-[#6E6359] leading-relaxed",
  primary: `px-5 py-2 bg-[#C85A32] hover:bg-[#B83A14] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#C85A32] ${FOCUS_RING}`,
  secondary: `px-5 py-2 bg-[#FAF6F0] hover:bg-[#F2EAE0] border border-[#DFD5C6] text-[#262626] rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS_RING}`,
  dark: `px-5 py-2 bg-[#262626] hover:bg-black text-[#FCFAF7] rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS_RING}`,
  danger: `px-5 py-2 bg-[#B83A14] hover:bg-[#9C2F0F] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS_RING}`,
  iconButton: `p-1.5 rounded-lg border border-[#DFD5C6] text-[#6E6359] hover:text-[#262626] hover:bg-[#FAF6F0] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS_RING}`,
  sectionTitle: "font-serif font-semibold text-lg tracking-tight text-[#262626]",
  microLabel: "text-[10px] font-mono uppercase tracking-widest text-[#6E6359]",
  metric: "text-2xl font-black font-mono text-[#262626] leading-none",
};

/** Focusable descendants, in DOM order — used by the modal's focus trap. */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function visibleFocusables(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (node) => node.offsetParent !== null || node === document.activeElement
  );
}

// -----------------------------------------------------------------------------
// Modal
// -----------------------------------------------------------------------------

/**
 * A dialog that can actually be operated from a keyboard: focus moves inside on
 * open, Tab cycles within the panel, Escape closes, and focus returns to
 * whatever opened it. Page scroll is locked while it is up.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon: Icon,
  children,
  footer,
  width = "max-w-lg",
  dismissible = true,
}) {
  const panelRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return undefined;

    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const [first] = visibleFocusables(panel);
      (first || panel).focus?.();
    });

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        if (!dismissible) return;
        event.stopPropagation();
        onClose?.();
        return;
      }
      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const nodes = visibleFocusables(panel);
      if (nodes.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      const outside = !panel.contains(active);

      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open, onClose, dismissible]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-[#262626]/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? descriptionId : undefined}
        tabIndex={-1}
        className={`w-full ${width} max-h-[90vh] flex flex-col bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl shadow-lg focus:outline-none`}
      >
        <div className="flex items-start justify-between gap-4 p-6 pb-4 border-b border-[#DFD5C6]/70 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            {Icon && (
              <span className="h-8 w-8 rounded-xl bg-[#C85A32]/10 flex items-center justify-center shrink-0">
                <Icon className="h-4 w-4 text-[#C85A32]" />
              </span>
            )}
            <div className="min-w-0">
              <h2 id={titleId} className="font-serif font-semibold text-base tracking-tight text-[#262626]">
                {title}
              </h2>
              {subtitle && (
                <p id={descriptionId} className="text-[10px] font-mono text-[#6E6359] mt-1 leading-relaxed">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {dismissible && (
            <button type="button" onClick={onClose} aria-label="Close dialog" className={`${styles.iconButton} shrink-0`}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="p-6 overflow-y-auto grow">{children}</div>

        {footer && (
          <div className="p-6 pt-4 border-t border-[#DFD5C6]/70 flex items-center justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Confirmation
// -----------------------------------------------------------------------------

/**
 * Replaces the native `confirm()`. Deliberately spells out the consequence —
 * removing a pipeline entry also removes its audit trail, which a one-word
 * "OK / Cancel" prompt never communicated.
 */
export function ConfirmDialog({
  open,
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onCancel}
      dismissible={!busy}
      title={title}
      icon={AlertTriangle}
      width="max-w-md"
      footer={
        <>
          <button type="button" className={styles.secondary} onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={tone === "danger" ? styles.danger : styles.primary}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1.5 -mt-0.5" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-xs text-[#6E6359] leading-relaxed">{message}</p>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Toasts
// -----------------------------------------------------------------------------

const TOAST_TONES = {
  success: { icon: CheckCircle2, accent: "text-[#2E5A44]", ring: "border-[#2E5A44]/30" },
  error: { icon: AlertTriangle, accent: "text-[#B83A14]", ring: "border-[#B83A14]/30" },
  info: { icon: Info, accent: "text-[#6E6359]", ring: "border-[#DFD5C6]" },
};

/**
 * Toast state for one panel tree. Mutations report their outcome here instead of
 * failing silently — an error toast holds longer than a success one because the
 * user has to read and act on it.
 */
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (message, tone = "info", ttl = 5000) => {
      if (!message) return null;
      nextId.current += 1;
      const id = nextId.current;
      // Keep at most four on screen; older ones drop off the top.
      setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
      if (ttl) timers.current.set(id, setTimeout(() => dismiss(id), ttl));
      return id;
    },
    [dismiss]
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, []);

  return useMemo(
    () => ({
      toasts,
      dismiss,
      success: (message) => push(message, "success", 5000),
      error: (message) => push(message, "error", 9000),
      info: (message) => push(message, "info", 5000),
    }),
    [toasts, dismiss, push]
  );
}

/** Renders the stack from `useToasts`. Announced politely to screen readers. */
export function ToastStack({ toasts, onDismiss }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-[min(22rem,calc(100vw-2rem))] pointer-events-none"
    >
      {toasts.map((toast) => {
        const tone = TOAST_TONES[toast.tone] || TOAST_TONES.info;
        const Icon = tone.icon;
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-2.5 bg-[#FCFAF7] border ${tone.ring} rounded-xl p-3 shadow-md animate-in fade-in slide-in-from-bottom-2 duration-200`}
          >
            <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${tone.accent}`} />
            <p className="text-xs text-[#262626] leading-relaxed grow break-words">{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className={`text-[#6E6359]/60 hover:text-[#262626] transition-colors cursor-pointer shrink-0 rounded ${FOCUS_RING}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Loading / empty / error states
// -----------------------------------------------------------------------------

export function Spinner({ className = "h-4 w-4" }) {
  return <Loader2 className={`${className} animate-spin text-[#C85A32]`} aria-hidden="true" />;
}

export function LoadingBlock({ label = "Loading" }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16" role="status" aria-live="polite">
      <Spinner className="h-5 w-5" />
      <span className={styles.microLabel}>{label}</span>
    </div>
  );
}

/**
 * The error state the old portal never had. Every fetch failure lands here with
 * the backend's own wording plus a retry — "your session expired" and "you have
 * no candidates" must never look the same.
 */
export function ErrorBanner({ message, onRetry, retryLabel = "Try again", className = "" }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className={`flex items-start gap-3 bg-[#B83A14]/5 border border-[#B83A14]/25 rounded-xl p-4 ${className}`}
    >
      <AlertTriangle className="h-4 w-4 text-[#B83A14] shrink-0 mt-0.5" />
      <p className="text-xs text-[#262626] leading-relaxed grow">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={`shrink-0 flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-[#B83A14] hover:text-[#9C2F0F] cursor-pointer rounded ${FOCUS_RING}`}
        >
          <RefreshCw className="h-3 w-3" />
          {retryLabel}
        </button>
      )}
    </div>
  );
}

/** Honest empty state: says what is missing and offers the one useful action. */
export function EmptyState({ icon: Icon, title, message, action, className = "" }) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center py-14 px-6 border border-dashed border-[#DFD5C6] rounded-2xl bg-[#FAF6F0]/50 ${className}`}
    >
      {Icon && (
        <span className="h-10 w-10 rounded-2xl bg-[#DFD5C6]/40 flex items-center justify-center mb-4">
          <Icon className="h-4 w-4 text-[#6E6359]" />
        </span>
      )}
      <h3 className="font-serif font-semibold text-base text-[#262626] tracking-tight">{title}</h3>
      {message && <p className="text-xs text-[#6E6359] mt-2 max-w-sm leading-relaxed">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Form field
// -----------------------------------------------------------------------------

/**
 * Label + control + hint/error, wired together with a generated id so the label
 * is programmatically associated and errors are announced.
 */
export function Field({
  label,
  hint,
  error,
  required = false,
  as = "input",
  options,
  className = "",
  children,
  ...inputProps
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  const controlClass = `${styles.input} ${error ? "border-[#B83A14]" : ""}`;

  let control;
  if (children) {
    control = children;
  } else if (as === "textarea") {
    control = (
      <textarea
        id={id}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
        className={`${controlClass} resize-none leading-relaxed`}
        {...inputProps}
      />
    );
  } else if (as === "select") {
    control = (
      <select
        id={id}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
        className={`${controlClass} cursor-pointer`}
        {...inputProps}
      >
        {(options || []).map((option) => {
          const value = typeof option === "string" ? option : option.value;
          const optionLabel = typeof option === "string" ? option : option.label;
          return (
            <option key={value} value={value}>
              {optionLabel}
            </option>
          );
        })}
      </select>
    );
  } else {
    control = (
      <input
        id={id}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
        className={controlClass}
        {...inputProps}
      />
    );
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label htmlFor={children ? undefined : id} className={styles.label}>
          {label}
          {required && <span className="text-[#C85A32] ml-0.5">*</span>}
        </label>
      )}
      {control}
      {hint && !error && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-[10px] font-mono text-[#B83A14] leading-relaxed">
          {error}
        </p>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Small display pieces
// -----------------------------------------------------------------------------

/** A KPI tile. Renders zero as zero — no `|| 3` fallbacks anywhere. */
export function StatTile({ label, value, sublabel, tone = "ink" }) {
  const valueTone = tone === "accent" ? "text-[#C85A32]" : tone === "green" ? "text-[#2E5A44]" : "text-[#262626]";
  return (
    <div className="bg-[#FAF6F0]/80 border border-[#DFD5C6] rounded-xl p-4 space-y-1">
      <p className={styles.microLabel}>{label}</p>
      <p className={`text-2xl font-black font-mono leading-none ${valueTone}`}>{value}</p>
      {sublabel && <p className="text-[10px] font-mono text-[#6E6359]/80 leading-relaxed">{sublabel}</p>}
    </div>
  );
}

const CHIP_TONES = {
  neutral: "bg-[#DFD5C6]/40 text-[#6E6359] border-[#DFD5C6]",
  accent: "bg-[#C85A32]/10 text-[#C85A32] border-[#C85A32]/25",
  green: "bg-[#2E5A44]/10 text-[#2E5A44] border-[#2E5A44]/25",
  blue: "bg-[#2563EB]/10 text-[#2563EB] border-[#2563EB]/25",
  danger: "bg-[#B83A14]/10 text-[#B83A14] border-[#B83A14]/25",
  ink: "bg-[#262626] text-[#FCFAF7] border-[#262626]",
};

export function Chip({ children, tone = "neutral", icon: Icon, className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-mono font-bold tracking-wide ${
        CHIP_TONES[tone] || CHIP_TONES.neutral
      } ${className}`}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  );
}

/** Section heading used at the top of every panel. */
export function PanelHeader({ title, description, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className={styles.sectionTitle}>{title}</h2>
        {description && <p className="text-xs text-[#6E6359] mt-1 leading-relaxed max-w-2xl">{description}</p>}
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}

/**
 * Dates arrive from psycopg2 as ISO strings (or nothing at all). Never render
 * "Invalid Date" at a recruiter — fall back to an em dash.
 */
export function formatDate(value, { withTime = false } = {}) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

/** "in 5 days" / "3 days ago" / "—". Used for invite and assessment expiry. */
export function formatRelative(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  const diffMs = parsed.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60000);
  const hours = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);

  let quantity = `${days} day${days === 1 ? "" : "s"}`;
  if (abs < 3600000) quantity = `${minutes} min`;
  else if (abs < 86400000) quantity = `${hours} hr${hours === 1 ? "" : "s"}`;

  return diffMs >= 0 ? `in ${quantity}` : `${quantity} ago`;
}
