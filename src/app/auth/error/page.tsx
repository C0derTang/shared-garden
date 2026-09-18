import Link from "next/link";
import { SignInButton } from "@/components/auth/sign-in-button";
import { PixelIcon } from "@/components/ui/pixel-icon";
import { getAuthConfig } from "@/lib/auth/config";

export const dynamic = "force-dynamic";

const messages = {
  denied: [
    "This garden is private",
    "Only its two approved Google accounts can enter. Choose the Google account set up for this garden, or return home.",
  ],
  signin: [
    "Come back to your garden",
    "Sign in with your approved Google account to continue. Your session may have ended.",
  ],
  cancelled: [
    "Sign-in wasn’t completed",
    "You can try again whenever you’re ready.",
  ],
  callback: [
    "Sign-in didn’t finish",
    "That sign-in link is missing, expired, or could not be verified. Start again to get a fresh link.",
  ],
  setup: [
    "The garden isn’t ready yet",
    "Private sign-in is temporarily unavailable while setup is completed. Please try again later.",
  ],
  unavailable: [
    "We couldn’t open the garden",
    "The sign-in service is unavailable right now. Please try again in a little while.",
  ],
  signout: [
    "Signed out on this browser",
    "We couldn’t confirm that the service ended your session. This browser’s sign-in has been cleared. You can sign in again and retry signing out.",
  ],
} as const;

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const reason =
    typeof params.reason === "string" && Object.hasOwn(messages, params.reason)
      ? (params.reason as keyof typeof messages)
      : "callback";
  const [title, description] = messages[reason];
  const configured = !!getAuthConfig();
  return (
    <main id="main-content" className="auth-card auth-page">
      <span className="wordmark">
        <PixelIcon name="sprout" /> Shared Garden
      </span>
      <h1>{title}</h1>
      <p>{description}</p>
      <div className="auth-actions">
        {configured && <SignInButton />}
        {configured && reason !== "signout" && (
          <form action="/auth/sign-out" method="post">
            <button className="button button-secondary" type="submit">
              Sign out
            </button>
          </form>
        )}
        <Link href="/" className="button button-secondary">
          Return home
        </Link>
      </div>
    </main>
  );
}
