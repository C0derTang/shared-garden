"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useCallback, useEffect, useId, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useSheetScope } from "./sheet-scope";

type BottomSheetProps = {
  trigger: ReactElement;
  title: string;
  description: string;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  triggerContainer?: HTMLElement | null;
};

export function BottomSheet({
  trigger,
  title,
  description,
  children,
  open,
  onOpenChange,
  onCloseAutoFocus,
  triggerContainer,
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
  const registerNoticeContainer = scope?.registerNoticeContainer;
  const noticeContainerRef = useCallback((element: HTMLDivElement | null) => {
    registerNoticeContainer?.(id, element);
  }, [id, registerNoticeContainer]);
  const triggerNode = <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>;
  return (
    <Dialog.Root open={visible} onOpenChange={(next) => { setLocalOpen(next); onOpenChange?.(next); }}>
      {visible || triggerContainer === undefined
        ? triggerNode
        : triggerContainer && createPortal(triggerNode, triggerContainer)}
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay" />
        <Dialog.Content className="sheet-content" onCloseAutoFocus={onCloseAutoFocus}>
          <div className="sheet-handle" aria-hidden="true" />
          <Dialog.Title className="sheet-title">{title}</Dialog.Title>
          <Dialog.Description className="sheet-description">
            {description}
          </Dialog.Description>
          <div ref={noticeContainerRef} className="sheet-notices" data-private-notice-host="sheet" />
          <div className="sheet-body">{children}</div>
          <Dialog.Close className="button button-secondary sheet-close">
            Close
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
