'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

const DISPLAY_MS = 5000;
const FADE_MS = 200;

/**
 * Toast API with a single replaceable message.
 */
export interface ToastContextValue {
  /**
   * Shows one toast, replacing whatever is already on screen.
   * @param message - Text to show.
   */
  show: (message: string) => void;
  /**
   * Hides the current toast, if any.
   */
  dismiss: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Renders one ink toast and replaces it when `show` is called again.
 * The toast auto-dismisses after a few seconds and can be closed by hand.
 * @param props - Provider props.
 * @param props.children - Tree that can raise a toast.
 * @returns The toast provider.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const frame = useRef<number | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers(): void {
    if (hideTimer.current !== null) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (removeTimer.current !== null) {
      clearTimeout(removeTimer.current);
      removeTimer.current = null;
    }
  }

  const dismiss = useCallback(() => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    if (hideTimer.current !== null) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (removeTimer.current !== null) {
      return;
    }
    setShown(false);
    removeTimer.current = setTimeout(() => {
      setMessage(null);
      removeTimer.current = null;
    }, FADE_MS);
  }, []);

  const show = useCallback(
    (next: string) => {
      clearTimers();
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
      }

      setShown(false);
      setMessage(next);
      frame.current = requestAnimationFrame(() => {
        setShown(true);
        frame.current = null;
        hideTimer.current = setTimeout(() => {
          setShown(false);
          hideTimer.current = null;
          removeTimer.current = setTimeout(() => {
            setMessage(null);
            removeTimer.current = null;
          }, FADE_MS);
        }, DISPLAY_MS);
      });
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
      }
      clearTimers();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      {message !== null ? (
        <div className={shown ? 'toast is-shown' : 'toast'} role="status">
          <span className="toast-message">{message}</span>
          <button aria-label="Dismiss" className="toast-close" type="button" onClick={dismiss}>
            {'\u00D7'}
          </button>
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
