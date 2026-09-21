import type { ReactNode } from "react";
import { cn } from "@/src/lib/utils";

export function OnboardingScreenshot({
  src,
  alt,
  aspect = "16/10",
  className,
  badge,
  objectPosition = "left top",
}: {
  src: string;
  alt: string;
  aspect?: string;
  className?: string;
  badge?: string;
  objectPosition?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[10px] border border-line bg-[#ececec] shadow-[0_22px_50px_rgba(23,23,23,0.12)]",
        className,
      )}
    >
      {badge ? (
        <span
          className="absolute top-3 left-3 z-10 rounded-full bg-ink px-2.5 py-1 font-mono text-[11px] text-canvas"
          aria-hidden="true"
        >
          {badge}
        </span>
      ) : null}
      <div className="bg-[#ececec] p-2 sm:p-3">
        <div
          className="overflow-hidden rounded-[6px] border border-[#d4d4d8] bg-canvas"
          style={{ aspectRatio: aspect }}
        >
          <img
            src={src}
            alt={alt}
            className="h-full w-full object-cover"
            style={{ objectPosition }}
            loading="eager"
            decoding="async"
          />
        </div>
      </div>
    </div>
  );
}

export function OnboardingStep({
  number,
  title,
  children,
  visual,
  reverse = false,
}: {
  number: string;
  title: string;
  children: ReactNode;
  visual: ReactNode;
  reverse?: boolean;
}) {
  return (
    <li className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-center">
      <div className={reverse ? "order-2 lg:order-2" : "order-2 lg:order-1"}>
        {visual}
      </div>
      <div className={reverse ? "order-1 lg:order-1" : "order-1 lg:order-2"}>
        <p className="font-mono text-[11px] text-mute">{number}</p>
        <h3 className="font-display mt-2 text-3xl">{title}</h3>
        <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-mute">
          {children}
        </div>
      </div>
    </li>
  );
}
