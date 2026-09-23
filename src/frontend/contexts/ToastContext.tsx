'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

/**
 * Toast API with a single replaceable message.
 */
export interface ToastContextValue {
  /**
   * Shows one toast, replacing whatever is already on screen.
   * @param message - Text to show.
   */
  show: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Renders one ink toast and replaces it when `show` is called again.
 * @param props - Provider props.
 * @param props.children - Tree that can raise a toast.
 * @returns The toast provider.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const frame = useRef<number | null>(null);

  const show = useCallback((next: string) => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
    }

    setShown(false);
    setMessage(next);
    frame.current = requestAnimationFrame(() => {
      setShown(true);
      frame.current = null;
    });
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {message !== null ? (
        <div className={shown ? 'toast is-shown' : 'toast'} role="status">
          {message}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

/**
 * Reads the toast API. Must be called under `ToastProvider`.
 * @returns The `show` function.
 */
export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error('useToast must be used within ToastProvider.');
  }
  return value;
}
