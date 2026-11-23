"use client";

import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/auth";
import { formatDrug } from "@/lib/head/format";
import type { TransferDetail } from "@/lib/head/types";
import { dispatchTransfer } from "@/lib/logist/api";
import { useModalDialog } from "@/components/ui/use-modal-dialog";
import { Icon } from "@/components/ui/icon";
import { buttonClasses, inputClasses, Notice } from "@/components/head/ui";

const conflictMessage = "Статус переміщення змінився або резерв більше недоступний. Дані оновлено, перевірте картку.";

function failureMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return conflictMessage;
    if (error.status === 403) return "Недостатньо прав для відправлення цього переміщення.";
    if (error.status === 404) return "Переміщення не знайдено або недоступне для вас.";
  }
  return "Не вдалося розпочати переміщення. Спробуйте ще раз.";
}

export function DispatchDialog({ trip, onClose, onChanged }: {
  trip: TransferDetail;
  onClose: () => void;
  onChanged: (message: string) => void;
}) {

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const drug = trip.donorStock.drug;

  const dialog = useModalDialog(busy, onClose);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const comment = String(new FormData(event.currentTarget).get("comment") ?? "").trim();
    setBusy(true);
    setError("");
    try {
      const result = await dispatchTransfer(trip.recommendationId, comment);
      onChanged(result.replayed
        ? "Переміщення вже було розпочато раніше."
        : "Переміщення розпочато. Статус: «В дорозі».");
    } catch (failure) {
      setError(failureMessage(failure));
      if (failure instanceof ApiError && failure.status === 409) onChanged(conflictMessage);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog {...dialog} aria-labelledby="dispatch-title"
      className="m-auto w-[min(100%-24px,480px)] rounded-xl border border-[#e2e8e5] bg-white p-0 text-[#0f172a] backdrop:bg-[#0f172a]/40">
      <form onSubmit={submit}>
        <header className="flex items-start gap-3 border-b border-[#e2e8e5] px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="dispatch-title" className="text-lg font-semibold">Розпочати переміщення</h2>
            <p className="text-xs text-[#64748b]">Рейс №{trip.recommendationId}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Закрити"
            className="grid size-8 place-items-center rounded-md border border-[#e2e8e5]"><Icon name="x" size={14} /></button>
        </header>
        <div className="space-y-4 px-5 py-4">
          <dl className="space-y-2 rounded-lg bg-[#f8faf9] p-3 text-sm">
            <div><dt className="text-xs text-[#64748b]">Препарат</dt><dd className="font-medium">{drug.name}</dd>
              <dd className="text-xs text-[#475569]"><span className="tabular-nums">{drug.sku}</span> · {formatDrug(drug)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[#64748b]">Звідки</dt><dd className="text-right font-medium">{trip.donorStock.pharmacy.name}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[#64748b]">Куди</dt><dd className="text-right font-medium">{trip.recipientStock.pharmacy.name}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[#64748b]">Кількість</dt><dd className="font-medium tabular-nums">{trip.quantity} {drug.unit}</dd></div>
          </dl>
          <div>
            <label htmlFor="dispatch-comment" className="mb-1 block text-xs font-semibold text-[#475569]">Коментар</label>
            <textarea id="dispatch-comment" name="comment" maxLength={300} rows={3} placeholder="Необов’язково"
              className={inputClasses + " py-2"} />
          </div>
          <p className="text-xs text-[#64748b]">Статус зміниться на «В дорозі». Завідувач аптеки-реципієнта підтвердить отримання.</p>
          {error && <Notice tone="danger">{error}</Notice>}
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-[#e2e8e5] px-5 py-4">
          <button type="button" className={buttonClasses.secondary} onClick={onClose} disabled={busy}>Скасувати</button>
          <button type="submit" className={buttonClasses.primary} disabled={busy}>
            <Icon name="truck" size={16} />{busy ? "Зачекайте…" : "Розпочати переміщення"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
