import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
    ...props,
  };
}

export function CameraIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 7.5h2.2l1.3-2h8.9l1.3 2H20a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 18.5H4A1.5 1.5 0 0 1 2.5 17V9A1.5 1.5 0 0 1 4 7.5Z" />
      <circle cx="12" cy="12.7" r="3.4" />
    </svg>
  );
}

export function PhotoIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <circle cx="8.6" cy="9.6" r="1.6" />
      <path d="m4 17 5.2-5 3.4 3.2 2.8-2.5L20 17.4" />
    </svg>
  );
}

export function RotateIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M20 11.5A8 8 0 1 0 17.7 17" />
      <path d="M20 5v6.5h-6" />
    </svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <path d="M12 7.6h.01" />
    </svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10.3 4.4 2.9 17.2A1.6 1.6 0 0 0 4.3 19.6h15.4a1.6 1.6 0 0 0 1.4-2.4L13.7 4.4a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4.4" />
      <path d="M12 16.6h.01" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m4.5 12.5 4.6 4.6L19.5 6.7" />
    </svg>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </svg>
  );
}

export function ScaleIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3v18" />
      <path d="M5 7h14" />
      <path d="M8.5 7 5 14h7L8.5 7Z" />
      <path d="M15.5 7 12 14h7l-3.5-7Z" />
      <path d="M8 21h8" />
    </svg>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.2 5 6v5.4c0 4.2 2.8 7.4 7 9.4 4.2-2 7-5.2 7-9.4V6l-7-2.8Z" />
      <path d="m9 12 2.2 2.2L15.4 10" />
    </svg>
  );
}

export function CowIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5.2 9.3c0-2.2 1.5-3.8 3.5-3.8h6.6c2 0 3.5 1.6 3.5 3.8v2" />
      <path d="M4 6.2c-1.2-1.2-1.2-2.4-.5-3 .8-.6 2 .1 2.9 1.4" />
      <path d="M20 6.2c1.2-1.2 1.2-2.4.5-3-.8-.6-2 .1-2.9 1.4" />
      <path d="M6.4 11.4h11.2v3.4a4.4 4.4 0 0 1-4.4 4.4h-2.4a4.4 4.4 0 0 1-4.4-4.4v-3.4Z" />
      <path d="M9 15.2h.01M15 15.2h.01M10 18h4" />
    </svg>
  );
}
