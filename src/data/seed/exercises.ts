import type {
  Exercise,
  ExerciseKind,
  ExerciseMuscleMapping,
  LateralityMode,
  LateralityRule,
  MeasurementType,
  MovementPattern,
  ResistanceType,
} from "@/core/types";
import { MUSCLE_BY_ID } from "@/core/muscles";

/**
 * Built-in exercise library.
 *
 * Contribution coefficients are PRODUCT ESTIMATES used for set counting:
 *   primary = 1.0, secondary ≈ 0.5, stabilizer ≈ 0.25 (unless noted).
 * The 0.5 for indirect/secondary work follows the common "fractional set" convention used in
 * volume meta-analyses (e.g. Pelland et al. 2024). It is not a measurement of muscle activation.
 */

type M = [muscleId: string, contribution?: number, rule?: LateralityRule];

function map(role: ExerciseMuscleMapping["role"], items: M[], defaultContribution: number): ExerciseMuscleMapping[] {
  return items.map(([muscleId, contribution, rule]) => {
    const m = MUSCLE_BY_ID[muscleId];
    if (!m) throw new Error(`Unknown muscle ${muscleId}`);
    const lateralityRule: LateralityRule = rule ?? (m.supportsLaterality ? "same_side" : "center");
    return { muscleId, role, contribution: contribution ?? defaultContribution, lateralityRule };
  });
}

interface Def {
  id: string;
  name: string;
  ja?: string;
  en?: string;
  kind: ExerciseKind;
  pattern: MovementPattern;
  lat?: LateralityMode;
  res?: ResistanceType;
  meas?: MeasurementType;
  eq: string[];
  diff?: 1 | 2 | 3;
  p: M[];
  s?: M[];
  st?: M[];
  desc?: string;
}

const defs: Def[] = [
  // ---------------- Chest ----------------
  { id: "barbell_bench_press", name: "杠铃卧推", ja: "ベンチプレス", en: "Barbell bench press", kind: "compound", pattern: "horizontal_push", eq: ["barbell_bench", "power_rack"], diff: 2, p: [["pec_mid"]], s: [["pec_upper", 0.4], ["delt_front"], ["triceps"]] },
  { id: "incline_barbell_press", name: "上斜杠铃卧推", ja: "インクラインベンチプレス", en: "Incline barbell press", kind: "compound", pattern: "incline_push", eq: ["incline_bench_rack", "power_rack"], diff: 2, p: [["pec_upper"]], s: [["pec_mid", 0.4], ["delt_front", 0.6], ["triceps"]] },
  { id: "db_bench_press", name: "哑铃卧推", ja: "ダンベルベンチプレス", en: "Dumbbell bench press", kind: "compound", pattern: "horizontal_push", eq: ["dumbbells"], diff: 1, p: [["pec_mid"]], s: [["pec_upper", 0.4], ["delt_front"], ["triceps"]] },
  { id: "incline_db_press", name: "上斜哑铃卧推", ja: "インクラインダンベルプレス", en: "Incline dumbbell press", kind: "compound", pattern: "incline_push", eq: ["dumbbells"], diff: 1, p: [["pec_upper"]], s: [["pec_mid", 0.4], ["delt_front", 0.6], ["triceps"]] },
  { id: "machine_chest_press", name: "坐姿器械推胸", ja: "チェストプレス", en: "Machine chest press", kind: "compound", pattern: "horizontal_push", eq: ["chest_press_machine"], diff: 1, p: [["pec_mid"]], s: [["pec_upper", 0.4], ["delt_front"], ["triceps"]] },
  { id: "smith_bench_press", name: "史密斯卧推", ja: "スミスベンチプレス", en: "Smith machine bench press", kind: "compound", pattern: "horizontal_push", eq: ["smith_machine"], diff: 1, p: [["pec_mid"]], s: [["pec_upper", 0.4], ["delt_front"], ["triceps"]] },
  { id: "smith_incline_press", name: "史密斯上斜卧推", ja: "スミスインクラインプレス", en: "Smith incline press", kind: "compound", pattern: "incline_push", eq: ["smith_machine"], diff: 1, p: [["pec_upper"]], s: [["pec_mid", 0.4], ["delt_front", 0.6], ["triceps"]] },
  { id: "cable_fly", name: "绳索夹胸", ja: "ケーブルフライ", en: "Cable fly", kind: "isolation", pattern: "chest_fly", eq: ["functional_trainer"], diff: 1, p: [["pec_mid"]], s: [["pec_upper", 0.5], ["delt_front", 0.3]] },
  { id: "low_high_cable_fly", name: "低位绳索上斜夹胸", ja: "ロー・トゥ・ハイ ケーブルフライ", en: "Low-to-high cable fly", kind: "isolation", pattern: "chest_fly", eq: ["functional_trainer"], diff: 1, p: [["pec_upper"]], s: [["pec_mid", 0.5], ["delt_front", 0.4]] },
  { id: "pec_deck_fly", name: "蝴蝶机夹胸", ja: "ペックフライ", en: "Pec deck fly", kind: "isolation", pattern: "chest_fly", eq: ["pec_deck"], diff: 1, p: [["pec_mid"]], s: [["pec_upper", 0.5], ["delt_front", 0.3]] },
  { id: "db_fly", name: "哑铃飞鸟", ja: "ダンベルフライ", en: "Dumbbell fly", kind: "isolation", pattern: "chest_fly", eq: ["dumbbells"], diff: 2, p: [["pec_mid"]], s: [["pec_upper", 0.5], ["delt_front", 0.3]] },
  { id: "push_up", name: "俯卧撑", ja: "腕立て伏せ", en: "Push-up", kind: "compound", pattern: "horizontal_push", res: "bodyweight", meas: "reps_only", eq: [], diff: 1, p: [["pec_mid"]], s: [["delt_front"], ["triceps"], ["pec_upper", 0.4]], st: [["abs"], ["deep_core"]] },
  { id: "dips", name: "双杠臂屈伸", ja: "ディップス", en: "Dips", kind: "compound", pattern: "horizontal_push", res: "bodyweight", meas: "reps_only", eq: ["dip_station", "assisted_pullup"], diff: 3, p: [["pec_mid"], ["triceps", 0.8]], s: [["delt_front"]] },
  { id: "assisted_dip", name: "辅助臂屈伸", ja: "アシストディップス", en: "Assisted dip", kind: "compound", pattern: "horizontal_push", res: "assisted", eq: ["assisted_pullup"], diff: 1, p: [["pec_mid"], ["triceps", 0.8]], s: [["delt_front"]] },

  // ---------------- Back ----------------
  { id: "lat_pulldown", name: "高位下拉", ja: "ラットプルダウン", en: "Lat pulldown", kind: "compound", pattern: "vertical_pull", eq: ["lat_pulldown", "functional_trainer"], diff: 1, p: [["lats"]], s: [["biceps"], ["traps_mid", 0.4], ["rhomboids", 0.4], ["delt_rear", 0.3], ["forearms", 0.3]] },
  { id: "assisted_pullup", name: "辅助引体向上", ja: "アシストチンニング", en: "Assisted pull-up", kind: "compound", pattern: "vertical_pull", res: "assisted", eq: ["assisted_pullup"], diff: 1, p: [["lats"]], s: [["biceps"], ["traps_mid", 0.4], ["rhomboids", 0.4], ["delt_rear", 0.3], ["forearms", 0.4]] },
  { id: "pull_up", name: "引体向上", ja: "懸垂", en: "Pull-up", kind: "compound", pattern: "vertical_pull", res: "bodyweight", meas: "reps_only", eq: ["pullup_bar", "functional_trainer", "power_rack"], diff: 3, p: [["lats"]], s: [["biceps"], ["traps_mid", 0.4], ["rhomboids", 0.4], ["delt_rear", 0.3], ["forearms", 0.4]] },
  { id: "seated_cable_row", name: "坐姿绳索划船", ja: "シーテッドロー", en: "Seated cable row", kind: "compound", pattern: "horizontal_pull", eq: ["seated_cable_row", "functional_trainer", "single_cable"], diff: 1, p: [["lats", 0.8], ["traps_mid"], ["rhomboids"]], s: [["biceps"], ["delt_rear"], ["forearms", 0.3]], st: [["erectors"]] },
  { id: "machine_row", name: "器械划船", ja: "マシンロー", en: "Machine row", kind: "compound", pattern: "horizontal_pull", eq: ["row_machine"], diff: 1, p: [["lats", 0.8], ["traps_mid"], ["rhomboids"]], s: [["biceps"], ["delt_rear"], ["forearms", 0.3]] },
  { id: "one_arm_db_row", name: "单臂哑铃划船", ja: "ワンハンドダンベルロー", en: "One-arm dumbbell row", kind: "compound", pattern: "horizontal_pull", lat: "unilateral", eq: ["dumbbells"], diff: 1, p: [["lats"], ["traps_mid", 0.8], ["rhomboids", 0.8]], s: [["biceps"], ["delt_rear"], ["forearms", 0.3]], st: [["deep_core"], ["obliques"]] },
  { id: "single_arm_cable_row", name: "单臂绳索划船", ja: "ワンアームケーブルロー", en: "Single-arm cable row", kind: "compound", pattern: "horizontal_pull", lat: "unilateral", eq: ["functional_trainer", "single_cable"], diff: 1, p: [["lats"], ["traps_mid", 0.8], ["rhomboids", 0.8]], s: [["biceps"], ["delt_rear"]], st: [["deep_core"], ["obliques"]] },
  { id: "barbell_row", name: "杠铃俯身划船", ja: "ベントオーバーロー", en: "Barbell bent-over row", kind: "compound", pattern: "horizontal_pull", eq: ["barbell", "power_rack"], diff: 3, p: [["lats", 0.8], ["traps_mid"], ["rhomboids"]], s: [["biceps"], ["delt_rear"], ["erectors", 0.4], ["forearms", 0.3]] },
  { id: "straight_arm_pulldown", name: "直臂下压", ja: "ストレートアームプルダウン", en: "Straight-arm pulldown", kind: "isolation", pattern: "vertical_pull", eq: ["functional_trainer", "single_cable", "lat_pulldown"], diff: 1, p: [["lats"]], s: [["triceps", 0.2]], st: [["abs"]] },
  { id: "back_extension", name: "山羊挺身", ja: "バックエクステンション", en: "Back extension", kind: "compound", pattern: "back_extension", res: "bodyweight", meas: "reps_only", eq: ["back_extension_bench"], diff: 1, p: [["erectors"]], s: [["glutes"], ["hamstrings"]] },
  { id: "db_shrug", name: "哑铃耸肩", ja: "ダンベルシュラッグ", en: "Dumbbell shrug", kind: "isolation", pattern: "shrug", eq: ["dumbbells"], diff: 1, p: [["traps_upper"]], s: [["forearms", 0.3]] },
  { id: "face_pull", name: "绳索面拉", ja: "フェイスプル", en: "Face pull", kind: "isolation", pattern: "rear_delt", eq: ["functional_trainer", "single_cable"], diff: 1, p: [["delt_rear"], ["traps_mid", 0.8]], s: [["rhomboids"]] },

  // ---------------- Shoulders ----------------
  { id: "db_shoulder_press", name: "哑铃推举", ja: "ダンベルショルダープレス", en: "Dumbbell shoulder press", kind: "compound", pattern: "vertical_push", eq: ["dumbbells"], diff: 1, p: [["delt_front"]], s: [["delt_side", 0.4], ["triceps"], ["traps_upper", 0.25]] },
  { id: "machine_shoulder_press", name: "器械推肩", ja: "マシンショルダープレス", en: "Machine shoulder press", kind: "compound", pattern: "vertical_push", eq: ["shoulder_press_machine"], diff: 1, p: [["delt_front"]], s: [["delt_side", 0.4], ["triceps"]] },
  { id: "smith_shoulder_press", name: "史密斯推肩", ja: "スミスショルダープレス", en: "Smith shoulder press", kind: "compound", pattern: "vertical_push", eq: ["smith_machine"], diff: 1, p: [["delt_front"]], s: [["delt_side", 0.4], ["triceps"]] },
  { id: "db_lateral_raise", name: "哑铃侧平举", ja: "ダンベルサイドレイズ", en: "Dumbbell lateral raise", kind: "isolation", pattern: "lateral_raise", eq: ["dumbbells"], diff: 1, p: [["delt_side"]], s: [["traps_upper", 0.25]] },
  { id: "cable_lateral_raise_single", name: "单臂绳索侧平举", ja: "ワンアームケーブルサイドレイズ", en: "Single-arm cable lateral raise", kind: "isolation", pattern: "lateral_raise", lat: "unilateral", eq: ["functional_trainer", "single_cable"], diff: 1, p: [["delt_side"]], s: [["traps_upper", 0.25]] },
  { id: "machine_lateral_raise", name: "器械侧平举", ja: "マシンサイドレイズ", en: "Machine lateral raise", kind: "isolation", pattern: "lateral_raise", eq: ["lateral_raise_machine"], diff: 1, p: [["delt_side"]], s: [["traps_upper", 0.25]] },
  { id: "cable_front_raise", name: "绳索前平举", ja: "ケーブルフロントレイズ", en: "Cable front raise", kind: "isolation", pattern: "front_raise", eq: ["functional_trainer", "single_cable"], diff: 1, p: [["delt_front"]], s: [["pec_upper", 0.25]] },
  { id: "reverse_pec_deck", name: "反向飞鸟（蝴蝶机）", ja: "リアデルトフライ", en: "Reverse pec deck", kind: "isolation", pattern: "rear_delt", eq: ["pec_deck"], diff: 1, p: [["delt_rear"]], s: [["traps_mid", 0.4], ["rhomboids", 0.4]] },
  { id: "db_rear_delt_fly", name: "俯身哑铃飞鸟", ja: "ダンベルリアレイズ", en: "Bent-over dumbbell rear delt fly", kind: "isolation", pattern: "rear_delt", eq: ["dumbbells"], diff: 1, p: [["delt_rear"]], s: [["traps_mid", 0.4], ["rhomboids", 0.4]] },
  { id: "cable_rear_delt_fly", name: "绳索反向飞鸟", ja: "ケーブルリアデルトフライ", en: "Cable rear delt fly", kind: "isolation", pattern: "rear_delt", eq: ["functional_trainer"], diff: 1, p: [["delt_rear"]], s: [["traps_mid", 0.4], ["rhomboids", 0.4]] },
  { id: "band_pull_apart", name: "弹力带拉开", ja: "バンドプルアパート", en: "Band pull-apart", kind: "isolation", pattern: "rear_delt", res: "band", eq: ["resistance_band"], diff: 1, p: [["delt_rear"]], s: [["traps_mid", 0.4], ["rhomboids", 0.4]] },

  // ---------------- Arms ----------------
  { id: "cable_pushdown", name: "绳索下压", ja: "ケーブルプッシュダウン", en: "Cable triceps pushdown", kind: "isolation", pattern: "elbow_extension", eq: ["functional_trainer", "single_cable", "lat_pulldown"], diff: 1, p: [["triceps"]] },
  { id: "single_arm_pushdown", name: "单臂绳索下压", ja: "ワンアームプッシュダウン", en: "Single-arm pushdown", kind: "isolation", pattern: "elbow_extension", lat: "unilateral", eq: ["functional_trainer", "single_cable"], diff: 1, p: [["triceps"]] },
  { id: "overhead_cable_extension", name: "绳索过顶臂屈伸", ja: "オーバーヘッドケーブルエクステンション", en: "Overhead cable extension", kind: "isolation", pattern: "elbow_extension", eq: ["functional_trainer", "single_cable"], diff: 1, p: [["triceps"]] },
  { id: "db_curl", name: "哑铃弯举", ja: "ダンベルカール", en: "Dumbbell curl", kind: "isolation", pattern: "elbow_flexion", lat: "alternating", eq: ["dumbbells"], diff: 1, p: [["biceps"]], s: [["forearms", 0.3]] },
  { id: "hammer_curl", name: "锤式弯举", ja: "ハンマーカール", en: "Hammer curl", kind: "isolation", pattern: "elbow_flexion", lat: "alternating", eq: ["dumbbells"], diff: 1, p: [["biceps", 0.8]], s: [["forearms", 0.6]] },
  { id: "cable_curl", name: "绳索弯举", ja: "ケーブルカール", en: "Cable curl", kind: "isolation", pattern: "elbow_flexion", eq: ["functional_trainer", "single_cable"], diff: 1, p: [["biceps"]], s: [["forearms", 0.3]] },
  { id: "single_arm_cable_curl", name: "单臂绳索弯举", ja: "ワンアームケーブルカール", en: "Single-arm cable curl", kind: "isolation", pattern: "elbow_flexion", lat: "unilateral", eq: ["functional_trainer", "single_cable"], diff: 1, p: [["biceps"]], s: [["forearms", 0.3]] },
  { id: "barbell_curl", name: "杠铃弯举", ja: "バーベルカール", en: "Barbell curl", kind: "isolation", pattern: "elbow_flexion", eq: ["barbell", "ez_bar"], diff: 1, p: [["biceps"]], s: [["forearms", 0.3]] },
  { id: "preacher_curl", name: "牧师凳弯举", ja: "プリーチャーカール", en: "Preacher curl", kind: "isolation", pattern: "elbow_flexion", eq: ["preacher_curl"], diff: 1, p: [["biceps"]], s: [["forearms", 0.3]] },

  // ---------------- Core ----------------
  { id: "ab_crunch_machine", name: "器械卷腹", ja: "アブドミナルクランチ", en: "Ab crunch machine", kind: "core", pattern: "trunk_flexion", eq: ["ab_crunch_machine"], diff: 1, p: [["abs"]], s: [["obliques", 0.3]] },
  { id: "crunch", name: "卷腹", ja: "クランチ", en: "Crunch", kind: "core", pattern: "trunk_flexion", res: "bodyweight", meas: "reps_only", eq: [], diff: 1, p: [["abs"]], s: [["obliques", 0.3]] },
  { id: "cable_crunch", name: "绳索跪姿卷腹", ja: "ケーブルクランチ", en: "Cable crunch", kind: "core", pattern: "trunk_flexion", eq: ["functional_trainer", "single_cable", "lat_pulldown"], diff: 1, p: [["abs"]], s: [["obliques", 0.3]] },
  { id: "hanging_leg_raise", name: "悬垂/支撑举腿", ja: "レッグレイズ", en: "Hanging / captain's chair leg raise", kind: "core", pattern: "trunk_flexion", res: "bodyweight", meas: "reps_only", eq: ["dip_station", "pullup_bar", "assisted_pullup"], diff: 2, p: [["abs"]], s: [["deep_core", 0.5], ["obliques", 0.3]], st: [["forearms"]] },
  { id: "plank", name: "平板支撑", ja: "プランク", en: "Plank", kind: "core", pattern: "anti_extension", res: "bodyweight", meas: "duration", eq: [], diff: 1, p: [["deep_core"]], s: [["abs"]], st: [["delt_front"]] },
  { id: "torso_rotation_machine", name: "躯干旋转", ja: "トーソローテーション", en: "Torso rotation machine", kind: "core", pattern: "trunk_rotation", lat: "directional", eq: ["torso_rotation"], diff: 1, p: [["obliques", 1, "directional_uncertain"]], s: [["abs", 0.3, "directional_uncertain"]], st: [["deep_core", 0.25, "directional_uncertain"]],
    desc: "方向表示旋转方向，不代表只有同侧腹斜肌参与。系统只统计核心整体负荷。" },
  { id: "pallof_press", name: "Pallof 抗旋转推", ja: "パロフプレス", en: "Pallof press", kind: "core", pattern: "anti_rotation", lat: "directional", eq: ["functional_trainer", "single_cable", "resistance_band"], diff: 1, p: [["deep_core", 1, "directional_uncertain"], ["obliques", 0.8, "directional_uncertain"]], s: [["abs", 0.3, "directional_uncertain"]] },
  { id: "cable_woodchop", name: "绳索伐木", ja: "ケーブルウッドチョップ", en: "Cable woodchop", kind: "core", pattern: "trunk_rotation", lat: "directional", eq: ["functional_trainer", "single_cable"], diff: 2, p: [["obliques", 1, "directional_uncertain"]], s: [["abs", 0.3, "directional_uncertain"], ["deep_core", 0.4, "directional_uncertain"]] },

  // ---------------- Legs ----------------
  { id: "leg_press", name: "腿举", ja: "レッグプレス", en: "Leg press", kind: "compound", pattern: "squat", eq: ["leg_press"], diff: 1, p: [["quads"], ["glutes", 0.7]], s: [["hamstrings", 0.3]] },
  { id: "leg_extension", name: "腿屈伸", ja: "レッグエクステンション", en: "Leg extension", kind: "isolation", pattern: "knee_extension", eq: ["leg_extension"], diff: 1, p: [["quads"]] },
  { id: "leg_curl", name: "腿弯举", ja: "レッグカール", en: "Leg curl", kind: "isolation", pattern: "knee_flexion", eq: ["leg_curl"], diff: 1, p: [["hamstrings"]], s: [["calves", 0.2]] },
  { id: "goblet_squat", name: "高脚杯深蹲", ja: "ゴブレットスクワット", en: "Goblet squat", kind: "compound", pattern: "squat", eq: ["dumbbells"], diff: 1, p: [["quads"], ["glutes", 0.7]], s: [["hamstrings", 0.3]], st: [["erectors"], ["abs"]] },
  { id: "barbell_squat", name: "杠铃深蹲", ja: "バーベルスクワット", en: "Barbell back squat", kind: "compound", pattern: "squat", eq: ["power_rack", "smith_machine"], diff: 3, p: [["quads"], ["glutes", 0.8]], s: [["hamstrings", 0.3], ["erectors", 0.4]], st: [["abs"]] },
  { id: "romanian_deadlift", name: "罗马尼亚硬拉", ja: "ルーマニアンデッドリフト", en: "Romanian deadlift", kind: "compound", pattern: "hip_hinge", eq: ["barbell", "dumbbells"], diff: 2, p: [["hamstrings"], ["glutes", 0.8]], s: [["erectors", 0.5], ["forearms", 0.3]] },
  { id: "calf_raise", name: "提踵", ja: "カーフレイズ", en: "Calf raise", kind: "isolation", pattern: "calf_raise", eq: ["calf_raise_machine", "smith_machine", "leg_press"], diff: 1, p: [["calves"]] },
];

export const SEED_EXERCISE_VERSION = 1;

export const SEED_EXERCISES: Exercise[] = defs.map((d) => ({
  id: d.id,
  name: d.name,
  nameJa: d.ja,
  nameEn: d.en,
  description: d.desc,
  kind: d.kind,
  pattern: d.pattern,
  lateralityMode: d.lat ?? "bilateral",
  resistanceType: d.res ?? "external_load",
  measurementType: d.meas ?? "reps_weight",
  equipmentTypes: d.eq,
  difficulty: d.diff ?? 1,
  muscles: [...map("primary", d.p, 1), ...map("secondary", d.s ?? [], 0.5), ...map("stabilizer", d.st ?? [], 0.25)],
  isCustom: false,
}));

export const SEED_EXERCISE_BY_ID: Record<string, Exercise> = Object.fromEntries(SEED_EXERCISES.map((e) => [e.id, e]));
