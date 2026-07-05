import type { SVGProps } from "react";

export function ServiceMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect width="64" height="64" rx="14" fill="#07111F" />
      <path
        d="M13 34h9l5-13 8 27 6-14h10"
        fill="none"
        stroke="#22D3EE"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="5"
      />
      <path
        d="m22 43 8 8 18-22"
        fill="none"
        stroke="#34D399"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="6"
      />
      <circle cx="48" cy="16" r="6" fill="#34D399" />
    </svg>
  );
}
