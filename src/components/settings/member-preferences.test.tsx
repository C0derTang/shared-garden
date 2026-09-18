import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const { readSettings, saveSetting } = vi.hoisted(() => ({ readSettings: vi.fn(), saveSetting: vi.fn() }));
vi.mock("@/lib/settings/actions", () => ({ readSettings, saveSetting }));
import { MemberPreferences, useMemberPreferences } from "./member-preferences";
import type { SettingsResult } from "@/lib/settings/model";
const initial: SettingsResult = { state: { revision: 0, guide: "open", gentle_motion: false }, error: null };
function Controls() {
  const preferences = useMemberPreferences()!;
  return <><span>{preferences.state?.guide}</span><button onClick={() => void preferences.save({ guide: "skipped" })}>Skip</button><button onClick={() => void preferences.save({ gentle_motion: true })}>Motion</button><button onClick={() => void preferences.refresh()}>Refresh</button><p role="alert">{preferences.error}</p></>;
}
beforeEach(() => { vi.clearAllMocks(); readSettings.mockResolvedValue(initial); });
it("suppresses global motion from the initial render and removes account scope on unmount", () => {
  const view = render(<MemberPreferences initial={initial}><Controls /></MemberPreferences>);
  expect(document.querySelector("style[data-member-motion]")?.textContent).toContain("animation: none !important");
  view.unmount(); expect(document.querySelector("style[data-member-motion]")).toBeNull();
});
it("ignores older reads after a confirmed write and sends only the changed field", async () => {
  let resolve!: (r: SettingsResult) => void;
  readSettings.mockReturnValue(new Promise((done) => { resolve = done; }));
  render(<MemberPreferences initial={initial}><Controls /></MemberPreferences>);
  saveSetting.mockResolvedValue({ state: { ...initial.state, revision: 2, guide: "skipped" }, error: null });
  fireEvent.click(screen.getByText("Skip"));
  await screen.findByText("skipped");
  await act(async () => resolve(initial));
  expect(screen.getByText("skipped")).toBeInTheDocument();
  expect(saveSetting).toHaveBeenCalledExactlyOnceWith({ guide: "skipped" });
});
it("keeps confirmed preferences after failed saves and allows explicit retry", async () => {
  render(<MemberPreferences initial={initial}><Controls /></MemberPreferences>);
  saveSetting.mockResolvedValue({ state: null, error: "Not confirmed" });
  fireEvent.click(screen.getByText("Motion"));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Not confirmed"));
  expect(document.querySelector("style[data-member-motion]")).not.toBeNull();
  saveSetting.mockResolvedValue({ state: { revision: 1, guide: "open", gentle_motion: true }, error: null });
  fireEvent.click(screen.getByText("Motion"));
  await waitFor(() => expect(document.querySelector("style[data-member-motion]")).toBeNull());
});
it("defaults to no animation when settings cannot load", () => {
  render(<MemberPreferences initial={{ state: null, error: "Unavailable" }}><Controls /></MemberPreferences>);
  expect(document.querySelector("style[data-member-motion]")).not.toBeNull();
});
