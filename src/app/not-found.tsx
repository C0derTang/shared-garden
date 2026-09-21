import Link from "next/link";
import { PixelIcon } from "@/components/ui/pixel-icon";

export default function NotFound() {
  return (
    <main id="main-content" className="not-found">
      <PixelIcon name="sprout" />
      <p className="eyebrow">cc’s garden</p>
      <h1>This path is still growing.</h1>
      <p>There’s nothing to see here just yet.</p>
      <Link href="/" className="button button-primary">
        Back to the garden gate
      </Link>
    </main>
  );
}
