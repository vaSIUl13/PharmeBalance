"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/auth";
import { receiveTransfer } from "@/lib/head/api";
import { formatDrug } from "@/lib/head/format";
import type { TransferDetail } from "@/lib/head/types";
import { Icon } from "./icon";
import { buttonClasses, inputClasses, Notice } from "./ui";

const conflictMessage = "Статус переміщення або залишок донора змінилися. Дані оновлено, перевірте картку.";

function failureMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return conflictMessage;
    if (error.status === 403) return "Недостатньо прав для підтвердження цього отримання.";
    if (error.status === 404) return "Переміщення не знайдено або недоступне для вашої аптеки.";
  }
  return "Не вдалося підтвердити отримання. Спробуйте ще раз.";
}

export function ReceiveDialog({ transfer, onClose, onChanged }: {
  transfer: TransferDetail;
  onClose: () => void;
  onChanged: (message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const drug = transfer.donorStock.drug;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    return () => element.close();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const comment = String(new FormData(event.currentTarget).get("comment") ?? "").trim();
    setBusy(true);
    setError("");
    try {
      const result = await receiveTransfer(transfer.recommendationId, transfer.quantity, comment);
      onChanged(result.replayed
        ? "Отримання вже було підтверджено раніше."
        : "Отримання підтверджено, залишки оновлено.");
    } catch (failure) {
      setError(failureMessage(failure));
      if (failure instanceof ApiError && failure.status === 409) onChanged(conflictMessage);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialog} aria-labelledby="receive-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
      className="m-auto w-[min(100%-24px,480px)] rounded-xl border border-[#e2e8e5] bg-white p-0 text-[#0f172a] backdrop:bg-[#0f172a]/40">
      <form onSubmit={submit}>
        <header className="flex items-start gap-3 border-b border-[#e2e8e5] px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="receive-title" className="text-lg font-semibold">Підтвердження отримання</h2>
            <p className="text-xs text-[#64748b]">Переміщення №{transfer.recommendationId}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Закрити"
            className="grid size-8 place-items-center rounded-md border border-[#e2e8e5]"><Icon name="x" size={14} /></button>
        </header>
        <div className="space-y-4 px-5 py-4">
          <dl className="space-y-2 rounded-lg bg-[#f8faf9] p-3 text-sm">
            <div><dt className="text-xs text-[#64748b]">Препарат</dt><dd className="font-medium">{drug.name}</dd>
              <dd className="text-xs text-[#475569]"><span className="tabular-nums">{drug.sku}</span> · {formatDrug(drug)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[#64748b]">Донор</dt><dd className="text-right font-medium">{transfer.donorStock.pharmacy.name}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[#64748b]">Відправлено</dt><dd className="font-medium tabular-nums">{transfer.quantity} {drug.unit}</dd></div>
          </dl>
          <div>
            <label htmlFor="receive-quantity" className="mb-1 block text-xs font-semibold text-[#475569]">Фактично отримана кількість, {drug.unit}</label>
            <input id="receive-quantity" className={inputClasses + " tabular-nums"} value={transfer.quantity} readOnly aria-describedby="receive-hint" />
            <p id="receive-hint" className="mt-1 text-xs text-[#64748b]">Заповнено з картки переміщення. Система приймає лише повну відправлену кількість.</p>
          </div>
          <div>
            <label htmlFor="receive-comment" className="mb-1 block text-xs font-semibold text-[#475569]">Коментар</label>
            <textarea id="receive-comment" name="comment" maxLength={300} rows={3} placeholder="Необов’язково"
              className={inputClasses + " py-2"} />
          </div>
          {error && <Notice tone="danger">{error}</Notice>}
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-[#e2e8e5] px-5 py-4">
          <button type="button" className={buttonClasses.secondary} onClick={onClose} disabled={busy}>Скасувати</button>
          <button type="submit" className={buttonClasses.primary} disabled={busy}>
            <Icon name="check" size={16} />{busy ? "Зачекайте…" : "Підтвердити отримання"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
