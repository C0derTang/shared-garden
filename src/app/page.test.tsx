import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/lib/landing/entries", () => ({ loadLandingData: load }));
vi.mock("@/lib/auth/config", () => ({ getAuthConfig: () => null }));
import Home, { dynamic } from "./page";

it("renders only Log in when the independently guarded loader denies access", async () => {
  load.mockResolvedValue({ status: "visitor" });
  render(await Home());
  expect(dynamic).toBe("force-dynamic");
  expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
  expect(screen.getByRole("main").textContent).toBe("Log in");
  expect(screen.getByRole("button", { name: "Log in" }).closest("form"))
    .toHaveAttribute("action", "/auth/start");
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.queryByRole("img")).toBeNull();
});
