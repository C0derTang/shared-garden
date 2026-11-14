import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LandingData, LandingEntry, LandingFlower } from "@/lib/landing/types";
import { SunsetLanding } from "./sunset-landing";

const entry = (flower: LandingFlower, n: number): LandingEntry => ({
  id: `${flower}-${n}`, flower, text: `${flower} note ${n}`, author: n === 1 ? "Ari" : null, day: `2026-11-0${n}`,
});
const member = (entries: Partial<Record<LandingFlower, LandingEntry[]>> = {}): LandingData => ({
  status: "member",
  entries: { rose: [entry("rose", 1), entry("rose", 2), entry("rose", 3)], marigold: [entry("marigold", 1), entry("marigold", 2)], tulip: [entry("tulip", 1)], ...entries },
});
const region = (name: string) => screen.getByRole("region", { name });
const slide = (name: string) => within(region(name)).getByRole("group");
let reduce = true;
let subscribers: Set<() => void>;
beforeEach(() => {
  reduce = true;
  subscribers = new Set();
  vi.stubGlobal("matchMedia", () => ({
    matches: reduce,
    addEventListener: (_event: string, change: () => void) => subscribers.add(change),
    removeEventListener: (_event: string, change: () => void) => subscribers.delete(change),
  }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (document as { visibilityState?: unknown }).visibilityState;
});

it("shows only the native Log in control to visitors without any private visual shell", () => {
  const { container } = render(<SunsetLanding data={{ status: "visitor" }} />);
  expect(container.textContent).toBe("Log in");
  expect(screen.getByRole("button", { name: "Log in" }).closest("form")).toHaveAttribute("method", "post");
  expect(screen.getByRole("button").closest("form")).toHaveAttribute("action", "/auth/start");
  expect(container.querySelector("svg")).toBeNull();
  expect(container.querySelector("img")).toBeNull();
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.queryByRole("region")).toBeNull();
});

it("immediately displays the member's first three entries and only one old-garden link", () => {
  const { container } = render(<SunsetLanding data={member()} />);
  const artwork = [...container.querySelectorAll("img")];
  expect(artwork).toHaveLength(2);
  expect(artwork.every((image) => image.alt === "")).toBe(true);
  expect(artwork.map((image) => decodeURIComponent(image.getAttribute("src") ?? "")).join(" ")).toContain("red-spider-lily.png");
  for (const name of ["Rose", "Marigold", "Tulip"])
    expect(slide(name)).toHaveTextContent(`${name.toLowerCase()} note 1`);
  expect(slide("Rose")).toHaveTextContent("Ari · 2026-11-01");
  expect(screen.getAllByRole("link")).toHaveLength(1);
  expect(screen.getByRole("link", { name: "old garden" })).toHaveAttribute("href", "/garden");
  expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual(["Rose", "Marigold", "Tulip"]);
  expect(screen.queryByRole("button", { name: "Log in" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Tulip entry/ })).toBeNull();
});

it("supports independent manual wraparound and announces requested changes", async () => {
  const user = userEvent.setup();
  render(<SunsetLanding data={member()} />);
  await user.click(screen.getByRole("button", { name: "Previous Rose entry" }));
  expect(slide("Rose")).toHaveAccessibleName("3 of 3");
  expect(slide("Rose")).toHaveTextContent("rose note 3");
  await user.click(screen.getByRole("button", { name: "Next Rose entry" }));
  expect(slide("Rose")).toHaveAccessibleName("1 of 3");
  expect(slide("Rose").parentElement).toHaveAttribute("aria-live", "polite");
  expect(slide("Marigold")).toHaveAccessibleName("1 of 2");
});

it("keeps empty and failed groups inside their cards without misleading empty copy", () => {
  const data = member({ rose: [], tulip: [] });
  if (data.status !== "member") throw new Error("fixture");
  data.unavailable = ["tulip"];
  render(<SunsetLanding data={data} />);
  expect(region("Rose")).toHaveTextContent("Nothing planted on these pages yet.");
  expect(region("Tulip")).toHaveTextContent("These entries couldn’t load. Try again later.");
  expect(within(region("Rose")).queryByRole("button")).toBeNull();
  expect(within(region("Tulip")).queryByRole("button")).toBeNull();
});

it("renders entry text and names as plain text", () => {
  const malicious = { ...entry("rose", 1), text: '<img src=x onerror="alert(1)">\n<script>private</script>', author: "<svg onload=alert(1)>" };
  render(<SunsetLanding data={member({ rose: [malicious] })} />);
  expect(slide("Rose")).toHaveTextContent('<img src=x onerror="alert(1)">');
  expect(slide("Rose").querySelector("img, script, svg")).toBeNull();
});

describe("entry motion", () => {
  beforeEach(() => { reduce = false; vi.useFakeTimers(); });
  const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

  it("automatically shows the next complete entry without live announcements", () => {
    render(<SunsetLanding data={member()} />);
    expect(slide("Rose").parentElement).toHaveAttribute("aria-live", "off");
    expect(slide("Rose")).toHaveTextContent("rose note 1");
    advance(6000);
    expect(slide("Rose")).toHaveAccessibleName("2 of 3");
    expect(slide("Rose")).toHaveTextContent("rose note 2");
    expect(slide("Marigold")).toHaveAccessibleName("2 of 2");
    advance(6000);
    expect(slide("Marigold")).toHaveAccessibleName("1 of 2");
  });

  it("pauses on hover, focus within the carousel, and hidden tabs", () => {
    let visibility: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
    render(<SunsetLanding data={member()} />);
    fireEvent.mouseEnter(region("Rose"));
    const next = screen.getByRole("button", { name: "Next Marigold entry" });
    const previous = screen.getByRole("button", { name: "Previous Marigold entry" });
    act(() => next.focus());
    advance(7000);
    expect(slide("Rose")).toHaveAccessibleName("1 of 3");
    expect(slide("Marigold")).toHaveAccessibleName("1 of 2");
    act(() => previous.focus());
    advance(7000);
    expect(slide("Marigold")).toHaveAccessibleName("1 of 2");
    act(() => previous.blur());
    fireEvent.mouseLeave(region("Rose"));
    visibility = "hidden";
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    advance(7000);
    expect(slide("Rose")).toHaveAccessibleName("1 of 3");
    visibility = "visible";
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    advance(6000);
    expect(slide("Rose")).toHaveAccessibleName("2 of 3");
  });

  it("honors explicit stop and restart without affecting another carousel", () => {
    render(<SunsetLanding data={member()} />);
    fireEvent.click(screen.getByRole("button", { name: "Stop rotating Rose entries" }));
    advance(20000);
    expect(slide("Rose")).toHaveAccessibleName("1 of 3");
    fireEvent.click(screen.getByRole("button", { name: "Start rotating Rose entries" }));
    advance(6000);
    expect(slide("Rose")).toHaveAccessibleName("2 of 3");
  });

  it("responds to reduced motion changes and retains immediate manual navigation", () => {
    render(<SunsetLanding data={member()} />);
    reduce = true;
    act(() => subscribers.forEach((change) => change()));
    advance(20000);
    expect(slide("Rose")).toHaveAccessibleName("1 of 3");
    expect(screen.queryByRole("button", { name: /rotating/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next Rose entry" }));
    expect(slide("Rose")).toHaveTextContent("rose note 2");
    expect(slide("Rose")).toHaveAccessibleName("2 of 3");
  });
});
