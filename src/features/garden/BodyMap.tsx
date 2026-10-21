"use client";
import { useState } from "react";
import type { RecoveryEstimate, RecoveryStatus } from "@/core/recovery";
import { STATUS_LABEL } from "@/core/recovery";
import { MUSCLE_BY_ID } from "@/core/muscles";
import { STATUS_COLOR, Segmented } from "@/components/ui";
import type { MuscleSide } from "@/core/types";

type Shape = { m: string; d: string; center?: boolean; span?: boolean };

/**
 * Shapes are drawn for the IMAGE-LEFT half and mirrored. In the front view the image-left half is the
 * user's RIGHT side; in the back view it is the user's LEFT side.
 */
const FRONT: Shape[] = [
  { m: "delt_side", d: "M60 74c-8 2-12 9-12 19 0 5 2 9 4 12l8-6c-1-9 0-17 4-23z" },
  { m: "delt_front", d: "M64 72c-5 6-7 15-5 27l11 2c2-9 4-16 9-23-4-4-9-6-15-6z" },
  { m: "pec_upper", d: "M80 76c6-4 12-5 19-5v16H74c1-4 3-8 6-11z" },
  { m: "pec_mid", d: "M74 89h25v23c-8 3-16 2-22-3-3-5-4-12-3-20z" },
  { m: "biceps", d: "M52 106c-3 9-4 20-2 30l12 2c3-9 3-19 1-28z" },
  { m: "forearms", d: "M49 142c-3 12-4 25-3 36l9 1c3-12 5-24 6-35z" },
  { m: "abs", center: true, span: true, d: "M90 116h20c1 18 1 36-2 54h-16c-3-18-3-36-2-54z" },
  { m: "obliques", center: true, d: "M77 114c4 3 8 4 12 4-1 18 0 36 2 52-6-1-12-4-15-9-2-16-1-32 1-47z" },
  { m: "quads", d: "M77 186c7 2 15 3 21 3-1 22-2 44-6 64-6 2-11 1-15-2-3-22-3-44 0-65z" },
];

const BACK: Shape[] = [
  { m: "traps_upper", d: "M99 56v20c-8-1-16-2-24 0 6-9 14-16 24-20z" },
  { m: "delt_side", d: "M58 76c-7 3-10 10-10 18 0 4 1 8 3 11l8-6c-1-8 0-16 3-22z" },
  { m: "delt_rear", d: "M63 74c-4 7-5 15-4 25l12 1c1-7 3-14 6-20-4-4-9-6-14-6z" },
  { m: "traps_mid", d: "M80 78c6-1 13-1 19 0v40c-6-6-12-14-15-24-2-6-3-11-4-16z" },
  { m: "rhomboids", d: "M88 84h11v20c-4-2-8-6-10-11z" },
  { m: "lats", d: "M76 98c3 8 8 15 14 21 2 12 3 24 4 36-6 2-12 1-16-3-4-17-5-35-2-54z" },
  { m: "triceps", d: "M52 106c-3 9-4 20-2 30l12 2c3-9 3-19 1-28z" },
  { m: "forearms", d: "M49 142c-3 12-4 25-3 36l9 1c3-12 5-24 6-35z" },
  { m: "erectors", center: true, span: true, d: "M95 120h10c2 18 2 36 0 54h-10c-2-18-2-36 0-54z" },
  { m: "glutes", d: "M79 178c7-2 14-2 20 1v22c-7 3-15 2-21-3-2-7-1-14 1-20z" },
  { m: "hamstrings", d: "M78 205c7 3 14 4 20 3-1 18-3 34-6 48-6 1-10 0-14-3-2-16-2-32 0-48z" },
  { m: "calves", d: "M80 262c5 2 10 2 14 1 1 14 0 28-3 40-4 1-7 0-9-2-3-13-3-26-2-39z" },
];

const SILHOUETTE =
  "M100 14c11 0 19 8 19 19s-8 21-19 21-19-10-19-21 8-19 19-19zm-8 42h16l2 10c12 2 24 6 30 12 6 6 8 16 8 26l3 44 4 34-11 2-8-34-5-28-2 22c4 10 6 20 6 32 0 6-1 12-3 18l-1 58-3 58-12 1-6-56-8-48-8 48-6 56-12-1-3-58-1-58c-2-6-3-12-3-18 0-12 2-22 6-32l-2-22-5 28-8 34-11-2 4-34 3-44c0-10 2-20 8-26 6-6 18-10 30-12z";

function colorFor(e: RecoveryEstimate | undefined): string {
  if (!e || !e.lastTrainedAt) return e?.status === "attention" ? STATUS_COLOR.attention : STATUS_COLOR.fallow;
  return STATUS_COLOR[e.status];
}

export function BodyMap({
  recovery,
  onSelect,
  compact,
}: {
  recovery: RecoveryEstimate[];
  onSelect: (muscleId: string) => void;
  compact?: boolean;
}) {
  const [view, setView] = useState<"front" | "back">("front");
  const get = (m: string, side: MuscleSide) => recovery.find((r) => r.muscleId === m && r.side === side);
  const shapes = view === "front" ? FRONT : BACK;
  const imageLeftSide: MuscleSide = view === "front" ? "right" : "left";
  const imageRightSide: MuscleSide = view === "front" ? "left" : "right";

  const render = (s: Shape, mirrored: boolean) => {
    const muscle = MUSCLE_BY_ID[s.m];
    const side: MuscleSide = s.center || !muscle?.supportsLaterality ? "center" : mirrored ? imageRightSide : imageLeftSide;
    const e = get(s.m, side);
    const label = `${muscle?.name ?? s.m}${side === "left" ? "（左）" : side === "right" ? "（右）" : ""}：${e ? STATUS_LABEL[e.status] : "无数据"}`;
    return (
      <path
        key={`${s.m}-${mirrored ? "r" : "l"}`}
        d={s.d}
        transform={mirrored ? "translate(200 0) scale(-1 1)" : undefined}
        fill={colorFor(e)}
        fillOpacity={e?.lastTrainedAt ? 0.9 : 0.55}
        stroke="var(--surface)"
        strokeWidth={1.2}
        role="button"
        tabIndex={0}
        aria-label={label}
        className="cursor-pointer transition-[fill] duration-500 hover:brightness-110 outline-none"
        onClick={() => onSelect(s.m)}
        onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && onSelect(s.m)}
      >
        <title>{label}</title>
      </path>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <Segmented
          size="sm"
          className="w-40"
          value={view}
          onChange={setView}
          options={[
            { value: "front", label: "正面" },
            { value: "back", label: "背面" },
          ]}
        />
        <div className="text-[11px] text-faint">{view === "front" ? "画面左侧 = 你的右侧" : "画面左侧 = 你的左侧"}</div>
      </div>
      <svg viewBox="0 0 200 320" className={compact ? "w-full max-h-[300px]" : "w-full max-h-[440px]"} aria-label="肌肉恢复地图">
        <path d={SILHOUETTE} fill="var(--surface-3)" />
        {shapes.map((s) => render(s, false))}
        {shapes.filter((s) => !s.span).map((s) => render(s, true))}
      </svg>
      <Legend />
    </div>
  );
}

export function Legend() {
  const items: [RecoveryStatus | "fallow", string][] = [
    ["recovering", "恢复中"],
    ["gradual", "逐渐恢复"],
    ["ready", "预计可训练"],
    ["attention", "需要关注"],
    ["fallow", "近期未训练"],
  ];
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center text-[11px] text-muted mt-1">
      {items.map(([k, l]) => (
        <span key={k} className="inline-flex items-center gap-1">
          <span className="size-2.5 rounded-full" style={{ background: STATUS_COLOR[k] }} />
          {l}
        </span>
      ))}
    </div>
  );
}
