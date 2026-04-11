import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2, Search, User, X } from 'lucide-react';
import type { Patient } from '../../../../shared/types';

interface Props {
  patients: Patient[];
  selectedPatient: Patient | null;
  selectedPatientId: string | null;
  onSelectPatient: (id: string | null) => void;
  summaryLoading: boolean;
}

export const EvidencePatientAttach: React.FC<Props> = ({
  patients,
  selectedPatient,
  selectedPatientId,
  onSelectPatient,
  summaryLoading,
}) => {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [narrow, setNarrow] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const listboxId = useId();

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.dob.includes(q) ||
        (p.folderNumber || '').toLowerCase().includes(q)
    );
  }, [patients, filter]);

  const close = useCallback(() => {
    setOpen(false);
    setFilter('');
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    searchInputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open || !narrow) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, narrow]);

  const pick = (id: string | null) => {
    onSelectPatient(id);
    close();
  };

  const label =
    selectedPatientId && selectedPatient
      ? `${selectedPatient.name} · ${selectedPatient.dob}`
      : 'General evidence';

  const pickerContent = (
    <>
      <div className="border-b border-slate-100 px-3 py-2">
        <label htmlFor={`${listboxId}-search`} className="sr-only">
          Search patients
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchInputRef}
            id={`${listboxId}-search`}
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search by name, folder, DOB…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#7ec4e0] focus:bg-white"
            autoComplete="off"
          />
        </div>
      </div>
      <div
        role="listbox"
        id={listboxId}
        className="max-h-[min(280px,45vh)] overflow-y-auto custom-scrollbar py-1 md:max-h-[min(240px,40vh)]"
      >
        <button
          type="button"
          role="option"
          aria-selected={!selectedPatientId}
          onClick={() => pick(null)}
          className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition hover:bg-slate-50 ${
            !selectedPatientId ? 'bg-[#eaf6fb] text-[#1e6a8a]' : 'text-slate-700'
          }`}
        >
          <User className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
          <span>General evidence only</span>
        </button>
        {filtered.map((p) => (
          <button
            key={p.id}
            type="button"
            role="option"
            aria-selected={selectedPatientId === p.id}
            onClick={() => pick(p.id)}
            className={`flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm transition hover:bg-slate-50 ${
              selectedPatientId === p.id ? 'bg-[#eaf6fb] text-[#1e6a8a]' : 'text-slate-800'
            }`}
          >
            <span className="font-medium">{p.name}</span>
            <span className="text-xs text-slate-500">{p.dob}</span>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="px-3 py-3 text-center text-sm text-slate-400">No patients match</p>
        )}
      </div>
    </>
  );

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-2">
        <button
          ref={triggerRef}
          type="button"
          id="evidence-patient-trigger"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-haspopup="dialog"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex min-h-[40px] min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-slate-200/90 bg-white px-2.5 py-1.5 text-left text-sm text-slate-800 shadow-sm outline-none transition hover:border-[#7ec4e0] focus-visible:ring-2 focus-visible:ring-[#b8dff0]/60 disabled:opacity-60 sm:flex-initial sm:min-w-[min(100%,280px)]"
        >
          <span className="flex min-w-0 items-center gap-2">
            <User className="h-4 w-4 shrink-0 text-[#3294c7]" aria-hidden />
            <span className="truncate font-medium">{label}</span>
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
        {selectedPatientId && (
          <button
            type="button"
            onClick={() => onSelectPatient(null)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
            aria-label="Clear patient context"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {selectedPatientId && summaryLoading && (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Summary…
          </span>
        )}
      </div>

      {open && narrow && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-slate-900/30"
            aria-label="Close patient picker"
            onClick={close}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[min(60vh,520px)] flex-col rounded-t-2xl border border-slate-200 bg-white px-0 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl"
          >
            <div className="mx-auto mb-2 h-1 w-10 shrink-0 rounded-full bg-slate-200" aria-hidden />
            <h2 id={titleId} className="px-4 pb-2 text-sm font-semibold text-slate-800">
              Patient context
            </h2>
            {pickerContent}
          </div>
        </>
      )}

      {open && !narrow && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 cursor-default"
            aria-hidden
            tabIndex={-1}
            onClick={close}
          />
          <div className="absolute left-0 right-0 z-40 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            {pickerContent}
          </div>
        </>
      )}
    </div>
  );
};
