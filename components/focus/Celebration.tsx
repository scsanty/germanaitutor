'use client';

// Spec: a short celebration when a lesson completes: orange and teal particles, CSS only,
// removed entirely under prefers-reduced-motion by globals.css.
export function Celebration({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {Array.from({ length: 24 }, (_, i) => (
        <span
          key={i}
          className={i % 2 ? 'bg-highlight' : 'bg-primary'}
          style={{
            position: 'absolute',
            left: `${(i * 37) % 100}%`,
            top: '-2rem',
            width: '0.5rem',
            height: '0.9rem',
            borderRadius: '2px',
            animation: `nadoch-fall ${1.2 + (i % 5) * 0.15}s ease-in ${(i % 6) * 0.05}s forwards`,
          }}
        />
      ))}
      <style>{`@keyframes nadoch-fall { to { transform: translateY(110vh) rotate(540deg); opacity: 0; } }`}</style>
    </div>
  );
}
