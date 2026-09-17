import { useCallback, useEffect, useRef, useState } from "react";
import {
  isScanProgressMessage,
  type ScanProgressUpdate,
} from "@/src/extension/scanProgress";

const STARTING_PROGRESS: ScanProgressUpdate = {
  phase: "preparing",
  percent: 4,
  label: "Starting quick scan…",
};

export function useScanProgress() {
  const requestIdRef = useRef<string | null>(null);
  const [progress, setProgress] = useState<ScanProgressUpdate | null>(null);

  useEffect(() => {
    if (typeof browser === "undefined" || !browser.runtime?.onMessage) return;
    const listener = (message: unknown): undefined => {
      if (
        !isScanProgressMessage(message) ||
        message.requestId !== requestIdRef.current
      ) {
        return undefined;
      }
      setProgress({
        phase: message.phase,
        percent: message.percent,
        label: message.label,
      });
      return undefined;
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

  const begin = useCallback((): string => {
    const requestId = globalThis.crypto.randomUUID();
    requestIdRef.current = requestId;
    setProgress(STARTING_PROGRESS);
    return requestId;
  }, []);

  const complete = useCallback((): void => {
    setProgress({
      phase: "complete",
      percent: 100,
      label: "Quick scan complete",
    });
  }, []);

  const update = useCallback((next: ScanProgressUpdate): void => {
    setProgress(next);
  }, []);

  const reset = useCallback((): void => {
    requestIdRef.current = null;
    setProgress(null);
  }, []);

  return { progress, begin, update, complete, reset };
}
