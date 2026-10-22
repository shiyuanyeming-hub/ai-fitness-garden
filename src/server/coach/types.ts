/**
 * AI daily coach — request/response shapes shared by client and server (type-only on the client).
 *
 * The client sends a compact summary computed by the deterministic engine (recovery, weekly sets,
 * habits, recent sessions). The model only chooses and explains; it never invents loads or rep
 * targets, and its output is advice, never a training fact.
 */
export type CoachRegion = "chest" | "back" | "shoulders" | "arms" | "core" | "legs";

export interface CoachCandidate {
  id: string;
  name: string;
  region: CoachRegion;
  primary: string[];
  /** true if a primary muscle is still recovering / needs attention */
  primaryFatigued: boolean;
  familiar: boolean;
}

export interface CoachInput {
  date: string;
  weekday: string;
  nowLocal: string;
  profile: {
    experience: string;
    heightCm: number | null;
    weightKg: number | null;
    goals: string[];
    weeklyTrainingDays: number;
    sessionMinutes: number;
    priorities: Record<string, "focus" | "maintain" | "skip">;
    limitations: string;
    goalDaysLeft: number | null;
  };
  checkin: { energy: string | null; sleep: string | null };
  habits: {
    totalSessions: number;
    sessionsLast28d: number;
    avgSessionsPerWeek: number;
    avgDurationMin: number | null;
    usualStart: string | null;
    daysSinceLastSession: number | null;
    sessionsThisWeek: number;
    trainedToday: boolean;
    topExercises: { name: string; times: number }[];
  };
  recent: { date: string; durationMin: number | null; exercises: { name: string; workingSets: number; best: string | null }[] }[];
  regions: {
    region: CoachRegion;
    name: string;
    priority: string;
    status: string;
    readinessPct: number;
    readyInHours: number | null;
    setsThisWeek: number;
    weeklyTarget: [number, number];
    daysSinceTrained: number | null;
  }[];
  attention: string[];
  rule: { headline: string; restDay: boolean; exercises: { id: string; name: string; sets: number; region: string }[] };
  candidates: CoachCandidate[];
}

export interface CoachAdvice {
  dayType: "train" | "light" | "rest";
  headline: string;
  summary: string;
  focusRegions: CoachRegion[];
  exercises: { exerciseId: string; sets: number; note: string }[];
  reasons: string[];
  cautions: string[];
  habitTip: string;
}
