import { useId } from "react";

const EYE = "M7 32C15 17.5 49 17.5 57 32C49 46.5 15 46.5 7 32Z";

/**
 * The Seer mark: an eye whose iris is a ball, so it serves football and basketball alike.
 * Same drawing as app/icon.svg; the colours stay fixed so the mark reads the same in both themes,
 * with a faint rim that only shows against the dark background.
 */
export function LogoMark({ className = "" }: { className?: string }) {
  const clip = useId();
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={className}>
      <defs>
        <clipPath id={clip}><path d={EYE} /></clipPath>
      </defs>
      <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="15" fill="#121211" stroke="rgb(255 255 255 / 0.14)" strokeWidth="1.5" />
      <path d={EYE} fill="#f5f5f2" />
      <g clipPath={`url(#${clip})`}>
        <circle cx="32" cy="32" r="12" fill="#0b7a52" />
        <circle cx="32" cy="32" r="12" fill="none" stroke="#08613f" strokeWidth="1.5" />
        <g fill="none" stroke="#121211" strokeWidth="1.6" strokeLinecap="round" opacity=".65">
          <path d="M20 32Q32 38 44 32" />
          <path d="M32 20Q26 32 32 44" />
        </g>
        <circle cx="32" cy="32" r="4.6" fill="#121211" />
        <circle cx="35.6" cy="27.8" r="2" fill="#fff" />
      </g>
    </svg>
  );
}
