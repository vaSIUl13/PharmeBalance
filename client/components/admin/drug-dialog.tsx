"use client";

import { useId, useState, type FormEvent } from "react";
import { buttonClasses, inputClasses, Notice } from "@/components/head/ui";
import { createDrug, renameDrug } from "@/lib/admin/api";
import type { Drug } from "@/lib/admin/types";
import { ApiError } from "@/lib/auth";
import { Modal } from "./modal";

export function DrugDialog({ drug, onClose, onSaved }: {
  drug?: Drug;
  onClose: () => void;
  onSaved: (item: Drug) => void;
}) {
  const formId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const field = (name: string) => String(data.get(name) ?? "").trim();
    const name = field("name");
    setBusy(true);
    setError("");
    try {
      const saved = drug ? await renameDrug(drug.drugId, name) : await createDrug({
        name, sku: field("sku"), dosageForm: field("dosageForm"), strength: field("strength") || null, unit: field("unit"),
      });
      onSaved(saved);
    } catch (failure) {
      const status = failure instanceof ApiError ? failure.status : undefined;
      setError(status === 409 ? "Такий SKU вже є в довіднику."
        : status === 400 ? "Перевірте поля препарату та формат SKU."
        : status === 403 ? "У вас немає дозволу змінювати довідник препаратів."
        : status === 404 ? "Препарат не знайдено." : "Не вдалося зберегти препарат. Спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={drug ? "Редагувати назву препарату" : "Додати локальний препарат"}
      subtitle={drug ? drug.sku : "Для місцевого обліку в мережі. Заповніть SKU й дані фасування."}
      busy={busy} onClose={onClose} footer={
        <>
          {error && <div className="w-full"><Notice tone="danger">{error}</Notice></div>}
          <button type="button" className={buttonClasses.secondary} onClick={onClose} disabled={busy}>Скасувати</button>
          <button form={formId} type="submit" className={buttonClasses.primary} disabled={busy}>
            {busy ? "Зберігаємо…" : "Зберегти"}
          </button>
        </>
      }>
      <form id={formId} className="grid gap-3 p-5" onSubmit={submit}>
        {!drug && <label className="grid gap-1 text-sm font-medium">SKU
          <input className={inputClasses} name="sku" placeholder="NET-0001" maxLength={30} disabled={busy} required />
        </label>}
        <label className="grid gap-1 text-sm font-medium">Назва
          <input className={inputClasses} name="name" defaultValue={drug?.name} maxLength={120} disabled={busy} required />
        </label>
        {!drug && <>
          <label className="grid gap-1 text-sm font-medium">Лікарська форма
            <input className={inputClasses} name="dosageForm" maxLength={40} disabled={busy} required />
          </label>
          <label className="grid gap-1 text-sm font-medium">Дозування
            <input className={inputClasses} name="strength" maxLength={40} disabled={busy} />
          </label>
          <label className="grid gap-1 text-sm font-medium">Одиниця обліку
            <input className={inputClasses} name="unit" placeholder="упаковка" maxLength={20} disabled={busy} required />
          </label>
        </>}
      </form>
    </Modal>
  );
}
