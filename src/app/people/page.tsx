// /people has merged into the Utah View. Permanent server-side redirect.

import { redirect } from "next/navigation";

export default function People() {
  redirect("/utah");
}
