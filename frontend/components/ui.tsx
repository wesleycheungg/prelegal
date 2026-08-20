"use client";

import type { ReactNode } from "react";

/**
 * The pieces every screen is built from.
 *
 * These exist because the same class strings were written out in three files
 * and had already drifted: buttons carried a visible focus ring and inputs only
 * swapped a border colour, so half the controls told a keyboard user nothing
 * about where they were. One definition each fixes that by construction.
 */

/**
 * The focus treatment, on everything that takes focus.
 *
 * `focus-visible` rather than `focus` so a mouse click does not leave a ring
 * behind, and an offset outline rather than a border change so the control does
 * not move by a pixel when it gains focus.
 */
export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export const inputClass =
  "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-navy " +
  `shadow-xs placeholder:text-muted focus-visible:border-brand focus:outline-none ${focusRing}`;

const VARIANTS = {
  /** The action a screen is for: save, sign in, send. */
  primary: "bg-submit text-white hover:bg-submit/90 shadow-xs",
  /** Everything else that is still a real action. */
  secondary: "border border-line bg-surface text-navy hover:bg-canvas",
  /** Destructive, and rare enough to be worth the red. */
  danger: "border border-red-200 bg-surface text-red-700 hover:bg-red-50",
} as const;

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: {
  variant?: keyof typeof VARIANTS;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${focusRing} ${className}`}
    >
      {children}
    </button>
  );
}

/** A white card. The app's one container. */
export function Panel({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border border-line bg-surface shadow-xs ${className}`}
    >
      {children}
    </div>
  );
}

/** A caption and its help text, shared by inputs and by radio fieldsets. */
export function Label({
  as: Caption = "label",
  htmlFor,
  label,
  hint,
}: {
  as?: "label" | "legend";
  htmlFor?: string;
  label: string;
  hint?: string | null;
}) {
  return (
    <>
      <Caption
        htmlFor={htmlFor}
        className="block text-sm font-medium text-navy"
      >
        {label}
      </Caption>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </>
  );
}

/**
 * A message the user needs to read.
 *
 * `alert` for anything that went wrong, so a screen reader is told without
 * having to find it; `status` for the rest, which is announced more gently.
 */
export function Notice({
  tone,
  children,
}: {
  tone: "error" | "info" | "warning";
  children: ReactNode;
}) {
  const tones = {
    error: "border-red-200 bg-red-50 text-red-700",
    info: "border-brand/30 bg-brand/5 text-navy",
    warning: "border-accent/40 bg-accent/10 text-navy",
  } as const;

  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-lg border px-3 py-2 text-sm ${tones[tone]}`}
    >
      {children}
    </p>
  );
}

/** A page's heading, above the thing it names. */
export function PageHeading({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-navy">
        {title}
      </h1>
      {children && <p className="mt-1 text-sm text-muted">{children}</p>}
    </div>
  );
}
