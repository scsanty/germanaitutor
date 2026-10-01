import { useId } from 'react';

// Spec: Brand. The user's logo as an inline component. Text renders in the self-hosted Nunito,
// so there is no font request at runtime. "compact" drops the tagline for the header and sidebar.
export function Logo({ variant = 'full', className, title = 'NaDoch!' }: { variant?: 'full' | 'compact'; className?: string; title?: string }) {
  const uid = useId().replace(/:/g, '');
  const bubble = `bubble-${uid}`;
  const accent = `accent-${uid}`;
  const viewBox = variant === 'full' ? '100 50 640 330' : '105 55 630 250';
  return (
    <svg role="img" aria-label={title} viewBox={viewBox} className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={bubble} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0284c7" />
          <stop offset="48%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#0d9488" />
        </linearGradient>
        <linearGradient id={accent} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="50%" stopColor="#ea580c" />
        </linearGradient>
      </defs>
      <path
        d="M 188,72 L 642,66 C 685,66 718,98 720,140 L 722,216 C 722,258 688,292 646,294 L 285,302 L 192,368 C 180,376 166,368 170,352 L 178,300 C 138,296 112,260 114,218 L 118,142 C 120,98 152,72 188,72 Z"
        stroke={`url(#${accent})`}
        strokeWidth="5"
        strokeLinejoin="round"
        transform="translate(-4, 6)"
      />
      <path
        d="M 192,68 L 646,62 C 686,62 718,94 720,134 L 722,212 C 722,252 690,286 650,288 L 285,296 L 196,360 C 187,366 174,360 177,348 L 184,295 C 144,290 118,256 120,216 L 124,138 C 126,96 156,68 192,68 Z"
        fill={`url(#${bubble})`}
      />
      <g transform="rotate(-3.5 255 186)">
        <text x="255" y="186" textAnchor="middle" fill="#ffffff" style={{ fontFamily: 'var(--font-nunito)', fontWeight: 900, fontSize: 88, letterSpacing: -1 }}>
          Na
        </text>
      </g>
      <g transform="rotate(1 435 188)">
        <text x="435" y="188" textAnchor="middle" fill="#ffffff" style={{ fontFamily: 'var(--font-nunito)', fontWeight: 900, fontSize: 96, letterSpacing: -1.5 }}>
          Doch
        </text>
      </g>
      <g transform="rotate(11 590 162)">
        <path d="M 584,98 C 584,88 606,88 606,98 L 600,152 C 600,156 595,159 590,159 C 585,159 580,156 580,152 Z" fill={`url(#${accent})`} stroke="#ffffff" strokeWidth="5" />
        <circle cx="590" cy="180" r="10.5" fill={`url(#${accent})`} stroke="#ffffff" strokeWidth="5" />
      </g>
      {variant === 'full' && (
        <g transform="translate(0, 4)">
          <rect x="190" y="226" width="455" height="40" rx="20" fill="#ffffff" fillOpacity="0.14" stroke="#ffffff" strokeOpacity="0.28" />
          <text x="417" y="253" textAnchor="middle" style={{ fontFamily: 'var(--font-nunito)', fontSize: 19 }}>
            <tspan fill="#bae6fd" fontWeight={600}>Von </tspan>
            <tspan fill="#ffffff" fontWeight={800}>„Na?“</tspan>
            <tspan fill="#bae6fd" fontWeight={600}> über </tspan>
            <tspan fill="#ffffff" fontWeight={800}>„Ach so!“</tspan>
            <tspan fill="#bae6fd" fontWeight={600}> zu </tspan>
            <tspan fill="#ffffff" fontWeight={800}>„Doch!“</tspan>
          </text>
        </g>
      )}
    </svg>
  );
}
