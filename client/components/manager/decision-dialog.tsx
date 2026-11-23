"use client";

import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/auth";
import { formatDrug } from "@/lib/head/format";
import type { TransferDetail } from "@/lib/head/types";
import { decide } from "@/lib/manager/api";
import type { DecisionCommand } from "@/lib/manager/types";
import { Modal } from "./modal";
import { buttonClasses, inputClasses, Notice } from "@/components/head/ui";

const copy: Record<DecisionCommand, { title: string; submit: string; success: string; note: string }> = {
  CONFIRM: {
    title: "Підтвердити рекомендацію", submit: "Підтвердити", success: "Рекомендацію підтверджено, залишок донора зарезервовано.",
    note: "Система перевірить актуальність даних і зарезервує кількість у донора. Логіст побачить завдання в черзі.",
  },
  REJECT: {
    title: "Відхилити рекомендацію", submit: "Відхилити", success: "Рекомендацію відхилено.",
    note: "Рекомендацію буде закрито без резервування.",
  },
  CANCEL: {
    title: "Скасувати переміщення", submit: "Скасувати переміщення", success: "Переміщення скасовано, резерв знято.",
    note: "Резерв у донора буде знято. Скасувати можна лише до початку переміщення.",
  },
};

function failureText(command: DecisionCommand, error: unknown): string {
  const status = error instanceof ApiError ? error.status : 0;
  if (status === 409) {
    return command === "CONFIRM"
      ? "Рекомендація застаріла: дані змінилися. Перерахуйте прогноз і рекомендації."
      : "Статус рекомендації вже змінився. Дані оновлено, перевірте картку.";
  }
  if (status === 403) return "Недостатньо прав для цієї дії.";
  if (status === 404) return "Рекомендацію не знайдено.";
  return "Не вдалося виконати дію. Спробуйте ще раз.";
}

export function DecisionDialog({ trip, command, onClose, onDone }: {
  trip: TransferDetail;
  command: DecisionCommand;
  onClose: () => void;
  onDone: (message: string, ok: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const drug = trip.donorStock.drug;
  const view = copy[command];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const comment = String(new FormData(event.currentTarget).get("comment") ?? "").trim();
    setBusy(true);
    setError("");
    try {
      const result = await decide(trip.recommendationId, command, comment);
      onDone(result.replayed ? "Дію вже було виконано раніше." : view.success, true);
    } catch (failure) {
      const message = failureText(command, failure);
      setError(message);
      if (failure instanceof ApiError && (failure.status === 409 || failure.status === 404)) onDone(message, false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={view.title} subtitle={"Рекомендація №" + trip.recommendationId} busy={busy} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="space-y-4 px-5 py-4">
          <dl className="space-y-2 rounded-lg bg-[#f8faf9] p-3 text-sm">
            <div><dt className="text-xs text-[#64748b]">Препарат</dt><dd className="font-medium">{drug.name}</dd>
              <dd className="text-xs text-[#475569]"><span className="tabular-nums">{drug.sku}</span> · {formatDrug(drug)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[#64748b]">Донор</dt><dd className="text-right font-medium">{trip.donorStock.pharmacy.name}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[#64748b]">Реципієнт</dt><dd className="text-right font-medium">{trip.recipientStock.pharmacy.name}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[#64748b]">Кількість</dt><dd className="font-medium tabular-nums">{trip.quantity} {drug.unit}</dd></div>
          </dl>
          <p className="text-sm text-[#475569]">{view.note}</p>
          <div>
            <label htmlFor="decision-comment" className="mb-1 block text-xs font-semibold text-[#475569]">Коментар</label>
            <textarea id="decision-comment" name="comment" maxLength={300} rows={3} placeholder="Необов’язково" className={inputClasses + " py-2"} />
          </div>
          {error && <Notice tone="danger">{error}</Notice>}
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-[#e2e8e5] px-5 py-4">
          <button type="button" className={buttonClasses.secondary} onClick={onClose} disabled={busy}>Закрити</button>
          <button type="submit" disabled={busy}
            className={command === "CONFIRM" ? buttonClasses.primary
              : "inline-flex min-h-10 items-center justify-center rounded-md bg-[#b91c1c] px-4 text-sm font-medium text-white hover:enabled:bg-[#991b1b] disabled:opacity-60"}>
            {busy ? "Зачекайте…" : view.submit}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
