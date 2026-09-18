import Link from "next/link";
import { requireMember } from "@/lib/auth/server";
import { GardenLayout } from "./garden-layout";
import { MemberHeader } from "./member-header";
import type { GardenDestination } from "./garden-navigation";
export async function UpcomingPage({
  current,
  title,
  description,
}: {
  current: GardenDestination;
  title: string;
  description: string;
}) {
  await requireMember();
  return (
    <GardenLayout current={current} header={<MemberHeader />}>
      <section className="auth-card">
        <p className="eyebrow">GROWING SOON</p>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="auth-actions">
          <Link href="/garden" className="button button-primary">
            Back to our garden
          </Link>
        </div>
      </section>
    </GardenLayout>
  );
}
