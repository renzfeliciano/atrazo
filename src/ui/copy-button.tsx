"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/ui/icons";

/** Copies `value` and confirms on the button itself for a moment. */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={() => void navigator.clipboard?.writeText(value).then(() => setCopied(true))}
      aria-live="polite"
    >
      <Icon name={copied ? "check" : "copy"} size={16} />
      {copied ? "Copied" : label}
    </button>
  );
}
