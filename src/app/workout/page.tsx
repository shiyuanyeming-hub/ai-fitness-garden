import { Suspense } from "react";
import { WorkoutScreen } from "@/features/workout/WorkoutScreen";

export default function Page() {
  return (
    <Suspense>
      <WorkoutScreen />
    </Suspense>
  );
}
