// /utah — the Utah View: documented Utah winners, public navigators, and
// Utah-only programs. Server component; all DB reads happen in ./data.ts and
// the serialized result is personalized client-side from the stored report.

import type { Metadata } from "next";
import UtahViewClient from "../components/utah-view-client";
import { getUtahViewData } from "./data";

export const metadata: Metadata = {
  title: "Utah View",
  description:
    "Documented Utah grant and federal-contract winners, public navigators, and Utah-only programs.",
};

export const dynamic = "force-dynamic";

export default function UtahPage() {
  return <UtahViewClient data={getUtahViewData()} />;
}
