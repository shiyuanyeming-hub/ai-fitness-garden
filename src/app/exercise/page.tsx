import { Suspense } from "react";
import { ExerciseScreen } from "@/features/exercise/ExerciseScreen";

export default function Page() {
  return (
    <Suspense>
      <ExerciseScreen />
    </Suspense>
  );
}
