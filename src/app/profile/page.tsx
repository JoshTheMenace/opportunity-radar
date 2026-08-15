import type { Metadata } from "next";
import ProfilePageClient from "../components/profile-page-client";

export const metadata: Metadata = {
  title: "Profile",
  description: "Your company profile — every fact the matching engine runs on, editable.",
};

export default function Page() {
  return <ProfilePageClient />;
}
