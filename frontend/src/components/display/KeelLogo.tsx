export function KeelLogo({ className = 'size-7' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M6 24 C6 24, 10 8, 16 8 C22 8, 26 24, 26 24"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <line x1="16" y1="6" x2="16" y2="26" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line
        x1="10"
        y1="16"
        x2="22"
        y2="16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}
