import React, { useState } from 'react';
import { Loader2, Search, Sparkles } from 'lucide-react';
import type { EvidenceQueryResponse } from '../../../../shared/types';
import type { Patient } from '../../../../shared/types';
import { evidenceQuery } from '../../services/api';
import { getErrorMessage } from '../../utils/formatting';
import { EvidenceQueryCard } from './EvidenceQueryCard';
import { EvidenceGatheringView } from './EvidenceGatheringView';
import { EvidenceResultShell } from './EvidenceResultShell';
import { EvidencePatientAttach } from './EvidencePatientAttach';

interface Props {
  patients: Patient[];
  selectedPatient: Patient | null;
  selectedPatientId: string | null;
  onSelectPatient: (id: string | null) => void;
  patientSummaryMarkdown: string;
  summaryLoading: boolean;
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

type Phase = 'idle' | 'searching' | 'ready' | 'error';

export const EvidencePanel: React.FC<Props> = ({
  patients,
  selectedPatient,
  selectedPatientId,
  onSelectPatient,
  patientSummaryMarkdown,
  summaryLoading,
  onToast,
}) => {
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [lastQuery, setLastQuery] = useState('');
  const [result, setResult] = useState<EvidenceQueryResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasPatient = Boolean(selectedPatientId);
  const searching = phase === 'searching';
  const canSubmit = input.trim().length > 0 && !searching;

  const submit = async () => {
    const q = input.trim();
    if (!q || searching) return;

    setLastQuery(q);
    setPhase('searching');
    setErrorMessage(null);
    setResult(null);

    try {
      const res = await evidenceQuery({
        query: q,
        patientId: selectedPatientId ?? undefined,
        patientName: selectedPatient?.name,
        patientSummary:
          selectedPatientId && patientSummaryMarkdown.trim()
            ? patientSummaryMarkdown
            : undefined,
      });
      setResult(res);
      setPhase('ready');
      setInput('');
    } catch (err) {
      setPhase('error');
      setErrorMessage(getErrorMessage(err));
      onToast(getErrorMessage(err), 'error');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[linear-gradient(180deg,#fbfdff_0%,#f5fbfe_100%)]">
      <div className="custom-scrollbar flex-1 overflow-y-auto px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6 md:px-8 md:pb-28">
        <div className="mx-auto max-w-3xl">
          {phase === 'idle' && !lastQuery && (
            <div className="mb-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eaf6fb] text-[#3294c7] shadow-sm">
                <Sparkles className="h-6 w-6" aria-hidden />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-slate-800">Evidence</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
                Ask a clinical question. Optionally choose a patient so their HALO summary and folder can inform
                the answer.
              </p>
            </div>
          )}

          {lastQuery && <EvidenceQueryCard query={lastQuery} subtle={phase === 'ready'} />}

          {searching && <EvidenceGatheringView active queryText={lastQuery} />}

          {phase === 'error' && errorMessage && (
            <div
              className="mt-6 rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-800"
              role="alert"
            >
              {errorMessage}
            </div>
          )}

          {phase === 'ready' && result && (
            <EvidenceResultShell data={result} hasPatient={hasPatient} />
          )}
        </div>
      </div>

      <div className="border-t border-[#e6eff5] bg-white/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md md:px-8 md:pb-3 md:pt-3">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 rounded-xl border border-[#e4edf3]/70 bg-[#f8fbfd] p-2 shadow-sm md:gap-2.5 md:p-3">
          <div>
            <p className="mb-1 text-[11px] font-medium text-slate-500 md:text-xs">
              <span className="md:hidden">Patient </span>
              <span className="hidden md:inline">Patient context </span>
              <span className="text-slate-400">(optional)</span>
            </p>
            <EvidencePatientAttach
              patients={patients}
              selectedPatient={selectedPatient}
              selectedPatientId={selectedPatientId}
              onSelectPatient={onSelectPatient}
              summaryLoading={summaryLoading}
            />
          </div>

          <label htmlFor="evidence-input" className="sr-only">
            Clinical question
          </label>
          <textarea
            id="evidence-input"
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            disabled={searching}
            placeholder={
              hasPatient
                ? 'Ask an evidence question (patient summary and folder may be used when relevant)…'
                : 'Ask an evidence question…'
            }
            className="w-full resize-none rounded-lg border border-[#d8e7ef] bg-white px-3 py-2 text-sm leading-snug text-slate-800 shadow-inner outline-none ring-0 transition placeholder:text-slate-400 focus:border-[#7ec4e0] focus:ring-1 focus:ring-[#b8dff0]/50 disabled:opacity-60"
          />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-center text-[11px] text-slate-400 sm:max-w-[min(100%,20rem)] sm:text-left">
              {hasPatient ? (
                <>
                  <span className="font-medium text-slate-600">{selectedPatient?.name}</span>
                  {selectedPatientId && !summaryLoading && patientSummaryMarkdown && (
                    <span className="text-emerald-600"> · Summary loaded</span>
                  )}
                  {selectedPatientId && summaryLoading && (
                    <span className="text-slate-400"> · Loading summary…</span>
                  )}
                </>
              ) : (
                'General medical evidence — no patient folder attached.'
              )}
            </p>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSubmit}
              className="inline-flex min-h-[44px] w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#3f9fcc] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#3589b3] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[140px]"
            >
              {searching ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Searching
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" aria-hidden />
                  Search evidence
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
