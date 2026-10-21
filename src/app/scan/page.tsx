import { Suspense } from "react";
import { ScanScreen } from "@/features/recognition/ScanScreen";

export default function Page() {
  return (
    <Suspense>
      <ScanScreen />
    </Suspense>
  );
}
