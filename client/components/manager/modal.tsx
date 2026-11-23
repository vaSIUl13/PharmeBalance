"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";

export function Modal({ title, subtitle, busy, onClose, children }: {
  title: string;
  subtitle?: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    return () => element.close();
  }, []);

  return (
    <dialog ref={dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
      className="m-auto w-[min(100%-24px,520px)] rounded-xl border border-[#e2e8e5] bg-white p-0 text-[#0f172a] backdrop:bg-[#0f172a]/40">
      <header className="flex items-start gap-3 border-b border-[#e2e8e5] px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-[#64748b]">{subtitle}</p>}
        </div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Закрити"
          className="grid size-8 place-items-center rounded-md border border-[#e2e8e5]"><Icon name="x" size={14} /></button>
      </header>
      {children}
    </dialog>
  );
}
