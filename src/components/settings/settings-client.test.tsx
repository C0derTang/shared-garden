import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const { readSettings, saveSetting, push } = vi.hoisted(() => ({ readSettings: vi.fn(), saveSetting: vi.fn(), push: vi.fn() }));
vi.mock("@/lib/settings/actions", () => ({ readSettings, saveSetting }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
import { MemberPreferences } from "./member-preferences";
import { SettingsClient } from "./settings-client";
const initial = { state: { revision: 3, guide: "skipped" as const, gentle_motion: false }, error: null };
beforeEach(() => { vi.clearAllMocks(); readSettings.mockResolvedValue(initial); });
it("persists reopen before navigation and retains errors without claiming success", async () => {
  render(<MemberPreferences initial={initial}><SettingsClient /></MemberPreferences>);
  saveSetting.mockResolvedValueOnce({ state: null, error: "Not confirmed" });
  fireEvent.click(screen.getByRole("button", { name: "Reopen garden guide" }));
  await screen.findByText("Not confirmed"); expect(push).not.toHaveBeenCalled();
  saveSetting.mockResolvedValueOnce({ state: { ...initial.state, guide: "open", revision: 4 }, error: null });
  fireEvent.click(screen.getByRole("button", { name: "Reopen garden guide" }));
  await waitFor(() => expect(push).toHaveBeenCalledExactlyOnceWith("/garden"));
  expect(saveSetting).toHaveBeenLastCalledWith({ guide: "open" });
});
it("has separate signout POST, fixed clock copy, and own optional motion control", async () => {
  render(<MemberPreferences initial={initial}><SettingsClient /></MemberPreferences>);
  expect(screen.getByRole("checkbox", { name: "Allow gentle motion" })).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Sign out" }).closest("form")).toHaveAttribute("action", "/auth/sign-out");
  expect(screen.getByRole("button", { name: "Sign out" }).closest("form")).toHaveAttribute("method", "post");
  expect(screen.getByText(/4 a.m. Pacific/)).toBeInTheDocument();
  expect(screen.getByText(/device.*reduced motion/i)).toBeInTheDocument();
  saveSetting.mockResolvedValue({ state: { ...initial.state, gentle_motion: true, revision: 4 }, error: null });
  fireEvent.click(screen.getByRole("checkbox"));
  await waitFor(() => expect(screen.getByRole("checkbox")).toBeChecked());
  expect(saveSetting).toHaveBeenCalledExactlyOnceWith({ gentle_motion: true });
});
it("groups short controls as settings rows and keeps garden-day detail collapsed until requested", async () => {
  render(<MemberPreferences initial={initial}><SettingsClient /></MemberPreferences>);
  const settings = screen.getByRole("region", { name: "Personal settings" });
  expect(within(settings).getByRole("heading", { name: "Garden guide" })).toBeVisible();
  expect(within(settings).getByRole("heading", { name: "Gentle motion" })).toBeVisible();
  const gardenDay = within(settings).getByText("Garden day · 4 a.m. Pacific").closest("details");
  expect(gardenDay).not.toHaveAttribute("open");
  expect(within(settings).getByRole("button", { name: "Sign out" })).toBeVisible();
});
it("keeps the confirmed motion value after a failed save and offers refresh", async () => {
  render(<MemberPreferences initial={initial}><SettingsClient /></MemberPreferences>);
  saveSetting.mockResolvedValueOnce({ state: null, error: "Motion was not confirmed" });
  fireEvent.click(screen.getByRole("checkbox", { name: "Allow gentle motion" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Motion was not confirmed");
  expect(screen.getByRole("checkbox", { name: "Allow gentle motion" })).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Refresh settings" }));
  await waitFor(() => expect(readSettings).toHaveBeenCalledTimes(2));
});
