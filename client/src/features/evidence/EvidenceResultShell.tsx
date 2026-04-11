import React, { useState } from 'react';
import type { EvidenceQueryResponse } from '../../../../shared/types';
import { EvidenceAnswerTab } from './EvidenceAnswerTab';
import { EvidenceLinksTab } from './EvidenceLinksTab';
import { EvidenceImagesTab } from './EvidenceImagesTab';

type ResultTab = 'answer' | 'links' | 'images';

interface Props {
  data: EvidenceQueryResponse;
  hasPatient: boolean;
}

const tabs: { id: ResultTab; label: string }[] = [
  { id: 'answer', label: 'Answer' },
  { id: 'links', label: 'Links' },
  { id: 'images', label: 'Images' },
];

export const EvidenceResultShell: React.FC<Props> = ({ data, hasPatient }) => {
  const [activeTab, setActiveTab] = useState<ResultTab>('answer');

  return (
    <div className="mt-6 motion-safe:animate-[evidenceFade_0.35s_ease-out]">
      <style>{`
        @keyframes evidenceFade {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div
        className="sticky top-0 z-10 -mx-1 mb-4 border-b border-slate-200/90 bg-[linear-gradient(180deg,#fbfdff_0%,#f8fbfd_100%)] px-1 pb-0 pt-1 backdrop-blur-sm"
        role="tablist"
        aria-label="Evidence result sections"
      >
        <div className="flex gap-1 overflow-x-auto pb-px">
          {tabs.map(tab => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                id={`evidence-tab-${tab.id}`}
                aria-controls={`evidence-panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                  selected
                    ? 'bg-white text-[#1a6f94] shadow-[0_-1px_0_0_white] ring-1 ring-slate-200/80'
                    : 'text-slate-500 hover:bg-white/60 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        {activeTab === 'answer' && (
          <div
            role="tabpanel"
            id="evidence-panel-answer"
            aria-labelledby="evidence-tab-answer"
          >
            <EvidenceAnswerTab data={data} hasPatient={hasPatient} />
          </div>
        )}
        {activeTab === 'links' && (
          <div role="tabpanel" id="evidence-panel-links" aria-labelledby="evidence-tab-links">
            <EvidenceLinksTab sources={data.sources} highlightId={null} />
          </div>
        )}
        {activeTab === 'images' && (
          <div role="tabpanel" id="evidence-panel-images" aria-labelledby="evidence-tab-images">
            <EvidenceImagesTab images={data.images} />
          </div>
        )}
      </div>
    </div>
  );
};
