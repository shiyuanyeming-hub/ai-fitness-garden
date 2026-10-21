/**
 * Equipment *types* (the catalog). A physical machine in a specific gym is a GymEquipment row
 * that points to one of these. Exercises link to equipment types many-to-many via
 * Exercise.equipmentTypes (built-in) and the equipmentExercises table (user custom mappings).
 */
export interface EquipmentType {
  id: string;
  name: string;
  nameJa: string;
  nameEn: string;
  category: "machine" | "cable" | "free_weight" | "rack" | "bodyweight" | "accessory";
  isMultifunctional: boolean;
  /** visual cues given to the vision model */
  cues: string;
}

export const EQUIPMENT_TYPES: EquipmentType[] = [
  { id: "functional_trainer", name: "双滑轮功能训练器", nameJa: "ファンクショナルトレーナー", nameEn: "Functional trainer / dual cable", category: "cable", isMultifunctional: true, cues: "two tall towers each with an adjustable-height pulley and its own weight stack; often a pull-up bar between; also cable crossover stations" },
  { id: "single_cable", name: "单滑轮绳索站", nameJa: "ケーブルマシン（シングル）", nameEn: "Single cable station", category: "cable", isMultifunctional: true, cues: "one column with adjustable pulley and a weight stack" },
  { id: "lat_pulldown", name: "高位下拉机", nameJa: "ラットプルダウン", nameEn: "Lat pulldown machine", category: "cable", isMultifunctional: false, cues: "seat with thigh pads, long bar hanging from an overhead pulley, weight stack" },
  { id: "seated_cable_row", name: "坐姿绳索划船机", nameJa: "シーテッドケーブルロー", nameEn: "Seated cable row", category: "cable", isMultifunctional: false, cues: "low bench/seat with footplate and a low pulley in front, V-handle" },
  { id: "row_machine", name: "器械划船机（胸托）", nameJa: "ローイングマシン", nameEn: "Plate/selectorized row machine", category: "machine", isMultifunctional: false, cues: "seat with chest pad, handles you pull toward torso, lever arms" },
  { id: "chest_press_machine", name: "坐姿推胸机", nameJa: "チェストプレス", nameEn: "Chest press machine", category: "machine", isMultifunctional: false, cues: "upright seat with back pad, two handles at chest height pushed forward" },
  { id: "pec_deck", name: "蝴蝶机（夹胸/反向飞鸟）", nameJa: "ペックフライ / リアデルト", nameEn: "Pec deck / rear delt fly", category: "machine", isMultifunctional: true, cues: "seat with two arms that swing in an arc; pads or handles; often labeled pec fly / rear delt" },
  { id: "shoulder_press_machine", name: "器械推肩机", nameJa: "ショルダープレス", nameEn: "Shoulder press machine", category: "machine", isMultifunctional: false, cues: "seat with handles at shoulder height pressed overhead" },
  { id: "lateral_raise_machine", name: "器械侧平举机", nameJa: "ラテラルレイズマシン", nameEn: "Lateral raise machine", category: "machine", isMultifunctional: false, cues: "seat with pads on the side of upper arms, arms raise sideways" },
  { id: "assisted_pullup", name: "辅助引体/臂屈伸机", nameJa: "アシストチンディップ", nameEn: "Assisted pull-up / dip machine", category: "machine", isMultifunctional: true, cues: "kneeling pad or foot platform that pushes up, high handles and dip handles, weight stack provides assistance" },
  { id: "pullup_bar", name: "引体向上杆", nameJa: "懸垂バー", nameEn: "Pull-up bar", category: "bodyweight", isMultifunctional: true, cues: "fixed horizontal bar overhead" },
  { id: "dip_station", name: "双杠/举腿架", nameJa: "ディップス / レッグレイズスタンド", nameEn: "Dip station / captain's chair", category: "bodyweight", isMultifunctional: true, cues: "parallel bars with back pad and arm rests" },
  { id: "ab_crunch_machine", name: "卷腹机", nameJa: "アブドミナルクランチ", nameEn: "Ab crunch machine", category: "machine", isMultifunctional: false, cues: "seat with chest pad or overhead handles, flexes trunk forward" },
  { id: "torso_rotation", name: "躯干旋转机", nameJa: "トーソローテーション", nameEn: "Torso rotation machine", category: "machine", isMultifunctional: false, cues: "seat with rotating chest pad and thigh pads, rotates torso left/right" },
  { id: "back_extension_bench", name: "罗马椅/背部伸展椅", nameJa: "バックエクステンション", nameEn: "Back extension bench", category: "bodyweight", isMultifunctional: false, cues: "45° or horizontal bench with hip pad and ankle rollers" },
  { id: "barbell_bench", name: "杠铃卧推凳", nameJa: "ベンチプレス台", nameEn: "Flat bench press station", category: "rack", isMultifunctional: false, cues: "flat bench with uprights holding a barbell" },
  { id: "incline_bench_rack", name: "上斜卧推凳", nameJa: "インクラインベンチプレス台", nameEn: "Incline bench press station", category: "rack", isMultifunctional: false, cues: "inclined bench with barbell uprights" },
  { id: "power_rack", name: "深蹲架/力量架", nameJa: "パワーラック", nameEn: "Power rack / squat rack", category: "rack", isMultifunctional: true, cues: "four-post cage or half rack with J-hooks and safety bars" },
  { id: "smith_machine", name: "史密斯机", nameJa: "スミスマシン", nameEn: "Smith machine", category: "rack", isMultifunctional: true, cues: "barbell fixed on vertical rails, hooks to rack the bar" },
  { id: "dumbbells", name: "哑铃（含训练凳）", nameJa: "ダンベル", nameEn: "Dumbbells (with bench)", category: "free_weight", isMultifunctional: true, cues: "dumbbell rack with pairs of dumbbells" },
  { id: "barbell", name: "杠铃（自由重量）", nameJa: "バーベル", nameEn: "Barbell", category: "free_weight", isMultifunctional: true, cues: "olympic barbell with plates" },
  { id: "ez_bar", name: "EZ曲杆", nameJa: "EZバー", nameEn: "EZ curl bar", category: "free_weight", isMultifunctional: true, cues: "short zig-zag curl bar" },
  { id: "preacher_curl", name: "牧师凳/弯举机", nameJa: "プリーチャーカール", nameEn: "Preacher curl bench / machine", category: "machine", isMultifunctional: false, cues: "angled arm pad for curls" },
  { id: "leg_press", name: "腿举机", nameJa: "レッグプレス", nameEn: "Leg press", category: "machine", isMultifunctional: false, cues: "reclined seat with large foot platform" },
  { id: "leg_extension", name: "腿屈伸机", nameJa: "レッグエクステンション", nameEn: "Leg extension", category: "machine", isMultifunctional: false, cues: "seat with shin roller pad in front of the ankles" },
  { id: "leg_curl", name: "腿弯举机", nameJa: "レッグカール", nameEn: "Leg curl", category: "machine", isMultifunctional: false, cues: "seated or lying machine with roller pad behind the ankles" },
  { id: "calf_raise_machine", name: "提踵机", nameJa: "カーフレイズ", nameEn: "Calf raise machine", category: "machine", isMultifunctional: false, cues: "shoulder pads or seated knee pad with a small step for the forefoot" },
  { id: "resistance_band", name: "弹力带", nameJa: "トレーニングチューブ", nameEn: "Resistance band", category: "accessory", isMultifunctional: true, cues: "elastic band or tube" },
  { id: "mat", name: "垫子/地面", nameJa: "マット", nameEn: "Mat / floor area", category: "bodyweight", isMultifunctional: true, cues: "exercise mat or stretching area" },
];

export const EQUIPMENT_BY_ID: Record<string, EquipmentType> = Object.fromEntries(EQUIPMENT_TYPES.map((e) => [e.id, e]));
