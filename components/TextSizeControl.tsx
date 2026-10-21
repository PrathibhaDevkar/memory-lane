"use client";

// Lets the reader make all the text bigger. Three plain choices, each shown at its own size.

import { useSyncExternalStore } from "react";
import { applyTextSize, currentTextSize, onTextSizeChange, TEXT_SIZES } from "@/lib/text-size";

const SAMPLE_SIZE = { standard: "text-base", large: "text-lg", largest: "text-xl" } as const;

export function TextSizeControl() {
  // The server renders Standard; the browser then shows whatever the head script applied.
  const size = useSyncExternalStore(onTextSizeChange, currentTextSize, () => "standard" as const);
  return (
    <div role="group" aria-labelledby="text-size-label" className="no-print">
      <p id="text-size-label" className="mb-1 font-medium">
        Text size
      </p>
      <div className="flex flex-wrap gap-2">
        {TEXT_SIZES.map((s) => (
          <button
            key={s.value}
            type="button"
            aria-pressed={size === s.value}
            onClick={() => applyTextSize(s.value)}
            className={`btn btn-secondary px-4 aria-pressed:border-accent aria-pressed:bg-accent-soft ${SAMPLE_SIZE[s.value]}`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
