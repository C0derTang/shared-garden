"use client";
import { createContext, useContext, type ReactNode } from "react";

const PartnerName = createContext<string | null>(null);
/** Receives only the viewer's safe partner name from the authenticated layout. */
export function MemberNamesProvider({ partnerName, children }: { partnerName: string | null; children: ReactNode }) {
  return <PartnerName.Provider value={partnerName}>{children}</PartnerName.Provider>;
}
export function usePartnerName() {
  const name = useContext(PartnerName);
  return {
    label: name ?? "Partner",
    subject: name ?? "Your partner",
    object: name ?? "your partner",
    short: name ?? "partner",
  };
}
