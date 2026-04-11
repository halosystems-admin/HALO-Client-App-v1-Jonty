import React from 'react';
import type { EvidenceQueryResponse } from '../../../../shared/types';
import { SOURCE_TYPE_LABEL } from './evidenceConstants';
import { resolveEvidenceSourceUrl } from './evidenceSourceUrl';

interface Props {
  data: EvidenceQueryResponse;
  hasPatient: boolean;
}

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  if (children == null || (typeof children === 'string' && !children.trim())) return null;
  return (
    <section className="border-b border-slate-100 pb-8 last:border-0 last:pb-0">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">{title}</h3>
      <div className="mt-3 max-w-[65ch] text-[15px] leading-relaxed text-slate-800 md:text-base">
        {children}
      </div>
    </section>
  );
}

function paragraphize(text: string) {
  const parts = text.split(/\n\n+/).filter(Boolean);
  if (parts.length <= 1) {
    return <p className="whitespace-pre-wrap">{text}</p>;
  }
  return (
    <div className="space-y-4">
      {parts.map((p, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {p}
        </p>
      ))}
    </div>
  );
}

export const EvidenceAnswerTab: React.FC<Props> = ({ data, hasPatient }) => {
  const { sections, sources, answerSegments } = data;
  const sourceById = new Map(sources.map(s => [s.id, s]));

  const renderCitationChips = (ids: string[]) => {
    if (!ids.length) return null;
    return (
      <span className="ml-1 inline-flex flex-wrap items-center gap-1 align-middle">
        {ids.map(id => {
          const src = sourceById.get(id);
          const label = src ? `${src.id}` : id;
          const href = src ? resolveEvidenceSourceUrl(src) : `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(id)}`;
          return (
            <a
              key={id}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-md border border-[#c5e4f3] bg-[#f4fbfe] px-1.5 py-0.5 text-[11px] font-semibold text-[#1a6f94] transition hover:bg-[#eaf6fb]"
              title={src?.title ? `Open source: ${src.title}` : 'Open source'}
            >
              [{label}]
            </a>
          );
        })}
      </span>
    );
  };

  const segmentsBlock =
    answerSegments && answerSegments.length > 0 ? (
      <div className="max-w-[65ch] text-[15px] leading-relaxed text-slate-800 md:text-base">
        {answerSegments.map((seg, idx) => (
          <span key={idx} className="inline">
            <span className="whitespace-pre-wrap">{seg.text}</span>
            {renderCitationChips(seg.sourceIds)}
          </span>
        ))}
      </div>
    ) : null;

  const hasKeyEvidence =
    Boolean(answerSegments && answerSegments.length > 0) || Boolean(sections.keyEvidence?.trim());

  return (
    <div className="space-y-10">
      <SectionBlock title="Bottom line">
        {paragraphize(sections.bottomLine)}
      </SectionBlock>

      {hasKeyEvidence && (
        <SectionBlock title="Key evidence">
          {segmentsBlock ?? paragraphize(sections.keyEvidence)}
        </SectionBlock>
      )}

      {hasPatient && sections.patientApplication && (
        <SectionBlock title="How this applies to this patient">
          {paragraphize(sections.patientApplication)}
        </SectionBlock>
      )}

      <SectionBlock title="Caveats and uncertainty">
        {paragraphize(sections.caveats)}
      </SectionBlock>

      <SectionBlock title="Practical takeaways">
        {paragraphize(sections.practicalTakeaways)}
      </SectionBlock>

      {sources.length > 0 && (
        <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-xs text-slate-500">
          <span className="font-semibold text-slate-600">Sources in this answer: </span>
          {sources.map(s => (
            <span key={s.id} className="mr-2 inline">
              <a
                href={resolveEvidenceSourceUrl(s)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#2f84b4] underline decoration-[#b8dff0] underline-offset-2 hover:text-[#236f9b]"
              >
                [{s.id}] {SOURCE_TYPE_LABEL[s.type]}
              </a>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
