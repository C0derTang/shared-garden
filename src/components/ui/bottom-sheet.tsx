"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useId, useState, type ReactElement, type ReactNode } from "react";
import { useSheetScope } from "./sheet-scope";

type BottomSheetProps = {
  trigger: ReactElement;
  title: string;
  description: string;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
};

export function BottomSheet({
  trigger,
  title,
  description,
  children,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: BottomSheetProps) {
  const id = useId();
  const scope = useSheetScope();
  const [localOpen, setLocalOpen] = useState(false);
  const requested = open ?? localOpen;
  const request = scope?.request, release = scope?.release;
  useEffect(() => {
    if (requested) request?.(id);
    return () => release?.(id);
  }, [id, requested, request, release]);
  const visible = requested && (!scope || scope.active === id);
  return (
    <Dialog.Root open={visible} onOpenChange={(next) => { setLocalOpen(next); onOpenChange?.(next); }}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay" />
        <Dialog.Content className="sheet-content" onCloseAutoFocus={onCloseAutoFocus}>
          <div className="sheet-handle" aria-hidden="true" />
          <Dialog.Title className="sheet-title">{title}</Dialog.Title>
          <Dialog.Description className="sheet-description">
            {description}
          </Dialog.Description>
          <div className="sheet-body">{children}</div>
          <Dialog.Close className="button button-secondary sheet-close">
            Close
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
