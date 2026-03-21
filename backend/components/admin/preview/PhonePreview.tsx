"use client";

import { useState, useCallback, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface PhonePreviewProps {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  /** Optional: navigate to a specific screen on load */
  initialScreen?: string;
}

const PREVIEW_URL = "https://app.my-tomo.com?preview=true";

export function PhonePreview({ iframeRef, initialScreen }: PhonePreviewProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [darkMode, setDarkMode] = useState(true);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);

    // Send preview mode activation
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(
        { type: "TOMO_PREVIEW_MODE", payload: { enabled: true } },
        "*"
      );

      // Navigate to specific screen if requested
      if (initialScreen) {
        setTimeout(() => {
          iframe.contentWindow?.postMessage(
            { type: "TOMO_NAVIGATE", payload: { screen: initialScreen } },
            "*"
          );
        }, 1000);
      }
    }
  }, [iframeRef, initialScreen]);

  const handleRefresh = useCallback(() => {
    setIsLoaded(false);
    const iframe = iframeRef.current;
    if (iframe) {
      // Cache-bust: append timestamp to force fresh API responses
      const base = PREVIEW_URL.split("?")[0];
      iframe.src = `${base}?preview=true&_t=${Date.now()}`;
    }
  }, [iframeRef]);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Controls */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          Refresh
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDarkMode(!darkMode)}
        >
          {darkMode ? "Light" : "Dark"}
        </Button>
      </div>

      {/* Phone Frame */}
      <div
        className="relative flex-shrink-0"
        style={{ width: 375, height: 750 }}
      >
        {/* iPhone bezel */}
        <div
          className="absolute inset-0 rounded-[40px] border-[3px] border-zinc-700 bg-black shadow-2xl overflow-hidden"
        >
          {/* Notch */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120px] h-[28px] bg-black rounded-b-2xl z-10" />

          {/* Home indicator */}
          <div className="absolute bottom-[6px] left-1/2 -translate-x-1/2 w-[100px] h-[4px] bg-zinc-600 rounded-full z-10" />

          {/* iframe */}
          {!isLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
              <Skeleton className="w-full h-full" />
            </div>
          )}
          <iframe
            ref={iframeRef}
            src={PREVIEW_URL}
            onLoad={handleLoad}
            className="w-full h-full border-0"
            style={{
              opacity: isLoaded ? 1 : 0,
              colorScheme: darkMode ? "dark" : "light",
            }}
            sandbox="allow-scripts allow-same-origin allow-forms"
            title="App Preview"
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Live preview — changes appear as you edit
      </p>
    </div>
  );
}
