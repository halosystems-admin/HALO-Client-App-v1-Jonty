import React from 'react';
import { ExternalLink } from 'lucide-react';
import type { EvidenceSource } from '../../../../shared/types';
import { SOURCE_TYPE_LABEL } from './evidenceConstants';
import { resolveEvidenceSourceUrl } from './evidenceSourceUrl';

interface Props {
  sources: EvidenceSource[];
  highlightId: string | null;
}

export const EvidenceLinksTab: React.FC<Props> = ({ sources, highlightId }) => (
  <div className="space-y-3">
    {sources.length === 0 ? (
      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-500">
        No linked sources were returned for this answer. The narrative may still summarise general clinical principles.
      </p>
    ) : (
      sources.map((src) => {
        const href = resolveEvidenceSourceUrl(src);
        const isFallbackPubMed = !src.url || !/^https?:\/\//i.test(src.url);
        return (
          <article
            key={src.id}
            id={`evidence-source-${src.id}`}
            tabIndex={-1}
            className={`scroll-mt-24 rounded-2xl border px-4 py-4 transition-shadow md:px-5 ${
              highlightId === src.id
                ? 'border-[#7ec4e0] bg-[#f4fbfe] shadow-md ring-2 ring-[#b8dff0]'
                : 'border-slate-200/90 bg-white shadow-sm hover:border-[#cfe3ef]'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  {SOURCE_TYPE_LABEL[src.type]}
                </span>
                <h3 className="mt-2 text-[15px] font-semibold leading-snug text-slate-900">
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-900 underline decoration-slate-300 underline-offset-2 transition hover:text-[#2f84b4] hover:decoration-[#7ec4e0]"
                  >
                    {src.title}
                  </a>
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {[src.organizationOrJournal, src.year].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-[#2f84b4] transition hover:bg-[#f4fbfe]"
              >
                {isFallbackPubMed ? 'Search PubMed' : 'Open'}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            </div>
            {src.relevanceNote && (
              <p className="mt-3 border-t border-slate-100 pt-3 text-sm leading-relaxed text-slate-600">
                {src.relevanceNote}
              </p>
            )}
          </article>
        );
      })
    )}
  </div>
);
