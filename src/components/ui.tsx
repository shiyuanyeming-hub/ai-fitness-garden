"use client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { RecoveryStatus } from "@/core/recovery";
import { STATUS_LABEL } from "@/core/recovery";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "soft";
export function Button({
  variant = "secondary",
  size = "md",
  className,
  block,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "lg"; block?: boolean }) {
  const v: Record<BtnVariant, string> = {
    primary: "bg-accent text-accent-ink shadow-sm active:brightness-95",
    secondary: "bg-surface-2 text-ink border border-line active:bg-surface-3",
    soft: "bg-accent-soft text-accent active:brightness-95",
    ghost: "text-ink active:bg-surface-2",
    danger: "bg-attention/10 text-attention border border-attention/30 active:bg-attention/20",
  };
  const s = { sm: "h-9 px-3 text-sm rounded-xl", md: "h-11 px-4 text-[15px] rounded-2xl", lg: "h-14 px-5 text-base rounded-2xl" };
  return (
    <button
      {...rest}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 font-medium select-none transition disabled:opacity-40 disabled:pointer-events-none",
        v[variant],
        s[size],
        block && "w-full",
        className,
      )}
    />
  );
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx("card p-4", className)}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between px-1 mb-2 mt-6">
      <h2 className="text-[13px] font-semibold tracking-wide text-muted uppercase">{children}</h2>
      {action}
    </div>
  );
}

export const STATUS_COLOR: Record<RecoveryStatus | "fallow", string> = {
  recovering: "var(--st-recovering)",
  gradual: "var(--st-gradual)",
  ready: "var(--st-ready)",
  attention: "var(--st-attention)",
  fallow: "var(--st-fallow)",
};

export function StatusBadge({ status, className }: { status: RecoveryStatus; className?: string }) {
  return (
    <span
      className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", className)}
      style={{ color: STATUS_COLOR[status], background: `color-mix(in srgb, ${STATUS_COLOR[status]} 14%, transparent)` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: STATUS_COLOR[status] }} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Chip({
  active,
  onClick,
  children,
  className,
  disabled,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "h-9 px-3 rounded-full text-sm border transition whitespace-nowrap disabled:opacity-40",
        active ? "bg-accent text-accent-ink border-transparent" : "bg-surface border-line text-ink active:bg-surface-2",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  size = "md",
}: {
  value: T;
  options: { value: T; label: ReactNode; disabled?: boolean }[];
  onChange: (v: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="tablist" className={cx("flex p-1 rounded-2xl bg-surface-2 border border-line", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          disabled={o.disabled}
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "flex-1 rounded-xl font-medium transition disabled:opacity-40",
            size === "sm" ? "h-8 text-[13px]" : "h-9 text-sm",
            value === o.value ? "bg-surface text-ink shadow-sm" : "text-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[13px] text-muted mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs text-faint mt-1">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full h-11 px-3 rounded-xl bg-surface-2 border border-line text-ink placeholder:text-faint focus:border-accent outline-none";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />;
}

/** Bottom sheet. Keyboard-safe: content scrolls, sheet sits above the safe area. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
          <motion.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="absolute inset-x-0 bottom-0 max-h-[88dvh] flex flex-col rounded-t-[28px] bg-surface border-t border-line shadow-2xl mx-auto max-w-lg"
            initial={reduce ? { opacity: 0 } : { y: "100%" }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 340 }}
          >
            <div className="pt-2.5 pb-1 flex justify-center">
              <div className="h-1.5 w-10 rounded-full bg-surface-3" />
            </div>
            {title && (
              <div className="px-5 pb-2 pt-1 flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">{title}</h3>
                <button onClick={onClose} className="size-8 rounded-full bg-surface-2 text-muted grid place-items-center" aria-label="关闭">
                  ✕
                </button>
              </div>
            )}
            <div className="overflow-y-auto px-5 pb-4 overscroll-contain">{children}</div>
            {footer && <div className="px-5 pt-2 pb-safe border-t border-line bg-surface">{footer}</div>}
            {!footer && <div className="pb-safe" />}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ---------------- toast
type Toast = { id: number; text: string; tone: "info" | "error" | "success" };
const ToastCtx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const push = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = ++idRef.current;
    setList((l) => [...l, { id, text, tone }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), tone === "error" ? 4500 : 2600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed inset-x-0 top-0 z-[60] pt-safe pointer-events-none flex flex-col items-center gap-2 px-4 mt-2" aria-live="polite">
        <AnimatePresence>
          {list.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className={cx(
                "max-w-md w-fit rounded-2xl px-4 py-2.5 text-sm shadow-lg border",
                t.tone === "error" ? "bg-attention text-white border-transparent" : t.tone === "success" ? "bg-accent text-accent-ink border-transparent" : "bg-surface text-ink border-line",
              )}
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function ProgressRing({ pct, size = 44, stroke = 4, color, children }: { pct: number; size?: number; stroke?: number; color: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--surface-3)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p / 100)}
          style={{ transition: "stroke-dashoffset .6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-[11px] font-semibold">{children}</div>
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="text-center py-10 px-6">
      <div className="text-4xl mb-2">🌱</div>
      <div className="font-semibold">{title}</div>
      {children && <div className="text-sm text-muted mt-1">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, right }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <header className="pt-safe">
      <div className="flex items-end justify-between gap-3 pt-4 pb-2">
        <div className="min-w-0">
          {subtitle && <div className="text-[13px] text-muted">{subtitle}</div>}
          <h1 className="text-[28px] leading-tight font-bold tracking-tight truncate">{title}</h1>
        </div>
        {right}
      </div>
    </header>
  );
}

export function haptic(pattern: number | number[] = 10) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  } catch {
    /* unsupported (iOS Safari) */
  }
}

export function confirmAsync(message: string): boolean {
  // Native confirm is acceptable here: it never blocks data writes already made.
  return typeof window !== "undefined" ? window.confirm(message) : false;
}
