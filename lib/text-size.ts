// The reader's text size, chosen in the header. A display preference for this browser only, kept in
// localStorage: nothing about the person a kit is for is stored. Every size is in rem, so the whole
// page grows with it (app/globals.css).

export const TEXT_SIZES = [
  { value: "standard", label: "Standard" },
  { value: "large", label: "Large" },
  { value: "largest", label: "Largest" },
] as const;

export type TextSize = (typeof TEXT_SIZES)[number]["value"];

export const TEXT_SIZE_KEY = "ml:text-size";
const CHANGED = "ml:text-size-changed";

export const isTextSize = (v: unknown): v is TextSize => TEXT_SIZES.some((s) => s.value === v);

/**
 * Runs in the page head before anything paints (app/layout.tsx), so a saved size applies without a
 * jump. Wrapped in try/catch: storage can be blocked, and then the page simply starts at Standard.
 */
export const TEXT_SIZE_SCRIPT = `try{var s=localStorage.getItem(${JSON.stringify(TEXT_SIZE_KEY)});if(s==="large"||s==="largest")document.documentElement.dataset.textSize=s}catch(e){}`;

/** The size the page is showing now. */
export function currentTextSize(): TextSize {
  const v = typeof document === "undefined" ? undefined : document.documentElement.dataset.textSize;
  return isTextSize(v) ? v : "standard";
}

/** Shows the page at this size and remembers it for next time, if the browser allows. */
export function applyTextSize(size: TextSize) {
  const root = document.documentElement;
  if (size === "standard") delete root.dataset.textSize;
  else root.dataset.textSize = size;
  try {
    localStorage.setItem(TEXT_SIZE_KEY, size);
  } catch {
    // Private windows and blocked storage: the size still applies for this visit.
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** For useSyncExternalStore: re-render when the size changes. */
export function onTextSizeChange(callback: () => void) {
  window.addEventListener(CHANGED, callback);
  return () => window.removeEventListener(CHANGED, callback);
}
