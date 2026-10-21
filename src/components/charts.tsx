"use client";
import { useState } from "react";

interface Datum {
  label: string;
  value: number | null;
  sub?: string;
}

const W = 320;

/** Single-series bar chart with optional target band. Tap/hover a bar for its value. */
export function BarChart({ data, height = 120, target, unit = "", ariaLabel }: { data: Datum[]; height?: number; target?: [number, number]; unit?: string; ariaLabel: string }) {
  const [sel, setSel] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value ?? 0), target?.[1] ?? 0) * 1.1;
  const padB = 18;
  const ih = height - padB - 14;
  const bw = W / data.length;
  const y = (v: number) => 14 + ih - (v / max) * ih;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label={ariaLabel}>
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--line)" />
        {target && target[1] > 0 && (
          <g>
            <rect x={0} width={W} y={y(target[1])} height={Math.max(1, y(target[0]) - y(target[1]))} fill="var(--accent)" opacity={0.08} />
            <text x={W - 2} y={y(target[1]) - 3} textAnchor="end" fontSize="9" fill="var(--faint)">
              目标 {target[0]}–{target[1]}
            </text>
          </g>
        )}
        {data.map((d, i) => {
          const v = d.value ?? 0;
          const x = i * bw + bw * 0.2;
          const w = bw * 0.6;
          const top = y(v);
          return (
            <g key={i} onPointerEnter={() => setSel(i)} onPointerLeave={() => setSel(null)} onClick={() => setSel(sel === i ? null : i)}>
              <rect x={i * bw} y={0} width={bw} height={height} fill="transparent" />
              {v > 0 && <path d={roundedTop(x, top, w, y(0) - top, 3)} fill="var(--accent)" opacity={sel == null || sel === i ? 0.9 : 0.4} />}
              {(i % Math.ceil(data.length / 8) === 0 || i === data.length - 1) && (
                <text x={i * bw + bw / 2} y={height - 4} textAnchor="middle" fontSize="9" fill="var(--faint)">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
        {sel != null && <Tip x={sel * bw + bw / 2} y={y(data[sel].value ?? 0)} text={`${data[sel].label}：${fmt(data[sel].value)}${unit}${data[sel].sub ? ` ${data[sel].sub}` : ""}`} />}
      </svg>
    </figure>
  );
}

export function LineChart({ data, height = 140, unit = "", ariaLabel }: { data: Datum[]; height?: number; unit?: string; ariaLabel: string }) {
  const [sel, setSel] = useState<number | null>(null);
  const vals = data.map((d) => d.value).filter((v): v is number => v != null);
  if (!vals.length) return <div className="text-sm text-faint py-6 text-center">还没有数据</div>;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo) * 0.15 || Math.max(1, hi * 0.05);
  const min = lo - pad;
  const max = hi + pad;
  const padL = 30;
  const padB = 18;
  const ih = height - padB - 12;
  const iw = W - padL - 8;
  const x = (i: number) => padL + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v: number) => 12 + ih - ((v - min) / (max - min)) * ih;
  const pts = data.map((d, i) => (d.value == null ? null : [x(i), y(d.value)] as const));
  const path = pts.reduce((acc, p) => (p ? acc + `${acc ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}` : acc), "");
  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="w-full touch-pan-y"
        role="img"
        aria-label={ariaLabel}
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          let best = 0;
          for (let i = 1; i < data.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
          setSel(best);
        }}
        onPointerLeave={() => setSel(null)}
      >
        {[min + pad, (min + max) / 2, max - pad].map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={W - 8} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray="2 3" />
            <text x={padL - 4} y={y(v) + 3} textAnchor="end" fontSize="9" fill="var(--faint)">
              {fmt(v)}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r={sel === i ? 4.5 : 3} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />)}
        {data.map(
          (d, i) =>
            (i === 0 || i === data.length - 1 || (data.length > 4 && i === Math.floor(data.length / 2))) && (
              <text key={i} x={x(i)} y={height - 4} textAnchor="middle" fontSize="9" fill="var(--faint)">
                {d.label}
              </text>
            ),
        )}
        {sel != null && data[sel].value != null && (
          <>
            <line x1={x(sel)} x2={x(sel)} y1={12} y2={12 + ih} stroke="var(--faint)" strokeDasharray="2 2" />
            <Tip x={x(sel)} y={y(data[sel].value!)} text={`${data[sel].label}：${fmt(data[sel].value)}${unit}${data[sel].sub ? ` · ${data[sel].sub}` : ""}`} />
          </>
        )}
      </svg>
    </figure>
  );
}

function Tip({ x, y, text }: { x: number; y: number; text: string }) {
  const w = Math.min(220, text.length * 7 + 14);
  const tx = Math.max(2, Math.min(W - w - 2, x - w / 2));
  const ty = Math.max(0, y - 30);
  return (
    <g pointerEvents="none">
      <rect x={tx} y={ty} width={w} height={20} rx={6} fill="var(--text)" opacity={0.92} />
      <text x={tx + w / 2} y={ty + 14} textAnchor="middle" fontSize="10.5" fill="var(--surface)">
        {text}
      </text>
    </g>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h);
  return `M${x} ${y + h}V${y + rr}Q${x} ${y} ${x + rr} ${y}H${x + w - rr}Q${x + w} ${y} ${x + w} ${y + rr}V${y + h}Z`;
}

function fmt(v: number | null | undefined) {
  if (v == null) return "—";
  return Math.abs(v) >= 100 ? Math.round(v).toString() : (Math.round(v * 10) / 10).toString();
}
