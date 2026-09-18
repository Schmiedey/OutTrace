import { createContext, useContext } from "react";

/** Opens checkout without taking someone away from the work they were doing. */
export const UpgradePromptContext = createContext<(() => void) | null>(null);

export function useUpgradePrompt(): () => void {
  const open = useContext(UpgradePromptContext);
  if (!open) return () => undefined;
  return open;
}
