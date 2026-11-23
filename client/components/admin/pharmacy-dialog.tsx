"use client";

import { useState, type FormEvent } from "react";
import { createPharmacy, searchExternalPharmacies } from "@/lib/admin/api";
import type { CreatePharmacyInput, ExternalPharmacy } from "@/lib/admin/types";
import { ApiError } from "@/lib/auth";
import { buttonClasses, inputClasses, Notice } from "@/components/head/ui";
import { Modal } from "./modal";

const fields = [
  { name: "code", label: "Код аптеки", maxLength: 20 },
  { name: "name", label: "Назва", maxLength: 100 },
  { name: "city", label: "Місто", maxLength: 60 },
  { name: "address", label: "Адреса", maxLength: 150 },
  { name: "latitude", label: "Широта", bound: 90 },
  { name: "longitude", label: "Довгота", bound: 180 },
] as const;

const initialValues = { code: "", name: "", city: "", address: "", latitude: "", longitude: "" };

export function PharmacyDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (name: string) => void }) {
  const [values, setValues] = useState(initialValues);
  const [query, setQuery] = useState("");
  const [lastQuery, setLastQuery] = useState("");
  const [items, setItems] = useState<ExternalPharmacy[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [selected, setSelected] = useState<ExternalPharmacy | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [error, setError] = useState("");

  async function search(event?: FormEvent<HTMLFormElement>, after?: number) {
    event?.preventDefault();
    setSearching(true);
    setSearchError("");
    const term = after === undefined ? query.trim() : lastQuery;
    try {
      const page = await searchExternalPharmacies(term, after);
      setItems(current => after === undefined ? page.items : [...(current ?? []), ...page.items]);
      setNext(page.next);
      setLastQuery(term);
    } catch {
      setSearchError("Не вдалося завантажити зовнішній довідник.");
    } finally {
      setSearching(false);
    }
  }

  function select(item: ExternalPharmacy) {
    setSelected(item);
    setValues(current => ({ ...current, name: item.name ?? "", city: item.city ?? "", address: item.address ?? "",
      latitude: item.latitude ?? "", longitude: item.longitude ?? "" }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    const input: CreatePharmacyInput = {
      code: values.code.trim(), name: values.name.trim(), city: values.city.trim(), address: values.address.trim(),
      latitude: Number(values.latitude), longitude: Number(values.longitude),
      externalRecordIds: selected ? [selected.id] : undefined,
    };
    try {
      const pharmacy = await createPharmacy(input);
      onCreated(pharmacy.name);
    } catch (failure) {
      const status = failure instanceof ApiError ? failure.status : undefined;
      setError(status === 409 ? "Код аптеки вже використовується або запис довідника вже прив’язано."
        : status === 400 ? "Перевірте код, адресу та координати аптеки."
        : status === 403 ? "У вас немає дозволу додавати аптеки." : "Не вдалося створити аптеку. Спробуйте ще раз.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Додати аптеку" subtitle="Заповніть дані вручну або виберіть аптеку з довідника." busy={saving} onClose={onClose}>
      <details className="border-b border-[#e2e8e5] px-5 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-[#0f766e]">Зовнішній довідник</summary>
        <form className="mt-3 flex flex-wrap gap-2" onSubmit={search}>
          <input className={inputClasses + " flex-1"} aria-label="Пошук у зовнішньому довіднику"
            placeholder="Назва, місто або адреса" maxLength={100} value={query} onChange={event => setQuery(event.target.value)} />
          <button className={buttonClasses.secondary} disabled={searching || saving}>Знайти</button>
        </form>
        {searchError && <p role="alert" className="mt-2 text-sm text-[#b91c1c]">{searchError}</p>}
        {items?.length === 0 && <p className="mt-2 text-sm text-[#475569]">Аптек за цим запитом немає.</p>}
        {items && items.length > 0 && (
          <ul className="mt-3 max-h-44 divide-y divide-[#e2e8e5] overflow-y-auto rounded-md border border-[#e2e8e5]">
            {items.map(item => <li key={item.id}>
              <button type="button" disabled={item.pharmacyId !== null || saving} aria-pressed={selected?.id === item.id}
                onClick={() => select(item)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-[#f8faf9] aria-pressed:bg-[#ecfdf5] disabled:opacity-60">
                <span className="block font-medium">{item.name ?? "Аптека без назви"}</span>
                <span className="block text-xs text-[#475569]">{[item.source, item.city, item.address, item.pharmacyId !== null ? "Вже прив’язано" : null].filter(Boolean).join(" · ")}</span>
              </button>
            </li>)}
          </ul>
        )}
        {next !== null && <button type="button" className={buttonClasses.secondary + " mt-2"} disabled={searching || saving}
          onClick={() => void search(undefined, next)}>Показати ще</button>}
      </details>
      <form onSubmit={submit}>
        <div className="space-y-3 px-5 py-4">
          {selected && <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{selected.name ?? "Аптека"} · {selected.source}</span>
            <button type="button" className={buttonClasses.secondary} disabled={saving}
              onClick={() => setSelected(null)}>Від’єднати запис</button>
          </div>}
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map(field => <label key={field.name} className="grid gap-1 text-sm font-medium">
              {field.label}
              <input className={inputClasses} required disabled={saving} value={values[field.name]}
                {...("bound" in field ? { type: "number", min: -field.bound, max: field.bound, step: "any" }
                  : { maxLength: field.maxLength, pattern: field.name === "code" ? "[A-Za-z0-9][A-Za-z0-9._\\-]*" : undefined })}
                onChange={event => setValues(current => ({ ...current, [field.name]: event.target.value }))} />
            </label>)}
          </div>
          {error && <Notice tone="danger">{error}</Notice>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-[#e2e8e5] px-5 py-4">
          <button type="button" className={buttonClasses.secondary} onClick={onClose} disabled={saving}>Скасувати</button>
          <button type="submit" className={buttonClasses.primary} disabled={saving}>{saving ? "Зберігаємо…" : "Додати аптеку"}</button>
        </footer>
      </form>
    </Modal>
  );
}
