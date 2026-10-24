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
  category: "machine" | "cable" | "free_weight" | "rack" | "bodyweight" | "accessory" | "cardio";
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
  // ---- more strength equipment ----
  { id: "incline_chest_press_machine", name: "上斜推胸机", nameJa: "インクラインチェストプレス", nameEn: "Incline chest press machine", category: "machine", isMultifunctional: false, cues: "reclined seat, handles pushed forward and upward at an incline" },
  { id: "triceps_machine", name: "器械臂屈伸/三头机", nameJa: "トライセプスマシン / シーテッドディップ", nameEn: "Triceps extension / seated dip machine", category: "machine", isMultifunctional: false, cues: "seat with handles beside the hips pushed down, or arm pad with handles extended at the elbow" },
  { id: "t_bar_row", name: "T杠划船", nameJa: "Tバーロー", nameEn: "T-bar row", category: "machine", isMultifunctional: false, cues: "lever bar anchored at one end with plates and a V/T handle, often with chest pad and foot platform" },
  { id: "high_row_machine", name: "高位划船机（分动）", nameJa: "ハイロー", nameEn: "Iso-lateral high row", category: "machine", isMultifunctional: false, cues: "seat with knee pad, independent lever arms with handles above head pulled down and back" },
  { id: "hack_squat", name: "哈克深蹲机", nameJa: "ハックスクワット", nameEn: "Hack squat machine", category: "machine", isMultifunctional: false, cues: "inclined back pad with shoulder pads on a sled, angled foot platform" },
  { id: "hip_thrust_machine", name: "臀推机", nameJa: "ヒップスラストマシン", nameEn: "Hip thrust machine", category: "machine", isMultifunctional: false, cues: "low back pad and a hip belt or pad pressed upward" },
  { id: "hip_abductor", name: "髋外展/内收机", nameJa: "アブダクション / アダクション", nameEn: "Hip abductor / adductor", category: "machine", isMultifunctional: true, cues: "seat with thigh pads on the outside or inside of the knees, legs open/close" },
  { id: "glute_kickback_machine", name: "后踢腿/臀部训练机", nameJa: "グルートマシン", nameEn: "Glute kickback machine", category: "machine", isMultifunctional: false, cues: "standing or kneeling frame with a foot plate or roller pushed backward by one leg" },
  { id: "kettlebell", name: "壶铃", nameJa: "ケトルベル", nameEn: "Kettlebell", category: "free_weight", isMultifunctional: true, cues: "cast-iron ball with a handle" },
  { id: "landmine", name: "地雷管", nameJa: "ランドマイン", nameEn: "Landmine", category: "rack", isMultifunctional: true, cues: "barbell sleeve pivot attached to floor or rack, one end of a barbell inserted" },
  { id: "trx", name: "悬挂训练带（TRX）", nameJa: "サスペンショントレーナー", nameEn: "Suspension trainer (TRX)", category: "accessory", isMultifunctional: true, cues: "two adjustable straps with handles hanging from an anchor" },
  { id: "ab_wheel", name: "健腹轮", nameJa: "アブローラー", nameEn: "Ab wheel", category: "accessory", isMultifunctional: false, cues: "small wheel with handles on both sides" },
  { id: "situp_bench", name: "仰卧起坐板/腹肌板", nameJa: "腹筋台（シットアップベンチ）", nameEn: "Decline sit-up bench", category: "bodyweight", isMultifunctional: false, cues: "declined padded bench with foot rollers at the top end" },

  // ---- cardio equipment ----
  { id: "treadmill", name: "跑步机", nameJa: "トレッドミル", nameEn: "Treadmill", category: "cardio", isMultifunctional: false, cues: "moving belt with side rails and a console; may be curved" },
  { id: "spin_bike", name: "动感单车", nameJa: "スピンバイク", nameEn: "Spin bike / indoor cycle", category: "cardio", isMultifunctional: false, cues: "racing-style bike with narrow saddle, heavy front flywheel, resistance knob, drop handlebars" },
  { id: "upright_bike", name: "立式健身车", nameJa: "アップライトバイク", nameEn: "Upright exercise bike", category: "cardio", isMultifunctional: false, cues: "upright bike with wide saddle, enclosed flywheel and a console screen" },
  { id: "recumbent_bike", name: "卧式健身车", nameJa: "リカンベントバイク", nameEn: "Recumbent bike", category: "cardio", isMultifunctional: false, cues: "reclined chair seat with backrest, pedals in front" },
  { id: "elliptical", name: "椭圆机", nameJa: "クロストレーナー", nameEn: "Elliptical / cross trainer", category: "cardio", isMultifunctional: false, cues: "two foot pedals moving in an oval path, two moving arm poles, console" },
  { id: "rowing_ergometer", name: "划船机（有氧）", nameJa: "ローイングエルゴメーター", nameEn: "Rowing ergometer", category: "cardio", isMultifunctional: false, cues: "long rail on the floor with a sliding seat, foot straps, handle on a chain and a flywheel/fan or water tank" },
  { id: "stair_climber", name: "楼梯机/踏步机", nameJa: "ステアクライマー / ステッパー", nameEn: "Stair climber / stepper", category: "cardio", isMultifunctional: false, cues: "revolving staircase or two step pedals with handrails and console" },
  { id: "air_bike", name: "风阻单车", nameJa: "エアバイク", nameEn: "Air bike / fan bike", category: "cardio", isMultifunctional: false, cues: "bike with a large fan wheel in front and moving arm handles" },
  { id: "ski_erg", name: "滑雪机", nameJa: "スキーエルゴ", nameEn: "Ski ergometer", category: "cardio", isMultifunctional: false, cues: "tall upright column with a fan at the top and two handles pulled down" },
  { id: "battle_rope", name: "战绳", nameJa: "バトルロープ", nameEn: "Battle rope", category: "cardio", isMultifunctional: false, cues: "thick heavy rope anchored at the middle" },
];

export const CARDIO_EQUIPMENT_IDS = new Set(EQUIPMENT_TYPES.filter((e) => e.category === "cardio").map((e) => e.id));

export const CATEGORY_LABEL: Record<EquipmentType["category"], string> = {
  machine: "力量器械",
  cable: "绳索/滑轮",
  free_weight: "自由重量",
  rack: "架子/卧推凳",
  bodyweight: "自重/徒手",
  accessory: "小器械",
  cardio: "有氧",
};

export const EQUIPMENT_BY_ID: Record<string, EquipmentType> = Object.fromEntries(EQUIPMENT_TYPES.map((e) => [e.id, e]));
