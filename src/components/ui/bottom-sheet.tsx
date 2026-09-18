"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { ReactElement, ReactNode } from "react";

type BottomSheetProps = {
  trigger: ReactElement;
  title: string;
  description: string;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function BottomSheet({
  trigger,
  title,
  description,
  children,
  open,
  onOpenChange,
}: BottomSheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay" />
        <Dialog.Content className="sheet-content">
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
