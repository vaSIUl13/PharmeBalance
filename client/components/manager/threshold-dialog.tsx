"use client";

import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/auth";
import { formatNumber } from "@/lib/head/format";
import type { ForecastItem } from "@/lib/head/types";
import { updateThresholds } from "@/lib/manager/api";
import { Modal } from "./modal";
import { buttonClasses, inputClasses, Notice } from "@/components/head/ui";

export function ThresholdDialog({ item, pharmacy, onClose, onDone }: {
  item: ForecastItem;
  pharmacy: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const msl = Number(form.get("msl"));
    const maxLevel = Number(form.get("maxLevel"));
    if (!Number.isInteger(msl) || !Number.isInteger(maxLevel) || msl < 0 || maxLevel < 0) {
      setError("Пороги мають бути цілими невід’ємними числами.");
      return;
    }
    if (msl > maxLevel) {
      setError("MSL не може перевищувати Max.");
      return;
    }
    if (msl === item.msl && maxLevel === item.maxLevel) {
      setError("Значення не змінилися.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await updateThresholds(item.stockId, msl, maxLevel);
      onDone("Пороги оновлено. Нові значення враховуватимуться в наступному розрахунку.");
    } catch (failure) {
      const status = failure instanceof ApiError ? failure.status : 0;
      setError(status === 400 ? "Перевірте значення порогів: MSL не може перевищувати Max."
        : status === 403 ? "Недостатньо прав для зміни порогів."
        : status === 404 ? "Позицію не знайдено."
        : "Не вдалося зберегти пороги. Спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Змінити пороги MSL / Max" subtitle={item.stock.drug.name + " · " + pharmacy} busy={busy} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="space-y-4 px-5 py-4">
          <p className="text-sm text-[#475569]">Поточний залишок: <b className="tabular-nums text-[#0f172a]">{formatNumber(item.quantity)}</b></p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="threshold-msl" className="mb-1 block text-xs font-semibold text-[#475569]">MSL (мінімальний запас)</label>
              <input id="threshold-msl" name="msl" type="number" inputMode="numeric" min={0} step={1} required
                defaultValue={item.msl ?? 0} className={inputClasses + " tabular-nums"} />
            </div>
            <div>
              <label htmlFor="threshold-max" className="mb-1 block text-xs font-semibold text-[#475569]">Max (максимальний запас)</label>
              <input id="threshold-max" name="maxLevel" type="number" inputMode="numeric" min={0} step={1} required
                defaultValue={item.maxLevel ?? 0} className={inputClasses + " tabular-nums"} />
            </div>
          </div>
          {error && <Notice tone="danger">{error}</Notice>}
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-[#e2e8e5] px-5 py-4">
          <button type="button" className={buttonClasses.secondary} onClick={onClose} disabled={busy}>Скасувати</button>
          <button type="submit" className={buttonClasses.primary} disabled={busy}>{busy ? "Зачекайте…" : "Зберегти"}</button>
        </footer>
      </form>
    </Modal>
  );
}
