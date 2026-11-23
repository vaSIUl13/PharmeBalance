"use client";

import { useCallback, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/auth";
import { loadImport, loadImports, uploadImport } from "@/lib/head/api";
import { formatDateTime, formatNumber, importKinds, importStatuses } from "@/lib/head/format";
import type { ImportBatch, ImportDetail, ImportKind } from "@/lib/head/types";
import { useResource } from "@/lib/head/use-resource";
import { Icon } from "@/components/ui/icon";
import { useHeadSession } from "./head-session";
import { Badge, buttonClasses, Card, EmptyState, inputClasses, Notice, PageHeader, ResourceGate } from "./ui";

const maxFileBytes = 1024 * 1024;
const loadFirstPage = () => loadImports();

const kindOptions: { value: ImportKind; label: string; hint: string }[] = [
  { value: "stocks", label: "Залишки", hint: "Знімок поточних залишків аптеки" },
  { value: "sales", label: "Продажі", hint: "Історія продажів за період" },
];

function StatusBadge({ status }: { status: ImportBatch["status"] }) {
  const view = importStatuses[status];
  return <Badge tone={view.tone}>{view.label}</Badge>;
}

function ErrorsTable({ errors }: { errors: ImportDetail["errors"] }) {
  if (errors.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#e2e8e5] text-left text-xs text-[#64748b]">
            <th scope="col" className="px-4 py-2 font-medium">Рядок</th>
            <th scope="col" className="px-2 py-2 font-medium">Помилка</th>
          </tr>
        </thead>
        <tbody>
          {errors.map((error, index) => (
            <tr key={index} className="border-b border-[#e2e8e5] last:border-0">
              <td className="px-4 py-2 tabular-nums">{error.row === 0 ? "Файл" : error.row}</td>
              <td className="break-words px-2 py-2">{error.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Summary({ detail }: { detail: ImportDetail }) {
  return (
    <div className="space-y-3">
      <dl className="grid gap-3 px-4 pt-4 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-[#64748b]">Файл</dt><dd className="break-all font-medium">{detail.fileName}</dd></div>
        <div><dt className="text-xs text-[#64748b]">Усього рядків</dt><dd className="font-medium tabular-nums">{formatNumber(detail.recordsTotal)}</dd></div>
        <div><dt className="text-xs text-[#64748b]">Застосовано</dt><dd className="font-medium tabular-nums">{formatNumber(detail.recordsApplied)}</dd></div>
        <div><dt className="text-xs text-[#64748b]">Відхилено</dt><dd className="font-medium tabular-nums">{formatNumber(detail.recordsRejected)}</dd></div>
      </dl>
      <ErrorsTable errors={detail.errors} />
    </div>
  );
}

function DetailPanel({ id, onClose }: { id: number; onClose: () => void }) {
  const load = useCallback(() => loadImport(id), [id]);
  const detail = useResource(load);
  return (
    <Card title={"Імпорт №" + id} action={
      <button type="button" className={buttonClasses.secondary} onClick={onClose}><Icon name="x" size={14} />Закрити</button>
    }>
      <ResourceGate resource={detail} errorText="Не вдалося завантажити деталі імпорту.">
        {data => <Summary detail={data} />}
      </ResourceGate>
    </Card>
  );
}

function failureMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return "Недостатньо прав для імпорту даних.";
    if (error.status === 413) return "Файл завеликий для завантаження.";
  }
  return "Не вдалося завантажити файл. Спробуйте ще раз.";
}

export function ImportPage() {
  const { principal, pharmacy } = useHeadSession();
  const history = useResource(loadFirstPage);
  const [kind, setKind] = useState<ImportKind>("stocks");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [result, setResult] = useState<ImportDetail | null>(null);
  const [extra, setExtra] = useState<ImportBatch[]>([]);
  const [next, setNext] = useState<number | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  const pharmacyId = principal.pharmacyIds[0];
  const rows = [...(history.data?.items ?? []), ...extra];
  const cursor = next === undefined ? history.data?.next ?? null : next;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const source = new FormData(event.currentTarget);
    const file = source.get("file");
    setResult(null);
    if (!(file instanceof File) || file.size === 0) {
      setProblem("Оберіть файл у форматі CSV або JSON.");
      return;
    }
    if (file.size > maxFileBytes) {
      setProblem("Файл завеликий: максимальний розмір — 1 МБ.");
      return;
    }
    const form = new FormData();
    form.append("file", file);
    form.append("pharmacyId", String(pharmacyId));
    if (kind === "stocks") {
      const value = String(source.get("snapshotAt") ?? "");
      const date = value ? new Date(value) : new Date();
      if (Number.isNaN(date.getTime())) {
        setProblem("Вкажіть коректні дату й час знімка.");
        return;
      }
      form.append("snapshotAt", date.toISOString());
    }
    setBusy(true);
    setProblem("");
    try {
      const detail = await uploadImport(kind, form);
      setResult(detail);
      setExtra([]);
      setNext(undefined);
      history.reload();
    } catch (failure) {
      setProblem(failureMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function showMore() {
    if (cursor === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await loadImports(cursor);
      setExtra(current => [...current, ...page.items]);
      setNext(page.next);
    } catch {
      setProblem("Не вдалося завантажити старіші імпорти.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <PageHeader title="Імпорт даних" subtitle={pharmacy?.name} />

      <Card title="Нове завантаження" note="CSV або JSON, до 1 МБ">
        <form className="space-y-4 p-4" onSubmit={submit}>
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-2 text-xs font-semibold text-[#475569]">Тип даних</legend>
            {kindOptions.map(option => (
              <label key={option.value} className={"flex cursor-pointer items-start gap-3 rounded-lg border p-3 " +
                (kind === option.value ? "border-[#0f766e] bg-[#f0fdfa]" : "border-[#e2e8e5]")}>
                <input type="radio" name="kind" value={option.value} checked={kind === option.value}
                  onChange={() => setKind(option.value)} className="mt-1 accent-[#0f766e]" />
                <span><span className="block text-sm font-medium">{option.label}</span>
                  <span className="block text-xs text-[#64748b]">{option.hint}</span></span>
              </label>
            ))}
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="import-file" className="mb-1 block text-xs font-semibold text-[#475569]">Файл</label>
              <input id="import-file" name="file" type="file" accept=".csv,.json,text/csv,application/json" required
                className={inputClasses + " py-1.5"} />
            </div>
            {kind === "stocks" && (
              <div>
                <label htmlFor="import-snapshot" className="mb-1 block text-xs font-semibold text-[#475569]">Час знімка (необов’язково)</label>
                <input id="import-snapshot" name="snapshotAt" type="datetime-local" className={inputClasses} aria-describedby="import-snapshot-hint" />
                <p id="import-snapshot-hint" className="mt-1 text-xs text-[#64748b]">Якщо порожньо, буде використано поточний час.</p>
              </div>
            )}
          </div>

          {problem && <Notice tone="danger">{problem}</Notice>}
          <button type="submit" className={buttonClasses.primary} disabled={busy || pharmacyId === undefined}>
            <Icon name="upload" size={16} />{busy ? "Завантаження…" : "Завантажити"}
          </button>
        </form>
      </Card>

      {result && (
        <Card title="Результат імпорту" action={<StatusBadge status={result.status} />}>
          {result.status === "REJECTED" && (
            <div className="px-4 pt-4"><Notice tone="danger">Файл відхилено, дані не змінено. Виправте помилки й завантажте його знову.</Notice></div>
          )}
          {result.status === "APPLIED" && (
            <div className="px-4 pt-4"><Notice tone="success">Дані застосовано.</Notice></div>
          )}
          <Summary detail={result} />
        </Card>
      )}

      <Card title="Історія імпортів">
        <ResourceGate resource={history} errorText="Не вдалося завантажити історію імпортів.">
          {() => rows.length === 0
            ? <EmptyState title="Імпортів ще не було" hint="Завантажте перший файл вище" />
            : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#e2e8e5] text-left text-xs text-[#64748b]">
                        <th scope="col" className="px-4 py-2 font-medium">Дата</th>
                        <th scope="col" className="px-2 py-2 font-medium">Тип</th>
                        <th scope="col" className="px-2 py-2 font-medium">Файл</th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">Рядків</th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">Помилок</th>
                        <th scope="col" className="px-2 py-2 font-medium">Статус</th>
                        <th scope="col" className="px-4 py-2"><span className="sr-only">Деталі</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(row => (
                        <tr key={row.importId} className="border-b border-[#e2e8e5] last:border-0">
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums text-[#475569]">{formatDateTime(row.uploadedAt)}</td>
                          <td className="px-2 py-3">{importKinds[row.dataType]}</td>
                          <td className="break-all px-2 py-3">{row.fileName}</td>
                          <td className="px-2 py-3 text-right tabular-nums">{formatNumber(row.recordsTotal)}</td>
                          <td className="px-2 py-3 text-right tabular-nums">{formatNumber(row.recordsRejected)}</td>
                          <td className="px-2 py-3"><StatusBadge status={row.status} /></td>
                          <td className="px-4 py-3 text-right">
                            <button type="button" className={buttonClasses.secondary} onClick={() => setSelected(row.importId)}>Деталі</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {cursor !== null && (
                  <div className="border-t border-[#e2e8e5] px-4 py-3">
                    <button type="button" className={buttonClasses.secondary} onClick={showMore} disabled={loadingMore}>
                      {loadingMore ? "Завантаження…" : "Показати ще"}
                    </button>
                  </div>
                )}
              </>
            )}
        </ResourceGate>
      </Card>

      {selected !== null && <DetailPanel id={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
