import { useCallback, useEffect, useRef, useState } from "react";
import { triggerHaptic } from "@/lib/ui/haptics";

export type CombatAlertKind = "warning" | "objective" | "contact" | "system";

export function useCombatAlert() {
  const [combatAlert, setCombatAlert] = useState<string | null>(null);
  const [combatAlertKind, setCombatAlertKind] = useState<CombatAlertKind>("warning");
  const clearRef = useRef<number | null>(null);

  const onAlert = useCallback((text: string, kind: CombatAlertKind = "warning") => {
    triggerHaptic("alert");
    setCombatAlert(text);
    setCombatAlertKind(kind);
    if (clearRef.current) window.clearTimeout(clearRef.current);
    clearRef.current = window.setTimeout(() => {
      setCombatAlert(null);
      clearRef.current = null;
    }, 3000);
  }, []);

  useEffect(() => () => {
    if (clearRef.current) window.clearTimeout(clearRef.current);
  }, []);

  return { combatAlert, combatAlertKind, onAlert };
}
