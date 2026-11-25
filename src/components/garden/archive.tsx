"use client";
import { createContext, useContext } from "react";

/**
 * The legacy garden at /legacy is a frozen, read-only archive (decision 0067,
 * issue #176). Its stage provides `true`; components then render only read
 * paths. The database refuses legacy writes regardless.
 */
const ArchiveContext = createContext(false);
export const ArchiveProvider = ArchiveContext.Provider;
export function useArchived() {
  return useContext(ArchiveContext);
}
export const archiveNote = "Archived garden · read-only";
