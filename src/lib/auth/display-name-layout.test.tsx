import { afterEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
vi.mock("server-only", () => ({}));
const { guard } = vi.hoisted(() => ({ guard: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ requireMember: guard }));
vi.mock("@/components/layout/garden-layout", () => ({ GardenLayout: ({ children }: { children: React.ReactNode }) => children }));
import MemberLayout from "@/app/(member)/layout";
import * as names from "./display-names";
import { usePartnerName } from "@/components/auth/member-names";
function Consumer() { return <p>{usePartnerName().subject}</p>; }
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it.each([1, 2] as const)("provides only the opposite configured name after verifying member %s", async member_id => {
  vi.stubEnv("GARDEN_MEMBER_1_NAME", "Avery");
  vi.stubEnv("GARDEN_MEMBER_2_NAME", "Rowan");
  guard.mockResolvedValue({ member: { member_id } });
  render(await MemberLayout({ children: <Consumer /> }));
  expect(screen.getByText(member_id === 1 ? "Rowan" : "Avery")).toBeInTheDocument();
  expect(screen.queryByText(member_id === 1 ? "Avery" : "Rowan")).toBeNull();
});
it("does not even read private names when membership verification rejects", async () => {
  guard.mockRejectedValue(new Error("signin"));
  const read = vi.spyOn(names, "partnerDisplayName");
  await expect(MemberLayout({ children: <Consumer /> })).rejects.toThrow("signin");
  expect(read).not.toHaveBeenCalled();
});
