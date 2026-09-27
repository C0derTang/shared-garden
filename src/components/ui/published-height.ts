"use client";
import { useEffect, useState } from "react";

/**
 * Publishes an element's rendered height as a CSS custom property, so other
 * layers can clear it when large text makes it grow or wrap (issue #135).
 * `host` is where the property is set: the element's parent or the document
 * root. The property is removed again when the element unmounts or when
 * `enabled` turns off, so the stylesheet's own value applies.
 */
export function usePublishedHeight<T extends HTMLElement>(
  property: string,
  host: "parent" | "root",
  enabled = true,
) {
  const [element, setElement] = useState<T | null>(null);
  useEffect(() => {
    const target =
      host === "root" ? document.documentElement : element?.parentElement;
    if (!element || !target || !enabled) return;
    const publish = () =>
      target.style.setProperty(
        property,
        `${element.getBoundingClientRect().height}px`,
      );
    publish();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    observer?.observe(element, { box: "border-box" });
    return () => {
      observer?.disconnect();
      target.style.removeProperty(property);
    };
  }, [element, property, host, enabled]);
  return setElement;
}
