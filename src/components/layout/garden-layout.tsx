import type { ReactNode } from "react";
import {
  GardenNavigation,
  type GardenDestination,
} from "@/components/layout/garden-navigation";

// Presentational only. Future authenticated routes must authorize before rendering.
export function GardenLayout({
  current,
  children,
  header,
}: {
  current: GardenDestination;
  children: ReactNode;
  header: ReactNode;
}) {
  return (
    <div className="garden-layout">
      <header className="garden-header">{header}</header>
      <main id="main-content" className="garden-main">
        {children}
      </main>
      <GardenNavigation current={current} />
    </div>
  );
}
