import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Old links and bookmarks: every auth outcome now lands on the homepage. */
export default function AuthErrorPage() {
  redirect("/");
}
