"use client";

import { useCallback, useState, type FormEvent } from "react";
import { useResource } from "@/lib/head/use-resource";
import { formatNumber } from "@/lib/head/format";
import { exportUrl, loadPharmacies, loadSummary, loadTimeline } from "@/lib/manager/api";
import { isoDay } from "@/lib/manager/format";
import { Icon } from "@/components/ui/icon";
import { buttonClasses, Card, inputClasses, Kpi, Notice, PageHeader, ProgressBar, ResourceGate } from "@/components/head/ui";
import { BarChart, LineChart } from "./charts";

type Range = { from: string; to: string; pharmacyId?: number };

const presets = [{ days: 7, label: "7 днів" }, { days: 30, label: "30 днів" }, { days: 90, label: "90 днів" }];

function dayLabel(day: string) {
  return day.slice(8, 10) + "." + day.slice(5, 7);
}

function Timeline({ range }: { range: Range }) {
  const load = useCallback(() => loadTimeline(range.from, range.to, range.pharmacyId), [range]);
  const timeline = useResource(load);
  return (
    <ResourceGate resource={timeline} errorText="Не вдалося завантажити динаміку.">
      {({ points }) => {
        const labels = points.map(point => dayLabel(point.day));
        return (
          <div className="space-y-4 border-t border-[#e2e8e5] p-4">
            <div>
              <h2 className="mb-1 text-base font-semibold">Ризики та надлишки за днями</h2>
              <LineChart label="Позиції з ризиком дефіциту та надлишком за днями" labels={labels} series={[
                { name: "Ризик дефіциту", color: "#b91c1c", values: points.map(point => point.shortageRisks) },
                { name: "Надлишок", color: "#0369a1", values: points.map(point => point.surplusPositions) },
              ]} />
            </div>
            <div>
              <h2 className="mb-1 text-base font-semibold">Переміщено одиниць за днями</h2>
              <BarChart label="Переміщені одиниці за днями" labels={labels}
                series={{ name: "Переміщено", color: "#0f766e", values: points.map(point => point.movedUnits) }} />
            </div>
            <div>
              <h2 className="mb-1 text-base font-semibold">Завершені рейси за днями</h2>
              <BarChart label="Завершені рейси за днями" labels={labels} height={160}
                series={{ name: "Завершено", color: "#2563eb", values: points.map(point => point.completed) }} />
            </div>
          </div>
        );
      }}
    </ResourceGate>
  );
}

function Summary({ range }: { range: Range }) {
  const load = useCallback(() => loadSummary(range.from, range.to, range.pharmacyId), [range]);
  const summary = useResource(load);
  return (
    <ResourceGate resource={summary} errorText="Не вдалося побудувати звіт. Перевірте період (не більше 366 днів).">
      {({ totals }) => {
        const base = Math.max(totals.recommendations, 1);
        const stages = [
          { label: "Сформовано рекомендацій", value: totals.recommendations },
          { label: "Підтверджено", value: totals.confirmed },
          { label: "Розпочато переміщень", value: totals.dispatched },
          { label: "Завершено", value: totals.completed },
        ];
        return (
          <>
            <div className="grid gap-3 p-4 sm:grid-cols-3">
              <Kpi label="Ризики дефіциту" icon="alert" tone="danger" value={formatNumber(totals.shortageRisks)} />
              <Kpi label="Позиції з надлишком" icon="box" tone="info" value={formatNumber(totals.surplusPositions)} />
              <Kpi label="Переміщено одиниць" icon="truck" tone="success" value={formatNumber(totals.movedUnits)} />
            </div>
            <div className="space-y-3 border-t border-[#e2e8e5] p-4">
              <h2 className="text-base font-semibold">Воронка перерозподілу</h2>
              {stages.map(stage => (
                <div key={stage.label}>
                  <div className="mb-1 flex justify-between text-sm"><span>{stage.label}</span><b className="tabular-nums">{formatNumber(stage.value)}</b></div>
                  <ProgressBar value={(stage.value / base) * 100} tone="success" />
                </div>
              ))}
            </div>
            <Timeline range={range} />
            <div className="flex flex-wrap gap-2 border-t border-[#e2e8e5] p-4">
              <a className={buttonClasses.secondary} href={exportUrl(range.from, range.to, "csv", range.pharmacyId)} download>
                <Icon name="file" size={14} />Експорт CSV
              </a>
              <a className={buttonClasses.secondary} href={exportUrl(range.from, range.to, "xlsx", range.pharmacyId)} download>
                <Icon name="file" size={14} />Експорт XLSX
              </a>
            </div>
          </>
        );
      }}
    </ResourceGate>
  );
}

export function Analytics() {
  const pharmacies = useResource(loadPharmacies);
  const [range, setRange] = useState<Range | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pharmacy, setPharmacy] = useState("all");
  const [problem, setProblem] = useState("");

  function preset(days: number) {
    setFrom(isoDay(-days));
    setTo(isoDay());
    setProblem("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!from || !to) {
      setProblem("Вкажіть початок і кінець періоду.");
      return;
    }
    if (from > to) {
      setProblem("Початок періоду має бути не пізніше за кінець.");
      return;
    }
    if (Date.parse(to) - Date.parse(from) > 365 * 86_400_000) {
      setProblem("Період не може перевищувати 366 днів.");
      return;
    }
    setProblem("");
    setRange({ from, to, pharmacyId: pharmacy === "all" ? undefined : Number(pharmacy) });
  }

  return (
    <>
      <PageHeader title="Аналітика та звіти" subtitle="Підсумки по мережі або окремій аптеці за обраний період" />
      <Card>
        <form className="space-y-3 p-4" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="report-from" className="mb-1 block text-xs font-semibold text-[#475569]">Від</label>
              <input id="report-from" type="date" className={inputClasses} value={from} onChange={event => setFrom(event.target.value)} />
            </div>
            <div>
              <label htmlFor="report-to" className="mb-1 block text-xs font-semibold text-[#475569]">До (включно)</label>
              <input id="report-to" type="date" className={inputClasses} value={to} onChange={event => setTo(event.target.value)} />
            </div>
            <div>
              <label htmlFor="report-pharmacy" className="mb-1 block text-xs font-semibold text-[#475569]">Аптека</label>
              <select id="report-pharmacy" className={inputClasses} value={pharmacy} onChange={event => setPharmacy(event.target.value)}>
                <option value="all">Уся мережа</option>
                {(pharmacies.data ?? []).map(item => <option key={item.pharmacyId} value={item.pharmacyId}>{item.name} · {item.city}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {presets.map(item => (
              <button key={item.days} type="button" className={buttonClasses.secondary} onClick={() => preset(item.days)}>{item.label}</button>
            ))}
            <button type="submit" className={buttonClasses.primary}><Icon name="chart" size={14} />Сформувати звіт</button>
          </div>
          {problem && <Notice tone="danger">{problem}</Notice>}
        </form>
        {range
          ? <Summary key={range.from + range.to + String(range.pharmacyId)} range={range} />
          : <p className="border-t border-[#e2e8e5] px-4 py-8 text-center text-sm text-[#64748b]">Оберіть період і сформуйте звіт.</p>}
      </Card>
    </>
  );
}
