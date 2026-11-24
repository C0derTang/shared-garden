import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/lib/landing/access", () => ({ loadLandingAccess: load }));
vi.mock("@/lib/auth/config", () => ({ getAuthConfig: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }) }));
import Home, { dynamic } from "./page";

it("shows visitors the lakeside landing with only a Log in control", async () => {
  load.mockResolvedValue({ status: "visitor" });
  render(await Home());
  expect(dynamic).toBe("force-dynamic");
  expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
  expect((await screen.findByRole("button", { name: "log in" })).closest("form")).toHaveAttribute("action", "/auth/start");
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.queryByText(/come in/)).toBeNull();
});

it("invites verified members in through the door", async () => {
  load.mockResolvedValue({ status: "member" });
  render(await Home());
  expect(await screen.findByRole("link", { name: "come in" })).toHaveAttribute("href", "/garden");
  expect(screen.queryByRole("button", { name: "log in" })).toBeNull();
});
