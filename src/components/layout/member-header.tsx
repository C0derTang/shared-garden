import { PixelIcon } from "@/components/ui/pixel-icon";
export function MemberHeader() {
  return (
    <div className="member-header">
      <span className="wordmark">
        <PixelIcon name="sprout" />
        Shared Garden
      </span>
      <form action="/auth/sign-out" method="post">
        <button className="button button-secondary" type="submit">
          Sign out
        </button>
      </form>
    </div>
  );
}
