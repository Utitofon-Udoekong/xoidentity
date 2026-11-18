export function Logo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="1.25" y="1.25" width="29.5" height="29.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 10l12 12M22 10L10 22" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
