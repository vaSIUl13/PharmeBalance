"use client";

import { useEffect, useRef, type MouseEvent, type PointerEvent, type SyntheticEvent } from "react";

let openDialogs = 0;
let restoreScroll: (() => void) | undefined;

function isBackdrop(event: MouseEvent<HTMLDialogElement> | PointerEvent<HTMLDialogElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.target === event.currentTarget && (event.clientX < rect.left || event.clientX >= rect.right ||
    event.clientY < rect.top || event.clientY >= rect.bottom);
}

export function useModalDialog(busy: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const startedOnBackdrop = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    if (openDialogs++ === 0) {
      const root = document.documentElement.style;
      const body = document.body.style;
      const previousRoot = root.overflow;
      const previousBody = body.overflow;
      root.overflow = body.overflow = "hidden";
      restoreScroll = () => {
        root.overflow = previousRoot;
        body.overflow = previousBody;
      };
    }
    return () => {
      dialog.close();
      if (--openDialogs === 0) {
        restoreScroll?.();
        restoreScroll = undefined;
      }
    };
  }, []);

  return {
    ref,
    onCancel(event: SyntheticEvent<HTMLDialogElement>) {
      event.preventDefault();
      if (!busy) onClose();
    },
    onPointerDown(event: PointerEvent<HTMLDialogElement>) {
      startedOnBackdrop.current = event.button === 0 && isBackdrop(event);
    },
    onClick(event: MouseEvent<HTMLDialogElement>) {
      const dismiss = startedOnBackdrop.current && isBackdrop(event);
      startedOnBackdrop.current = false;
      if (dismiss && !busy) onClose();
    },
  };
}
