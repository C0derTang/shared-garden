import Link from "next/link";
import { PixelIcon } from "@/components/ui/pixel-icon";

export type GardenDestination =
  "garden" | "memories" | "achievements" | "settings";

const destinations = [
  { id: "garden", label: "Garden", href: "/garden", icon: "sprout" },
  { id: "memories", label: "Memories", href: "/memories", icon: "book" },
  {
    id: "achievements",
    label: "Achievements",
    href: "/achievements",
    icon: "flower",
  },
] as const;

// Mount only after the owning route has verified private access.
export function GardenNavigation({ current }: { current: GardenDestination }) {
  return (
    <div className="garden-navigation">
      <nav aria-label="Garden" className="garden-primary-nav">
        {destinations.map(({ id, label, href, icon }) => (
          <Link
            key={id}
            href={href}
            prefetch={false}
            aria-current={current === id ? "page" : undefined}
          >
            <PixelIcon name={icon} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      <nav aria-label="Settings" className="garden-settings-nav">
        <Link
          href="/settings"
          prefetch={false}
          aria-current={current === "settings" ? "page" : undefined}
        >
          <PixelIcon name="settings" />
          <span>Settings</span>
        </Link>
      </nav>
    </div>
  );
}
