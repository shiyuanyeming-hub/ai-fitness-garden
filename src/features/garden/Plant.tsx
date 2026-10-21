"use client";
import { motion, useReducedMotion } from "framer-motion";
import type { PlantStage } from "@/core/gamification";

const H: Record<PlantStage, number> = { fallow: 0, seed: 0, sprout: 18, growing: 34, budding: 46, mature: 52 };

/** A small stylised plant. Growth only reflects the estimated readiness timeline. */
export function Plant({ stage, size = "100%" }: { stage: PlantStage; size?: string | number }) {
  const reduce = useReducedMotion();
  const h = H[stage];
  const stemTop = 78 - h;
  const leaf = "var(--accent)";
  const leaf2 = "color-mix(in srgb, var(--accent) 70%, #a3e635)";
  const t = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 120, damping: 14 };
  return (
    <svg viewBox="0 0 60 90" width={size} height={size} aria-hidden>
      <ellipse cx="30" cy="80" rx="24" ry="7" fill="var(--soil)" />
      <ellipse cx="30" cy="78" rx="20" ry="4.5" fill="var(--soil-dark)" opacity=".5" />
      {stage === "fallow" && (
        <g opacity=".7">
          <path d="M22 76l3-3M30 77l2-4M37 76l2-3" stroke="var(--soil-dark)" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      )}
      {stage === "seed" && (
        <motion.ellipse cx="30" cy="75" rx="3.4" ry="2.4" fill="#8b5e34" initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={t} />
      )}
      {h > 0 && (
        <g className={stage === "mature" && !reduce ? "sway" : undefined}>
          <motion.path
            d={`M30 78 C30 ${78 - h * 0.5} 29 ${78 - h * 0.8} 30 ${stemTop}`}
            stroke={leaf}
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: reduce ? 0 : 0.8 }}
          />
          <motion.path
            d={`M30 ${78 - h * 0.45} c-10 -2 -14 -9 -14 -14 c8 0 13 5 14 14z`}
            fill={leaf2}
            initial={reduce ? false : { scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{ transformOrigin: `30px ${78 - h * 0.45}px` }}
            transition={t}
          />
          <motion.path
            d={`M30 ${78 - h * 0.55} c10 -2 14 -9 14 -14 c-8 0 -13 5 -14 14z`}
            fill={leaf}
            initial={reduce ? false : { scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            style={{ transformOrigin: `30px ${78 - h * 0.55}px` }}
            transition={{ ...t, delay: reduce ? 0 : 0.1 }}
          />
          {(stage === "growing" || stage === "budding" || stage === "mature") && (
            <>
              <path d={`M30 ${78 - h * 0.8} c-8 -1 -11 -7 -11 -11 c6 0 10 4 11 11z`} fill={leaf} />
              <path d={`M30 ${78 - h * 0.85} c8 -1 11 -7 11 -11 c-6 0 -10 4 -11 11z`} fill={leaf2} />
            </>
          )}
          {stage === "budding" && <circle cx="30" cy={stemTop - 2} r="4" fill="#f5c12e" opacity=".75" />}
          {stage === "mature" && (
            <motion.g initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} style={{ transformOrigin: `30px ${stemTop}px` }} transition={t}>
              {[0, 72, 144, 216, 288].map((a) => (
                <ellipse key={a} cx="30" cy={stemTop - 6} rx="3.6" ry="6.5" fill="#ffb84d" transform={`rotate(${a} 30 ${stemTop})`} />
              ))}
              <circle cx="30" cy={stemTop} r="4.2" fill="#ff7a3d" />
            </motion.g>
          )}
        </g>
      )}
      {stage === "mature" && !reduce && (
        <g fill="#ffd166">
          <path className="twinkle" style={{ transformOrigin: "10px 20px" }} d="M10 16l1.2 3 3 1-3 1-1.2 3-1.2-3-3-1 3-1z" />
          <path className="twinkle" style={{ transformOrigin: "50px 28px", animationDelay: ".8s" }} d="M50 24l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" />
          <path className="twinkle" style={{ transformOrigin: "46px 8px", animationDelay: "1.5s" }} d="M46 5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
        </g>
      )}
    </svg>
  );
}
