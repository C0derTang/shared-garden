import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GardenNavigation } from "@/components/layout/garden-navigation";

describe("garden navigation", () => {
  it("identifies the active destination and keeps settings separate", () => {
    render(<GardenNavigation current="memories" />);
    const main = screen.getByRole("navigation", { name: "Garden" });
    expect(
      within(main).getByRole("link", { name: "Memories" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(main).getByRole("link", { name: "Garden" }),
    ).not.toHaveAttribute("aria-current");
    expect(within(main).getAllByRole("link")).toHaveLength(3);
    const settings = screen.getByRole("navigation", { name: "Settings" });
    expect(
      within(settings).getByRole("link", { name: "Settings" }),
    ).toHaveAttribute("href", "/settings");
  });
});
