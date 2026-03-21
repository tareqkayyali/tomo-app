"use client";

import { useEffect, useRef, useCallback } from "react";

interface PreviewMessage {
  type: string;
  payload: Record<string, unknown>;
}

/**
 * Hook that debounces and sends postMessage to a preview iframe.
 * Returns an iframe ref to attach and a send function.
 */
export function usePreviewSync(debounceMs = 300) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const send = useCallback(
    (message: PreviewMessage) => {
      if (timerRef.current) clearTimeout(timerRef.current);

      timerRef.current = setTimeout(() => {
        const iframe = iframeRef.current;
        if (!iframe?.contentWindow) return;

        iframe.contentWindow.postMessage(message, "*");
      }, debounceMs);
    },
    [debounceMs]
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { iframeRef, send };
}
