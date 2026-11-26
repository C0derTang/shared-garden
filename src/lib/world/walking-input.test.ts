import { afterEach, describe, expect, it } from "vitest";
import { createWalk } from "./walking";
import { bindWalkingInput } from "./walking-input";
let cleanup = () => {};
afterEach(() => { cleanup(); document.body.innerHTML = ""; });
function setup() {
  document.body.innerHTML = '<div tabindex="0" id="world"><textarea></textarea><button data-walk="right">right</button></div>';
  const root = document.querySelector<HTMLElement>("#world")!;
  const walk = createWalk([0, 20], { minX: -20, maxX: 20, maxZ: 40 }, []);
  let blocked = false;
  cleanup = bindWalkingInput(root, walk, () => blocked);
  root.focus();
  return { root, walk, block: () => { blocked = true; walk.stop(); } };
}
function key(root: HTMLElement, type: string, key: string) { root.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true })); }
describe("walking input lifecycle", () => {
  it("holds WASD/arrows until release and clears keys on window blur", () => {
    const { root, walk } = setup();
    key(root, "keydown", "d"); walk.tick(1); expect(walk.position).toEqual([4, 20]);
    key(root, "keyup", "d"); walk.tick(1); expect(walk.position).toEqual([4, 20]);
    key(root, "keydown", "ArrowLeft"); window.dispatchEvent(new Event("blur")); walk.tick(1); expect(walk.position).toEqual([4, 20]);
  });
  it("stops when the world itself blurs to the document body", () => {
    const { root, walk } = setup(); key(root, "keydown", "d"); root.blur();
    walk.tick(1); expect(walk.position).toEqual([0, 20]);
  });
  it("stops when focus goes into a field and never captures typing or modified shortcuts", () => {
    const { root, walk } = setup();
    key(root, "keydown", "w");
    const field = root.querySelector("textarea")!; field.focus(); key(field, "keydown", "d"); walk.tick(1);
    expect(walk.position).toEqual([0, 20]);
    root.focus(); root.dispatchEvent(new KeyboardEvent("keydown", { key: "d", ctrlKey: true, bubbles: true })); walk.tick(1);
    expect(walk.position).toEqual([0, 20]);
  });
  it("cannot move under an overlay and requires fresh input after interruption", () => {
    const { root, walk, block } = setup(); key(root, "keydown", "d"); block();
    key(root, "keydown", "d"); walk.tick(1); expect(walk.position).toEqual([0, 20]);
  });
  it("stops a touch pad on release, cancel and lost capture", () => {
    const { root, walk } = setup();
    const pad = root.querySelector("button")!;
    for (const end of ["pointerup", "pointercancel", "lostpointercapture"]) {
      pad.dispatchEvent(new Event("pointerdown", { bubbles: true })); walk.tick(0.25);
      const before = [...walk.position]; pad.dispatchEvent(new Event(end, { bubbles: true })); walk.tick(1);
      expect(walk.position).toEqual(before);
    }
    expect(walk.position[0]).toBe(3);
  });
  it("clears held input and ground targets when hidden and on disposal", () => {
    const { root, walk } = setup(); key(root, "keydown", "d");
    document.dispatchEvent(new Event("visibilitychange")); walk.tick(1); expect(walk.position).toEqual([0, 20]);
    walk.walkTo([10, 20]); cleanup(); walk.tick(1); expect(walk.position).toEqual([0, 20]);
  });
});
