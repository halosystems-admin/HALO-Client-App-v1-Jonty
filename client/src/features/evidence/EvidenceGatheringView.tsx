import React, { useEffect, useState } from 'react';

const STATUS_LINES = [
  'Reviewing guidelines',
  'Scanning primary literature',
  'Checking drug and safety sources',
  'Synthesising answer',
];

interface Props {
  active: boolean;
  /** Submitted query — shown large and calm while processing */
  queryText: string;
}

export const EvidenceGatheringView: React.FC<Props> = ({ active, queryText }) => {
  const [lineIndex, setLineIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (!active || reducedMotion) return;
    const id = window.setInterval(() => {
      setLineIndex((i) => (i + 1) % STATUS_LINES.length);
    }, 2200);
    return () => window.clearInterval(id);
  }, [active, reducedMotion]);

  useEffect(() => {
    if (!active) setLineIndex(0);
  }, [active]);

  return (
    <div
      className="mt-8 space-y-6"
      aria-busy={active}
      aria-live="polite"
      aria-label="Working on your question"
    >
      {queryText ? (
        <p className="text-lg font-medium leading-snug tracking-tight text-slate-800 md:text-xl">
          {queryText}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <span
          className="inline-flex h-2 w-2 shrink-0 rounded-full bg-[#3294c7] motion-safe:animate-pulse"
          aria-hidden
        />
        <p className="text-sm text-slate-500">
          {reducedMotion ? STATUS_LINES[0] : STATUS_LINES[lineIndex]}
        </p>
      </div>

      <div className="h-0.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-100 motion-reduce:hidden" aria-hidden>
        <div className="h-full w-1/3 animate-[evidenceBar_1.4s_ease-in-out_infinite] rounded-full bg-[#7ec4e0]/80" />
        <style>{`
          @keyframes evidenceBar {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(400%); }
          }
        `}</style>
      </div>
    </div>
  );
};
