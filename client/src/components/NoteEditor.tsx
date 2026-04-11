import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CloudOff,
  Eye,
  FileDown,
  FileText,
  Loader2,
  Mail,
  RefreshCw,
  Save,
} from 'lucide-react';
import type { HaloNote, NoteField } from '../../../shared/types';
import { AppStatus } from '../../../shared/types';

function fieldsToContent(fields: NoteField[]): string {
  return fields
    .map((field) => (field.label ? `${field.label}:\n${field.body ?? ''}` : field.body))
    .filter(Boolean)
    .join('\n\n');
}

function getEditableNoteText(note: HaloNote): string {
  if (note.fields?.length) return fieldsToContent(note.fields);
  return note.content ?? '';
}

function buildPreviewSignature(note: HaloNote): string {
  return JSON.stringify({
    templateId: note.template_id,
    title: note.title,
    text: getEditableNoteText(note),
  });
}

interface NoteEditorProps {
  notes: HaloNote[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onNoteChange: (noteIndex: number, updates: { title?: string; content?: string; fields?: NoteField[] }) => void;
  status: AppStatus;
  templateId: string;
  templateOptions: Array<{ id: string; name: string }>;
  onTemplateChange?: (templateId: string) => void;
  onSaveAsDocx: (noteIndex: number) => void;
  onSaveAll: () => void;
  onEmail: (noteIndex: number) => void;
  onLoadPreviewPdf: (noteIndex: number) => Promise<Blob>;
  savingNoteIndex: number | null;
  showNoteTabs?: boolean;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
  notes,
  activeIndex,
  onActiveIndexChange,
  onNoteChange,
  status,
  templateId,
  templateOptions,
  onTemplateChange,
  onSaveAsDocx,
  onSaveAll,
  onEmail,
  onLoadPreviewPdf,
  savingNoteIndex,
  showNoteTabs = true,
}) => {
  const activeNote = notes[activeIndex];
  const [autosaveMsg, setAutosaveMsg] = useState<string | null>(null);
  const [viewModeByNoteId, setViewModeByNoteId] = useState<Record<string, 'edit' | 'preview'>>({});
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const previewUrlsRef = useRef<Record<string, string>>({});
  const [previewLoadingNoteId, setPreviewLoadingNoteId] = useState<string | null>(null);
  const [previewErrors, setPreviewErrors] = useState<Record<string, string>>({});
  const [previewSignatures, setPreviewSignatures] = useState<Record<string, string>>({});

  const busy = status === AppStatus.FILING || status === AppStatus.SAVING;

  useEffect(() => {
    if (!activeNote?.lastSavedAt || activeNote.dirty) return;
    const saved = new Date(activeNote.lastSavedAt);
    const diffMs = Date.now() - saved.getTime();
    if (diffMs < 5000) {
      setAutosaveMsg('Autosaved');
      const timeoutId = setTimeout(() => setAutosaveMsg(null), 3000);
      return () => clearTimeout(timeoutId);
    }
  }, [activeNote?.dirty, activeNote?.lastSavedAt]);

  const replacePreviewUrl = useCallback((noteId: string, nextUrl: string) => {
    const previousUrl = previewUrlsRef.current[noteId];
    if (previousUrl && previousUrl !== nextUrl) {
      URL.revokeObjectURL(previousUrl);
    }

    const nextState = {
      ...previewUrlsRef.current,
      [noteId]: nextUrl,
    };
    previewUrlsRef.current = nextState;
    setPreviewUrls(nextState);
  }, []);

  useEffect(() => {
    return () => {
      Object.values(previewUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current = {};
    };
  }, []);

  const loadPreview = useCallback(async (noteIndex: number) => {
    const note = notes[noteIndex];
    if (!note) return;

    setPreviewLoadingNoteId(note.noteId);
    setPreviewErrors((prev) => {
      if (!prev[note.noteId]) return prev;
      const next = { ...prev };
      delete next[note.noteId];
      return next;
    });

    try {
      const blob = await onLoadPreviewPdf(noteIndex);
      const url = URL.createObjectURL(blob);
      replacePreviewUrl(note.noteId, url);
      setPreviewSignatures((prev) => ({
        ...prev,
        [note.noteId]: buildPreviewSignature(note),
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to generate the PDF preview.';
      setPreviewErrors((prev) => ({ ...prev, [note.noteId]: message }));
    } finally {
      setPreviewLoadingNoteId((prev) => (prev === note.noteId ? null : prev));
    }
  }, [notes, onLoadPreviewPdf, replacePreviewUrl]);

  useEffect(() => {
    if (!activeNote) return;
    const hasPreview = Boolean(
      previewUrls[activeNote.noteId] || previewSignatures[activeNote.noteId]
    );
    if (
      hasPreview ||
      previewLoadingNoteId === activeNote.noteId ||
      !getEditableNoteText(activeNote).trim()
    ) {
      return;
    }
    void loadPreview(activeIndex);
  }, [activeIndex, activeNote, loadPreview, previewLoadingNoteId, previewSignatures, previewUrls]);

  const activeViewMode = activeNote
    ? viewModeByNoteId[activeNote.noteId] ?? 'edit'
    : 'edit';
  const activePreviewUrl = activeNote ? previewUrls[activeNote.noteId] : undefined;
  const activePreviewError = activeNote ? previewErrors[activeNote.noteId] : undefined;
  const activePreviewSignature = activeNote
    ? previewSignatures[activeNote.noteId]
    : undefined;
  const activeSignature = activeNote ? buildPreviewSignature(activeNote) : '';
  const previewIsStale = activeNote
    ? Boolean(activePreviewSignature && activePreviewSignature !== activeSignature)
    : false;

  useEffect(() => {
    if (!activeNote || activeViewMode !== 'preview') return;
    const isFresh = Boolean(
      activePreviewUrl && activePreviewSignature === activeSignature
    );
    if (isFresh || previewLoadingNoteId === activeNote.noteId) return;
    void loadPreview(activeIndex);
  }, [
    activeIndex,
    activeNote,
    activePreviewSignature,
    activePreviewUrl,
    activeSignature,
    activeViewMode,
    loadPreview,
    previewLoadingNoteId,
  ]);

  const activeFields = activeNote?.fields ?? [];
  const displayContent = useMemo(() => {
    if (!activeNote) return '';
    return getEditableNoteText(activeNote);
  }, [activeNote]);

  if (!activeNote) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center rounded-[28px] border border-slate-200 bg-white px-6 py-10 text-center shadow-sm">
        <p className="text-sm text-slate-400">
          No notes yet. Record a consultation to generate structured notes here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:px-5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#eef7fb] text-[#3a95c5]">
                <FileText className="h-4 w-4" />
              </div>
              <input
                type="text"
                value={activeNote.title}
                onChange={(e) => onNoteChange(activeIndex, { title: e.target.value })}
                placeholder="Note title"
                className="min-w-0 flex-1 border-0 bg-transparent text-lg font-semibold text-slate-800 outline-none placeholder:text-slate-400"
              />
              {showNoteTabs && templateOptions.length > 0 && onTemplateChange && (
                <select
                  value={templateId}
                  onChange={(e) => onTemplateChange(e.target.value)}
                  className="min-w-[180px] rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm outline-none"
                >
                  {templateOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() =>
                    setViewModeByNoteId((prev) => ({
                      ...prev,
                      [activeNote.noteId]: 'edit',
                    }))
                  }
                  className={`inline-flex h-9 items-center justify-center rounded-full px-3 text-xs font-semibold transition ${
                    activeViewMode === 'edit'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setViewModeByNoteId((prev) => ({
                      ...prev,
                      [activeNote.noteId]: 'preview',
                    }))
                  }
                  className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold transition ${
                    activeViewMode === 'preview'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Eye className="h-3.5 w-3.5" />
                  Preview
                </button>
              </div>

              <button
                type="button"
                onClick={() => void loadPreview(activeIndex)}
                disabled={previewLoadingNoteId === activeNote.noteId || !displayContent.trim()}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {previewLoadingNoteId === activeNote.noteId ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Regenerate
              </button>
            </div>
          </div>

          {showNoteTabs && (
            <div className="flex flex-wrap items-center gap-2">
              {notes.map((note, index) => (
                <button
                  key={note.noteId}
                  type="button"
                  onClick={() => onActiveIndexChange(index)}
                  className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    index === activeIndex
                      ? 'border-sky-200 bg-sky-50 text-sky-700'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
                  }`}
                >
                  {note.title || `Note ${index + 1}`}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onSaveAsDocx(activeIndex)}
                disabled={busy || !displayContent.trim()}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-sky-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingNoteIndex === activeIndex ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4" />
                )}
                Save as DOCX
              </button>
              <button
                type="button"
                onClick={() => onEmail(activeIndex)}
                disabled={busy || !displayContent.trim()}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingNoteIndex === activeIndex && status === AppStatus.SAVING ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                Email
              </button>
              {notes.length > 1 && (
                <button
                  type="button"
                  onClick={onSaveAll}
                  disabled={busy}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {status === AppStatus.SAVING ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save All
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs">
              {previewIsStale && (
                <span className="font-medium text-amber-600">
                  Preview needs refresh
                </span>
              )}
              {activeNote.dirty && (
                <span className="flex items-center gap-1 font-medium text-amber-600">
                  <CloudOff className="h-3.5 w-3.5" />
                  Unsaved changes
                </span>
              )}
              {autosaveMsg && !activeNote.dirty && (
                <span className="font-medium text-sky-600">✓ {autosaveMsg}</span>
              )}
              {!activeNote.dirty && !autosaveMsg && activeNote.lastSavedAt && (
                <span className="text-slate-400">
                  Saved{' '}
                  {new Date(activeNote.lastSavedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 bg-[linear-gradient(180deg,#fbfdff_0%,#f5f9fc_100%)]">
        {activeViewMode === 'preview' ? (
          <div className="relative h-full min-h-0">
            {activePreviewUrl ? (
              <iframe
                key={activePreviewUrl}
                title={`${activeNote.title || 'Note'} PDF preview`}
                src={activePreviewUrl}
                className="h-full w-full border-0 bg-white"
              />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center">
                <div className="max-w-sm space-y-2">
                  {previewLoadingNoteId === activeNote.noteId ? (
                    <>
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-sky-600" />
                      <p className="text-sm font-medium text-slate-700">
                        Building PDF preview…
                      </p>
                    </>
                  ) : (
                    <>
                      <Eye className="mx-auto h-6 w-6 text-slate-300" />
                      <p className="text-sm text-slate-500">
                        Select Preview or Regenerate to render the current note as a PDF.
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            {previewLoadingNoteId === activeNote.noteId && activePreviewUrl && (
              <div className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-600" />
                Refreshing preview
              </div>
            )}

            {activePreviewError && (
              <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-rose-200 bg-white/95 px-4 py-3 text-sm text-rose-600 shadow-sm">
                {activePreviewError}
              </div>
            )}
          </div>
        ) : activeFields.length > 0 ? (
          <div className="h-full overflow-y-auto px-4 py-4 md:px-6">
            <div className="mx-auto max-w-4xl space-y-4">
              {activeFields.map((field, fieldIndex) => {
                const rows = Math.max(
                  4,
                  Math.min(14, (field.body || '').split(/\r?\n/).length + 1)
                );
                return (
                  <section
                    key={`${activeNote.noteId}-${field.label}-${fieldIndex}`}
                    className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm"
                  >
                    <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                      {field.label || `Section ${fieldIndex + 1}`}
                    </div>
                    <textarea
                      value={field.body}
                      onChange={(e) => {
                        const nextFields = activeFields.map((currentField, index) =>
                          index === fieldIndex
                            ? { ...currentField, body: e.target.value }
                            : currentField
                        );
                        onNoteChange(activeIndex, { fields: nextFields });
                      }}
                      rows={rows}
                      className="w-full resize-y border-0 bg-transparent p-0 text-sm leading-7 text-slate-700 outline-none placeholder:text-slate-400"
                      placeholder={`Add ${field.label || `section ${fieldIndex + 1}`} details…`}
                    />
                  </section>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="h-full overflow-y-auto px-4 py-4 md:px-6">
            <div className="mx-auto h-full max-w-4xl">
              <textarea
                value={displayContent}
                onChange={(e) => onNoteChange(activeIndex, { content: e.target.value })}
                placeholder="Your generated note will appear here."
                className="h-full min-h-[420px] w-full resize-none rounded-[28px] border border-slate-200 bg-white px-5 py-5 text-sm leading-7 text-slate-700 shadow-sm outline-none placeholder:text-slate-400"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
