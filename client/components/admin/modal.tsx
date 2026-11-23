"use client";

import { useId, type ReactNode } from "react";
import { useModalDialog } from "@/components/ui/use-modal-dialog";
import { Icon } from "@/components/ui/icon";

export function Modal({ title, subtitle, busy, onClose, children, wide = false, footer }: {
  title: string;
  subtitle?: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {

  const titleId = useId();

  const dialog = useModalDialog(busy, onClose);

  return (
    <dialog {...dialog} aria-labelledby={titleId}
      className={"m-auto w-[calc(100%-24px)] rounded-xl border border-[#e2e8e5] bg-white p-0 text-[#0f172a] backdrop:bg-[#0f172a]/40 " +
        (wide ? "max-w-[900px]" : "max-w-[520px]")}>
      <div className={footer ? "flex max-h-[calc(100dvh-32px)] flex-col" : undefined}>
        <header className="flex shrink-0 items-start gap-3 border-b border-[#e2e8e5] px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
            {subtitle && <p className="text-xs text-[#64748b]">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Закрити"
            className="grid size-8 place-items-center rounded-md border border-[#e2e8e5]"><Icon name="x" size={14} /></button>
        </header>
        {footer ? <div className="min-h-0 overflow-y-auto">{children}</div> : children}
        {footer && <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-[#e2e8e5] px-5 py-4">{footer}</footer>}
      </div>
    </dialog>
  );
}
