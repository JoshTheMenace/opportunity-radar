import type { Metadata } from "next";
import OpportunityMap from "./opportunity-map";

export const metadata: Metadata = {
  title: "Opportunity Radar",
  description: "Match your startup to US government funding.",
};

export default function Page() {
  return <OpportunityMap />;
}
