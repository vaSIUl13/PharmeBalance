import Link from "next/link";
import type { ReactNode } from "react";
import { ApiError } from "@/lib/auth";
import type { Tone } from "@/lib/head/format";
import { Icon, type IconName } from "./icon";

const toneClasses: Record<Tone, string> = {
  danger: "border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]",
  warning: "border-[#fde68a] bg-[#fffbeb] text-[#b45309]",
  success: "border-[#bbf7d0] bg-[#ecfdf5] text-[#15803d]",
  neutral: "border-[#cbd5e1] bg-[#f1f5f9] text-[#334155]",
  info: "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
};

export const buttonClasses = {
  primary: "inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#0f766e] px-4 text-sm font-medium text-white hover:enabled:bg-[#115e59] disabled:opacity-60",
  secondary: "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#e2e8e5] bg-white px-4 text-sm font-medium text-[#0f172a] hover:enabled:bg-[#f8faf9] disabled:opacity-60",
};

export const inputClasses = "min-h-10 w-full rounded-md border border-[#e2e8e5] bg-white px-3 text-sm text-[#0f172a] placeholder:text-[#767676]";

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={"inline-flex h-5 items-center gap-1 whitespace-nowrap rounded border px-1.5 text-[11px] font-semibold tabular-nums " + toneClasses[tone]}>
      {children}
    </span>
  );
}

export function Card({ title, note, action, children }: { title?: string; note?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#e2e8e5] bg-white">
      {title && (
        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[#e2e8e5] px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          {note && <p className="text-xs text-[#64748b]">{note}</p>}
          {action && <div className="ml-auto">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-[#475569]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Kpi({ label, value, note, icon, tone = "neutral" }: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  icon: IconName;
  tone?: Tone;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[#e2e8e5] bg-white p-4">
      <span className={"grid size-9 shrink-0 place-items-center rounded-lg border " + toneClasses[tone]}>
        <Icon name={icon} size={18} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-[#475569]">{label}</p>
        <p className="mt-1 text-2xl font-semibold leading-none tabular-nums">{value}</p>
        {note && <p className="mt-2 text-xs text-[#64748b]">{note}</p>}
      </div>
    </div>
  );
}

export function LoadingState({ label = "Завантаження…" }: { label?: string }) {
  return <p role="status" className="px-4 py-8 text-center text-sm text-[#64748b]">{label}</p>;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="font-medium">{title}</p>
      {hint && <p className="mt-1 text-sm text-[#64748b]">{hint}</p>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 px-4 py-6 text-sm text-[#b91c1c]">
      <Icon name="alert" size={16} />
      <p className="min-w-0 flex-1 break-words">{message}</p>
      {onRetry && <button type="button" className={buttonClasses.secondary} onClick={onRetry}><Icon name="refresh" size={14} />Повторити</button>}
    </div>
  );
}

export function Notice({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={"flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm " + toneClasses[tone]}>
      <span className="mt-0.5"><Icon name={tone === "danger" || tone === "warning" ? "alert" : "check"} size={16} /></span>
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

export function ProgressBar({ value, tone }: { value: number; tone: "danger" | "warning" | "success" }) {
  const color = { danger: "bg-[#b91c1c]", warning: "bg-[#d97706]", success: "bg-[#0f766e]" }[tone];
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-[#f1f5f9]">
      <div className={"h-full " + color} style={{ width: Math.max(0, Math.min(100, value)) + "%" }} />
    </div>
  );
}

export function ResourceGate<T>({ resource, errorText, children }: {
  resource: { data: T | undefined; error: unknown; reload: () => void };
  errorText: string;
  children: (data: T) => ReactNode;
}) {
  if (resource.data !== undefined) return <>{children(resource.data)}</>;
  if (resource.error instanceof ApiError && resource.error.status === 401) {
    return (
      <div role="alert" className="px-4 py-6 text-sm text-[#b91c1c]">
        Сеанс завершено. <Link className="underline" href="/login">Увійти знову</Link>
      </div>
    );
  }
  if (resource.error) return <ErrorState message={errorText} onRetry={resource.reload} />;
  return <LoadingState />;
}
