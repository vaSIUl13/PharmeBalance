"use client";

import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { createPharmacy, searchExternalPharmacies, updatePharmacy } from "@/lib/admin/api";
import type { AdminPharmacy, ExternalPharmacy } from "@/lib/admin/types";
import { ApiError } from "@/lib/auth";
import { buttonClasses, inputClasses, Notice } from "@/components/head/ui";
import { Modal } from "./modal";
import { PharmacyMap } from "./pharmacy-map";

const fields = [
  { name: "code", label: "Код аптеки", maxLength: 20 },
  { name: "name", label: "Назва", maxLength: 100 },
  { name: "city", label: "Місто", maxLength: 60 },
  { name: "address", label: "Адреса", maxLength: 150 },
  { name: "latitude", label: "Широта", bound: 90 },
  { name: "longitude", label: "Довгота", bound: 180 },
] as const;

const initialValues = { code: "", name: "", city: "", address: "", latitude: "", longitude: "" };

function catalogText(value: string | null) {
  const text = value?.trim() ?? "";
  return /^[?\uFFFD\s]+$/u.test(text) ? "" : text;
}

function complete(item: ExternalPharmacy) {
  return [item.name, item.city, item.address, item.latitude, item.longitude].every(value => Boolean(catalogText(value)));
}

function coordinate(value: string, bound: number) {
  const clean = value.trim().replace(",", ".");
  const number = Number(clean);
  return /^-?\d+(\.\d+)?$/.test(clean) && Math.abs(number) <= bound ? number : null;
}

export function PharmacyDialog({ pharmacy, onClose, onSaved }: {
  pharmacy?: AdminPharmacy;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const formId = useId();
  const [values, setValues] = useState(() => pharmacy ? {
    code: pharmacy.code, name: pharmacy.name, city: pharmacy.city, address: pharmacy.address,
    latitude: pharmacy.latitude, longitude: pharmacy.longitude,
  } : initialValues);
  const [query, setQuery] = useState("");
  const [lastQuery, setLastQuery] = useState("");
  const [items, setItems] = useState<ExternalPharmacy[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [selected, setSelected] = useState<ExternalPharmacy | null>(null);
  const [searching, setSearching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [error, setError] = useState("");
  const rankedItems = items?.toSorted((a, b) => {
    const linked = Number(a.pharmacyId !== null) - Number(b.pharmacyId !== null);
    if (linked) return linked;
    const fields = (item: ExternalPharmacy) => [item.name, item.city, item.address, item.latitude, item.longitude]
      .filter(value => catalogText(value)).length;
    return fields(b) - fields(a);
  });

  useEffect(() => {
    if (pharmacy) return;
    let active = true;
    void searchExternalPharmacies("").then(page => {
      if (!active) return;
      setItems(page.items.filter(complete));
      setNext(page.next);
    }).catch(() => {
      if (active) setSearchError("Не вдалося завантажити зовнішній довідник.");
    }).finally(() => {
      if (active) setSearching(false);
    });
    return () => { active = false; };
  }, [pharmacy]);

  async function search(event?: FormEvent<HTMLFormElement>, after?: number) {
    event?.preventDefault();
    setSearching(true);
    setSearchError("");
    const term = after === undefined ? query.trim() : lastQuery;
    try {
      const page = await searchExternalPharmacies(term, after);
      const records = page.items.filter(complete);
      setItems(current => after === undefined ? records : [...(current ?? []), ...records]);
      setNext(page.next);
      setLastQuery(term);
    } catch {
      setSearchError("Не вдалося завантажити зовнішній довідник.");
    } finally {
      setSearching(false);
    }
  }

  const select = useCallback((item: ExternalPharmacy) => {
    setError("");
    setSelected(item);
    setValues(current => ({ ...current,
      name: catalogText(item.name), city: catalogText(item.city), address: catalogText(item.address),
      latitude: item.latitude ?? "", longitude: item.longitude ?? "" }));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const latitude = coordinate(values.latitude, 90);
    const longitude = coordinate(values.longitude, 180);
    if (latitude === null || longitude === null) {
      setError("Введіть широту від −90 до 90 та довготу від −180 до 180.");
      return;
    }
    setSaving(true);
    setError("");
    const details = { name: values.name.trim(), city: values.city.trim(), address: values.address.trim(), latitude, longitude };
    try {
      const changes = pharmacy ? Object.fromEntries(Object.entries(details).filter(([name, value]) => {
        switch (name) {
          case "latitude":
          case "longitude":
            return value !== Number(pharmacy[name]);
          case "name":
          case "city":
          case "address":
            return value !== pharmacy[name];
          default:
            return false;
        }
      })) : null;
      if (changes && !Object.keys(changes).length) {
        onClose();
        return;
      }
      const saved = pharmacy && changes ? await updatePharmacy(pharmacy.pharmacyId, changes) : await createPharmacy({
        ...details, code: selected ? "EXT-" + selected.id : values.code.trim(),
        externalRecordIds: selected ? [selected.id] : undefined,
      });
      onSaved(saved.name);
    } catch (failure) {
      const status = failure instanceof ApiError ? failure.status : undefined;
      setError(status === 409 ? "Код аптеки вже використовується або запис довідника вже прив’язано."
        : status === 400 ? "Перевірте код, адресу та координати аптеки."
        : status === 403 ? "У вас немає дозволу змінювати довідник аптек."
        : status === 404 ? "Аптеку не знайдено." : "Не вдалося зберегти аптеку. Спробуйте ще раз.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal wide={!pharmacy} title={pharmacy ? "Редагувати аптеку" : "Додати аптеку"}
      subtitle={pharmacy?.code ?? "Виберіть аптеку з довідника або заповніть дані вручну."} busy={saving} onClose={onClose}
      footer={<>
        {error && <div className="w-full"><Notice tone="danger">{error}</Notice></div>}
        <button type="button" className={buttonClasses.secondary} onClick={onClose} disabled={saving}>Скасувати</button>
        <button form={formId} type="submit" className={buttonClasses.primary} disabled={saving}>
          {saving ? "Зберігаємо…" : pharmacy ? "Зберегти" : "Додати аптеку"}
        </button>
      </>}>
      {!pharmacy && <section aria-label="Зовнішній довідник аптек" className="space-y-3 border-b border-[#e2e8e5] px-5 py-4">
        <form className="flex flex-wrap gap-2" onSubmit={search}>
          <input className={inputClasses + " min-w-0 flex-1"} aria-label="Пошук у зовнішньому довіднику"
            placeholder="Назва, місто або адреса" maxLength={100} value={query} onChange={event => setQuery(event.target.value)} />
          <button className={buttonClasses.secondary} disabled={searching || saving}>Знайти</button>
        </form>
        {searching && <p role="status" className="text-sm text-[#475569]">Завантажуємо аптеки…</p>}
        {searchError && <p role="alert" className="mt-2 text-sm text-[#b91c1c]">{searchError}</p>}
        {items?.length === 0 && <p className="mt-2 text-sm text-[#475569]">У довіднику немає аптек із повними даними за цим запитом.</p>}
        {items && items.length > 0 && (
          <div className="grid gap-3 md:grid-cols-[1.4fr_1fr]">
            <PharmacyMap items={items} onSelect={select} />
            <ul aria-label="Результати пошуку" className="max-h-56 divide-y divide-[#e2e8e5] overflow-y-auto rounded-md border border-[#e2e8e5] sm:max-h-64">
            {rankedItems?.map(item => <li key={item.id}>
              <button type="button" disabled={item.pharmacyId !== null || saving} aria-pressed={selected?.id === item.id}
                onClick={() => select(item)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-[#f8faf9] aria-pressed:bg-[#ecfdf5] disabled:opacity-60">
                <span className="block font-medium">{catalogText(item.name) || "Аптека без назви"}</span>
                <span className="block text-xs text-[#475569]">{[item.source, catalogText(item.city), catalogText(item.address), item.pharmacyId !== null ? "Вже прив’язано" : null].filter(Boolean).join(" · ")}</span>
              </button>
            </li>)}
            </ul>
          </div>
        )}
        {next !== null && <button type="button" className={buttonClasses.secondary + " mt-2"} disabled={searching || saving}
          onClick={() => void search(undefined, next)}>Показати ще</button>}
        {items && items.length > 0 && <p className="text-xs text-[#475569]">Зелені точки можна додати, сірі вже прив’язані до мережі.</p>}
      </section>}
      <form id={formId} onSubmit={submit}>
        <div className="space-y-3 px-5 py-4">
          {selected && <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{catalogText(selected.name) || "Аптека"} · {selected.source}</span>
            <button type="button" className={buttonClasses.secondary} disabled={saving}
              onClick={() => { setSelected(null); setError(""); }}>Від’єднати запис</button>
          </div>}
          {selected && fields.some(field => field.name !== "code" && !values[field.name].trim()) && (
            <p className="text-sm text-[#475569]">У довіднику бракує даних. Заповніть порожні поля перед збереженням.</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.filter(field => field.name !== "code" || (!selected && !pharmacy)).map(field => <label key={field.name} className="grid gap-1 text-sm font-medium">
              {field.label}
              <input className={inputClasses} required disabled={saving} value={values[field.name]}
                {...("bound" in field ? { inputMode: "decimal" as const }
                  : { maxLength: field.maxLength, pattern: field.name === "code" ? "[A-Za-z0-9][A-Za-z0-9._\\-]*" : undefined })}
                onChange={event => { setError(""); setValues(current => ({ ...current, [field.name]: event.target.value })); }} />
            </label>)}
          </div>
        </div>
      </form>
    </Modal>
  );
}
