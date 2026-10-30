import type { Metadata } from "next";
import { SharedView } from "@/features/share/SharedView";

export const metadata: Metadata = {
  title: "训练分享 · Fitness Garden",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <SharedView />;
}
