const BODY_PRINT_MODE_CLASS = "print-mode-active";
const TARGET_PRINT_MODE_CLASS = "print-target-active";
const PRINT_CLEANUP_TIMEOUT_MS = 10_000;

/**
 * Print only a specific overlay element.
 *
 * Some browsers still include background layers when printing fixed overlays.
 * We mark the target + body before calling window.print() so print CSS can
 * isolate exactly what should appear in the output.
 */
export function printTargetElement(target: HTMLElement | null): void {
  if (target === null) {
    window.print();
    return;
  }

  const body = document.body;
  body.classList.add(BODY_PRINT_MODE_CLASS);
  target.classList.add(TARGET_PRINT_MODE_CLASS);

  let cleaned = false;
  let timeoutId: number | null = null;

  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    window.removeEventListener("afterprint", cleanup);
    body.classList.remove(BODY_PRINT_MODE_CLASS);
    target.classList.remove(TARGET_PRINT_MODE_CLASS);
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  window.addEventListener("afterprint", cleanup, { once: true });
  timeoutId = window.setTimeout(cleanup, PRINT_CLEANUP_TIMEOUT_MS);
  window.print();
}
