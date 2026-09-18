import { expect, it } from "vitest";
import { pacificCandidates, canEditContribution } from "./model";
it("rejects nonexistent Pacific times and distinguishes both repeated hours", () => {
  expect(pacificCandidates("2030-03-10T02:30")).toEqual([]);
  expect(pacificCandidates("2030-11-03T01:30")).toEqual([
    "2030-11-03T08:30:00.000Z",
    "2030-11-03T09:30:00.000Z",
  ]);
  expect(pacificCandidates("2030-07-15T19:00")).toEqual([
    "2030-07-16T02:00:00.000Z",
  ]);
  expect(pacificCandidates("2030-02-30T19:00")).toEqual([]);
});
it("enforces exact original inclusive and rollover-exclusive edit bounds", () => {
  const entry = {
    can_edit: true,
    edit_deadline: "2030-01-01T12:00:00Z",
    edit_deadline_inclusive: true,
  };
  expect(canEditContribution(entry, Date.parse(entry.edit_deadline))).toBe(
    true,
  );
  expect(
    canEditContribution(
      { ...entry, edit_deadline_inclusive: false },
      Date.parse(entry.edit_deadline),
    ),
  ).toBe(false);
  expect(
    canEditContribution(
      { ...entry, can_edit: false },
      Date.parse(entry.edit_deadline) - 1,
    ),
  ).toBe(false);
});

it("preserves seconds in an existing plan when mapping it to local controls", async () => {
  const { pacificLocal } = await import("./model");
  expect(pacificLocal("2030-07-16T02:00:42Z")).toBe("2030-07-15T19:00");
});
