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
      <defs>
        <radialGradient id="selfchecks-bg" cx="50%" cy="45%" r="72%">
          <stop offset="0" stopColor="#06182A" />
          <stop offset="1" stopColor="#020B17" />
        </radialGradient>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id="selfchecks-ring"
          x1="8"
          x2="56"
          y1="24"
          y2="40"
        >
          <stop offset="0" stopColor="#34D399" />
          <stop offset="0.48" stopColor="#19DDB7" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id="selfchecks-pulse"
          x1="14"
          x2="55"
          y1="32"
          y2="32"
        >
          <stop offset="0" stopColor="#34D399" />
          <stop offset="0.45" stopColor="#18DDB9" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>

      <rect width="64" height="64" fill="url(#selfchecks-bg)" />
      <circle
        cx="32"
        cy="32"
        r="23"
        fill="none"
        stroke="url(#selfchecks-ring)"
        strokeWidth="3.6"
      />
      <path
        d="M16 32h6.2l3.2-5.6 3.3 11 4.1-18.2 5.4 24.2 3.5-11.4H49"
        fill="none"
        stroke="url(#selfchecks-pulse)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4.2"
      />
    </svg>
  );
}
