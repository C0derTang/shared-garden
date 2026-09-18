import { GardenLayout } from "@/components/layout/garden-layout";
import { PixelIcon } from "@/components/ui/pixel-icon";
import { requireMember } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function GardenPage() {
  await requireMember();
  return (
    <GardenLayout
      current="garden"
      header={
        <div className="member-header">
          <span className="wordmark">
            <PixelIcon name="sprout" /> Shared Garden
          </span>
          <form action="/auth/sign-out" method="post">
            <button className="button button-secondary" type="submit">
              Sign out
            </button>
          </form>
        </div>
      }
    >
      <section className="auth-card" aria-labelledby="garden-heading">
        <p className="eyebrow">YOUR SHARED SPACE</p>
        <h1 id="garden-heading">Welcome to your garden</h1>
        <p>You’re signed in. Your garden is still being prepared.</p>
        <p>
          Planting, memories, and achievements will appear here when they’re
          ready.
        </p>
      </section>
    </GardenLayout>
  );
}
