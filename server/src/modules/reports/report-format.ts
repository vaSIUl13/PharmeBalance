import { Workbook } from 'exceljs';

export const metrics = {
  shortageRisks: 'Ризики дефіциту (позиція × день)',
  surplusPositions: 'Надлишки понад Max (позиція × день)',
  recommendations: 'Сформовані рекомендації',
  confirmed: 'Підтверджені переміщення',
  dispatched: 'Відправлені переміщення',
  completed: 'Завершені переміщення',
  movedUnits: 'Переміщені одиниці',
} as const;

export type Report = {
  period: { from: string; to: string; timeZone: string };
  pharmacyId: number | null;
  totals: Record<keyof typeof metrics, number>;
};

function table(report: Report): (string | number)[][] {
  return [
    ['Показник', 'Значення'],
    ['Від', report.period.from], ['До включно', report.period.to],
    ['Часовий пояс', report.period.timeZone], ['Аптека', report.pharmacyId ?? 'Уся мережа'],
    ...Object.entries(metrics).map(([key, label]) => [label, report.totals[key as keyof typeof metrics]]),
  ];
}

export function csvCell(value: string | number) {
  if (typeof value === 'number') return String(value);
  const safe = /^[\u0000-\u0020\uFEFF]*[=+\-@]|^[\t\r\n]/u.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}

export async function reportFile(report: Report, format: 'csv' | 'xlsx') {
  const rows = table(report);
  if (format === 'csv') return Buffer.from('\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n');
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('Звіт');
  sheet.getColumn(1).width = 42;
  sheet.getColumn(2).width = 23;
  // ExcelJS writes string cells as text. Formula cells require a formula object.
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
