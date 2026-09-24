'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useId, type ReactNode } from 'react';

/**
 * Paper sheet with a rule edge, square corners, and an ink dim. The scrim does not blur.
 * @param props - Dialog props.
 * @param props.open - Whether the sheet is open.
 * @param props.title - Sheet title. Also the accessible name of the dialog.
 * @param props.titleId - Id of the title, so a field inside can point at it.
 * @param props.onOpenChange - Called when the sheet opens or closes. Closing does not save.
 * @param props.children - Fields and actions inside the sheet.
 * @returns The modal sheet.
 */
export function Dialog({
  open,
  title,
  titleId,
  onOpenChange,
  children,
}: {
  open: boolean;
  title: string;
  titleId: string;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}): ReactNode {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="sheet-overlay" />
        <DialogPrimitive.Content aria-label={title} className="sheet-dialog">
          <DialogPrimitive.Title className="sheet-title" id={titleId}>
            {title}
          </DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Id for a dialog title. Call it in the component that owns the sheet.
 * @returns A unique title id.
 */
export function useDialogTitleId(): string {
  return useId();
}
