import { Suspense } from "react";
import { EquipmentScreen } from "@/features/equipment/EquipmentScreen";

export default function Page() {
  return (
    <Suspense>
      <EquipmentScreen />
    </Suspense>
  );
}
