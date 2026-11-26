import type { Walk, WalkDirection } from "./walking";
const KEYS: Record<string, WalkDirection | undefined> = { w: "forward", arrowup: "forward", s: "back", arrowdown: "back", a: "left", arrowleft: "left", d: "right", arrowright: "right" };
/** Only the focused world/pad owns movement keys; fields and other UI keep theirs. */
export function bindWalkingInput(root: HTMLElement, walk: Walk, blocked: () => boolean): () => void {
  const pad = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>("[data-walk]") : null;
  const permitted = (target: EventTarget | null) => target === root || Boolean(pad(target));
  const keydown = (event: KeyboardEvent) => {
    if (blocked() || !permitted(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    const direction = KEYS[event.key.toLowerCase()];
    if (!direction) return;
    event.preventDefault();
    // Repeats after a blur/overlay do not restart movement without a fresh press.
    if (!event.repeat) walk.press(direction, event.key.toLowerCase());
  };
  const keyup = (event: KeyboardEvent) => walk.release(event.key.toLowerCase());
  const stop = () => walk.stop();
  const focus = (event: FocusEvent) => { if (!permitted(event.target)) stop(); };
  const blur = (event: FocusEvent) => { if (!permitted(event.relatedTarget)) stop(); };
  const down = (event: PointerEvent) => {
    const button = pad(event.target);
    if (!button || blocked() || (event.button !== undefined && event.button !== 0)) return;
    event.preventDefault(); button.focus();
    button.setPointerCapture?.(event.pointerId);
    walk.press(button.dataset.walk as WalkDirection, `pointer-${event.pointerId}`);
  };
  const up = (event: PointerEvent) => walk.release(`pointer-${event.pointerId}`);
  const click = (event: MouseEvent) => {
    const button = pad(event.target);
    if (!button || blocked() || event.detail !== 0) return;
    // Screen-reader/keyboard button activation has no held pointer.
    const direction = button.dataset.walk as WalkDirection;
    walk.press(direction, "activate"); walk.tick(0.2); walk.release("activate");
  };
  root.addEventListener("focusout", blur);
  root.addEventListener("keydown", keydown);
  root.addEventListener("pointerdown", down);
  root.addEventListener("pointerup", up);
  root.addEventListener("pointercancel", up);
  root.addEventListener("lostpointercapture", up);
  root.addEventListener("click", click);
  window.addEventListener("keyup", keyup);
  window.addEventListener("blur", stop);
  document.addEventListener("visibilitychange", stop);
  document.addEventListener("focusin", focus);
  return () => {
    stop();
    root.removeEventListener("focusout", blur);
    root.removeEventListener("keydown", keydown);
    root.removeEventListener("pointerdown", down);
    root.removeEventListener("pointerup", up);
    root.removeEventListener("pointercancel", up);
    root.removeEventListener("lostpointercapture", up);
    root.removeEventListener("click", click);
    window.removeEventListener("keyup", keyup);
    window.removeEventListener("blur", stop);
    document.removeEventListener("visibilitychange", stop);
    document.removeEventListener("focusin", focus);
  };
}
