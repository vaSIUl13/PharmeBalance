import type { ReactNode } from "react";

export type Series = { name: string; color: string; values: number[] };

const width = 640;
const left = 40;
const right = 12;
const top = 12;
const bottom = 28;

function niceMax(value: number) {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].map(factor => factor * magnitude).find(candidate => candidate * 4 >= value) ?? magnitude * 10;
  return step * 4;
}

function xLabels(labels: string[]) {
  if (labels.length <= 1) return labels.map((label, index) => ({ index, label }));
  const last = labels.length - 1;
  return [...new Set([0, Math.round(last / 2), last])].map(index => ({ index, label: labels[index] }));
}

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#475569]">
      {series.map(item => (
        <li key={item.name} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ backgroundColor: item.color }} />{item.name}
        </li>
      ))}
    </ul>
  );
}

function Frame({ label, labels, max, height, children }: {
  label: string; labels: string[]; max: number; height: number; children: (x: (index: number) => number, y: (value: number) => number) => ReactNode;
}) {
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const x = (index: number) => left + (labels.length <= 1 ? plotWidth / 2 : (plotWidth * index) / (labels.length - 1));
  const y = (value: number) => top + plotHeight - (value / max) * plotHeight;
  return (
    <svg role="img" aria-label={label} viewBox={"0 0 " + width + " " + height} className="h-auto w-full">
      {[0, 1, 2, 3, 4].map(step => {
        const value = (max / 4) * step;
        return (
          <g key={step}>
            <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="#e2e8e5" />
            <text x={left - 6} y={y(value) + 4} textAnchor="end" fontSize="11" fill="#64748b">{Math.round(value).toLocaleString("uk-UA")}</text>
          </g>
        );
      })}
      {xLabels(labels).map(item => (
        <text key={item.index} x={x(item.index)} y={height - 8} textAnchor={item.index === 0 ? "start" : item.index === labels.length - 1 ? "end" : "middle"}
          fontSize="11" fill="#64748b">{item.label}</text>
      ))}
      {children(x, y)}
    </svg>
  );
}

export function LineChart({ label, labels, series, height = 220 }: { label: string; labels: string[]; series: Series[]; height?: number }) {
  const max = niceMax(Math.max(0, ...series.flatMap(item => item.values)));
  return (
    <div className="space-y-2">
      <Legend series={series} />
      <Frame label={label} labels={labels} max={max} height={height}>
        {(x, y) => series.map(item => (
          <g key={item.name}>
            <polyline fill="none" stroke={item.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
              points={item.values.map((value, index) => x(index) + "," + y(value)).join(" ")} />
            {item.values.length <= 40 && item.values.map((value, index) => (
              <circle key={index} cx={x(index)} cy={y(value)} r="3" fill={item.color}>
                <title>{labels[index] + ": " + item.name + " — " + value.toLocaleString("uk-UA")}</title>
              </circle>
            ))}
          </g>
        ))}
      </Frame>
    </div>
  );
}

export function BarChart({ label, labels, series, height = 220 }: { label: string; labels: string[]; series: Series; height?: number }) {
  const max = niceMax(Math.max(0, ...series.values));
  const plotWidth = width - left - right;
  const slot = plotWidth / Math.max(labels.length, 1);
  const bar = Math.max(2, Math.min(24, slot * 0.7));
  return (
    <Frame label={label} labels={labels} max={max} height={height}>
      {(_, y) => series.values.map((value, index) => {
        const centre = left + slot * index + slot / 2;
        const barTop = y(value);
        return (
          <rect key={index} x={centre - bar / 2} y={barTop} width={bar} height={Math.max(0, y(0) - barTop)} rx="2" fill={series.color}>
            <title>{labels[index] + ": " + series.name + " — " + value.toLocaleString("uk-UA")}</title>
          </rect>
        );
      })}
    </Frame>
  );
}

export type Slice = { label: string; value: number; color: string };

export function DonutChart({ label, slices, centre }: { label: string; slices: Slice[]; centre: string }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg role="img" aria-label={label} viewBox="0 0 140 140" className="size-36 shrink-0">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#e2e8e5" strokeWidth="16" />
        {total > 0 && slices.filter(slice => slice.value > 0).map(slice => {
          const length = (slice.value / total) * circumference;
          const node = (
            <circle key={slice.label} cx="70" cy="70" r={radius} fill="none" stroke={slice.color} strokeWidth="16"
              strokeDasharray={length + " " + (circumference - length)} strokeDashoffset={-offset} transform="rotate(-90 70 70)">
              <title>{slice.label + ": " + slice.value.toLocaleString("uk-UA")}</title>
            </circle>
          );
          offset += length;
          return node;
        })}
        <text x="70" y="68" textAnchor="middle" fontSize="22" fontWeight="600" fill="#0f172a">{total.toLocaleString("uk-UA")}</text>
        <text x="70" y="86" textAnchor="middle" fontSize="10" fill="#64748b">{centre}</text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
        {slices.map(slice => (
          <li key={slice.label} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: slice.color }} />
            <span className="flex-1 truncate text-[#475569]">{slice.label}</span>
            <b className="tabular-nums">{slice.value.toLocaleString("uk-UA")}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
