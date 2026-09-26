"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Non-modal Help disclosure (decisions 0038 and 0042). It stays outside the
 * sheet queue and never traps focus. Escape closes it and returns focus to its
 * summary; a pointer down anywhere outside it closes it without moving focus.
 */
export function HelpDisclosure({
  className,
  summaryClassName,
  children,
}: {
  className?: string;
  summaryClassName?: string;
  children: ReactNode;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // Only claim Escape while Help owns focus, or nothing does. A dialog or
      // sheet that holds focus keeps its own Escape behavior.
      const active = document.activeElement;
      if (active && active !== document.body && !details.current?.contains(active)) return;
      setOpen(false);
      summary.current?.focus();
    }
    function onPointerDown(event: PointerEvent) {
      if (!details.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);
  return (
    <details
      ref={details}
      className={className}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary ref={summary} className={summaryClassName}>
        Help
      </summary>
      {children}
    </details>
  );
}
