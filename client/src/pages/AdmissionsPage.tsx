import React, { useEffect, useMemo, useState } from 'react';
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type {
  AdmissionsBoard,
  AdmissionsCard,
  AdmissionsColumn,
  Patient,
} from '../../../shared/types';
import {
  ApiError,
  fetchAdmissionsBoard,
  saveAdmissionsBoard,
} from '../services/api';
import {
  Calendar,
  CheckCircle2,
  Clock3,
  FolderOpen,
  GripVertical,
  LayoutPanelTop,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Stethoscope,
  Trash2,
  Users,
  X,
} from 'lucide-react';

interface Props {
  patients: Patient[];
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
  onOpenPatient: (
    patientId: string,
    options?: { tab?: 'overview' | 'notes' | 'chat' | 'sessions'; freshSession?: boolean }
  ) => void;
}

interface CardDrawerState {
  columnId: string;
  cardId: string;
}

function formatTimeInStage(enteredAt: string, now: number): string {
  const diffMs = Math.max(0, now - new Date(enteredAt).getTime());
  const totalMinutes = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function findCardLocation(board: AdmissionsBoard, cardId: string): { columnIndex: number; cardIndex: number } | null {
  for (let columnIndex = 0; columnIndex < board.columns.length; columnIndex += 1) {
    const cardIndex = board.columns[columnIndex].cards.findIndex((card) => card.id === cardId);
    if (cardIndex >= 0) return { columnIndex, cardIndex };
  }
  return null;
}

function cloneBoard(board: AdmissionsBoard): AdmissionsBoard {
  return {
    ...board,
    columns: board.columns.map((column) => ({
      ...column,
      cards: column.cards.map((card) => ({
        ...card,
        coManagingDoctors: [...card.coManagingDoctors],
        tags: [...card.tags],
        tasks: card.tasks.map((task) => ({ ...task })),
        movementHistory: card.movementHistory.map((movement) => ({ ...movement })),
      })),
    })),
  };
}

function ColumnCard({
  card,
  now,
  onOpen,
}: {
  card: AdmissionsCard;
  now: number;
  onOpen: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    data: { type: 'card' },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const completedTasks = card.tasks.filter((task) => task.done).length;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-[26px] border border-slate-200 bg-white p-4 shadow-[0_18px_35px_-32px_rgba(15,23,42,0.45)] transition ${
        isDragging ? 'opacity-70 shadow-lg' : 'hover:border-cyan-200 hover:shadow-[0_20px_40px_-30px_rgba(34,111,155,0.35)]'
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 flex-col items-start text-left"
        >
          <div className="flex w-full items-center justify-between gap-3">
            <p className="truncate text-[22px] font-semibold tracking-[-0.02em] text-slate-800">
              {card.patientName}
            </p>
            {card.folderNumber && (
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                {card.folderNumber}
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2.5 py-1 font-medium text-cyan-700">
              <Clock3 className="h-3 w-3" />
              {formatTimeInStage(card.enteredColumnAt, now)}
            </span>
            {card.diagnosis && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
                {card.diagnosis.startsWith('#') ? card.diagnosis : `#${card.diagnosis}`}
              </span>
            )}
          </div>

          {card.coManagingDoctors.length > 0 && (
            <p className="mt-3 line-clamp-1 text-sm text-slate-500">
              <span className="font-medium text-slate-700">Co-managing:</span>{' '}
              {card.coManagingDoctors.join(', ')}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {card.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="mt-4 flex w-full items-center justify-between text-xs text-slate-400">
            <span>{card.tasks.length > 0 ? `${completedTasks}/${card.tasks.length} tasks` : 'No tasks'}</span>
            <span className="font-medium">Open card</span>
          </div>
        </button>

        <button
          type="button"
          {...attributes}
          {...listeners}
          className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-300 transition hover:bg-slate-100 hover:text-slate-500"
          aria-label="Drag card"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function BoardColumn({
  column,
  now,
  isRenaming,
  renameValue,
  onRenameValueChange,
  onRenameSubmit,
  onStartRename,
  onDelete,
  onAddPatient,
  onOpenCard,
}: {
  column: AdmissionsColumn;
  now: number;
  isRenaming: boolean;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  onRenameSubmit: () => void;
  onStartRename: () => void;
  onDelete: () => void;
  onAddPatient: () => void;
  onOpenCard: (cardId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: column.id,
    data: { type: 'column' },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex h-full w-[320px] shrink-0 flex-col rounded-[30px] border border-slate-200 bg-white px-4 py-4 shadow-[0_24px_48px_-36px_rgba(15,23,42,0.45)] ${
        isDragging ? 'opacity-80' : ''
      }`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {isRenaming ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(event) => onRenameValueChange(event.target.value)}
              onBlur={onRenameSubmit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onRenameSubmit();
              }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-cyan-400 focus:bg-white"
            />
          ) : (
            <>
              <p className="truncate text-[13px] font-bold uppercase tracking-[0.12em] text-slate-800">
                {column.title}
              </p>
              <p className="mt-1 text-sm text-slate-400">
                {column.cards.length} patient{column.cards.length === 1 ? '' : 's'}
              </p>
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onStartRename}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition hover:bg-slate-100 hover:text-slate-500"
            aria-label="Rename ward"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition hover:bg-rose-50 hover:text-rose-500"
            aria-label="Delete ward"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition hover:bg-slate-100 hover:text-slate-500"
            aria-label="Drag ward"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onAddPatient}
        className="mb-4 inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-dashed border-cyan-200 bg-cyan-50/70 text-sm font-semibold text-cyan-700 transition hover:border-cyan-300 hover:bg-cyan-50"
      >
        <Plus className="h-4 w-4" />
        Add patient
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <SortableContext items={column.cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {column.cards.map((card) => (
              <ColumnCard
                key={card.id}
                card={card}
                now={now}
                onOpen={() => onOpenCard(card.id)}
              />
            ))}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

export const AdmissionsPage: React.FC<Props> = ({ patients, onToast, onOpenPatient }) => {
  const [board, setBoard] = useState<AdmissionsBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [boardSearch, setBoardSearch] = useState('');
  const [now, setNow] = useState(Date.now());
  const [renamingColumnId, setRenamingColumnId] = useState<string | null>(null);
  const [renameColumnValue, setRenameColumnValue] = useState('');
  const [showAddPatientModal, setShowAddPatientModal] = useState(false);
  const [newCardColumnId, setNewCardColumnId] = useState<string | null>(null);
  const [newCardPatientId, setNewCardPatientId] = useState('');
  const [newCardSearch, setNewCardSearch] = useState('');
  const [newCardDiagnosis, setNewCardDiagnosis] = useState('');
  const [newCardDoctorsInput, setNewCardDoctorsInput] = useState('');
  const [newCardTagsInput, setNewCardTagsInput] = useState('');
  const [newWardTitle, setNewWardTitle] = useState('');
  const [drawerState, setDrawerState] = useState<CardDrawerState | null>(null);
  const [drawerDraft, setDrawerDraft] = useState<AdmissionsCard | null>(null);
  const [taskInput, setTaskInput] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [doctorInput, setDoctorInput] = useState('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const patientsById = useMemo(
    () => new Map(patients.map((patient) => [patient.id, patient])),
    [patients]
  );

  const filteredPatientResults = useMemo(() => {
    const query = newCardSearch.trim().toLowerCase();
    const existingIds = new Set(
      board?.columns.flatMap((column) => column.cards.map((card) => card.patientId)) || []
    );
    return patients
      .filter((patient) => !existingIds.has(patient.id))
      .filter((patient) => {
        if (!query) return true;
        return (
          patient.name.toLowerCase().includes(query) ||
          patient.dob.toLowerCase().includes(query) ||
          (patient.folderNumber || '').toLowerCase().includes(query)
        );
      })
      .slice(0, 12);
  }, [board?.columns, newCardSearch, patients]);

  const visibleBoard = useMemo(() => {
    if (!board) return null;
    const query = boardSearch.trim().toLowerCase();
    if (!query) return board;
    return {
      ...board,
      columns: board.columns.map((column) => ({
        ...column,
        cards: column.cards.filter((card) => {
          const haystack = [
            card.patientName,
            card.folderNumber || '',
            card.diagnosis,
            ...card.tags,
            ...card.coManagingDoctors,
            ...card.tasks.map((task) => task.title),
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(query);
        }),
      })),
    };
  }, [board, boardSearch]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchAdmissionsBoard()
      .then((response) => {
        if (mounted) setBoard(response.board);
      })
      .catch((error) => {
        if (mounted) onToast(error instanceof Error ? error.message : 'Failed to load admissions board.', 'error');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [onToast]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const openCardDrawer = (columnId: string, cardId: string) => {
    const column = board?.columns.find((item) => item.id === columnId);
    const card = column?.cards.find((item) => item.id === cardId);
    if (!card) return;
    setDrawerState({ columnId, cardId });
    setDrawerDraft({
      ...card,
      coManagingDoctors: [...card.coManagingDoctors],
      tags: [...card.tags],
      tasks: card.tasks.map((task) => ({ ...task })),
      movementHistory: card.movementHistory.map((movement) => ({ ...movement })),
    });
    setTaskInput('');
    setTagInput('');
    setDoctorInput('');
  };

  const closeDrawer = () => {
    setDrawerState(null);
    setDrawerDraft(null);
    setTaskInput('');
    setTagInput('');
    setDoctorInput('');
  };

  const persistBoard = async (nextBoard: AdmissionsBoard) => {
    setBoard(nextBoard);
    setSaving(true);
    try {
      const response = await saveAdmissionsBoard(nextBoard);
      setBoard(response.board);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        try {
          const latest = await fetchAdmissionsBoard();
          setBoard(latest.board);
        } catch {
          // Keep optimistic board if refetch fails.
        }
        onToast('Admissions board changed elsewhere. Reloaded the latest version.', 'info');
        closeDrawer();
      } else {
        onToast(error instanceof Error ? error.message : 'Failed to save admissions board.', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleColumnRename = async (columnId: string) => {
    const title = renameColumnValue.trim();
    if (!board || !title) {
      setRenamingColumnId(null);
      setRenameColumnValue('');
      return;
    }
    const nextBoard = cloneBoard(board);
    const column = nextBoard.columns.find((item) => item.id === columnId);
    if (!column) return;
    column.title = title;
    column.cards = column.cards.map((card) => ({
      ...card,
      movementHistory: card.movementHistory.map((movement, index, list) =>
        movement.columnId === columnId && index === list.length - 1
          ? { ...movement, columnTitle: title }
          : movement
      ),
    }));
    setRenamingColumnId(null);
    setRenameColumnValue('');
    await persistBoard(nextBoard);
  };

  const handleDeleteColumn = async (columnId: string) => {
    if (!board) return;
    const column = board.columns.find((item) => item.id === columnId);
    if (!column) return;
    if (board.columns.length <= 1) {
      onToast('Keep at least one ward on the board.', 'info');
      return;
    }
    if (column.cards.length > 0) {
      onToast('Move patients out of this ward before deleting it.', 'info');
      return;
    }
    const nextBoard = {
      ...cloneBoard(board),
      columns: board.columns.filter((item) => item.id !== columnId),
    };
    await persistBoard(nextBoard);
  };

  const handleAddWard = async () => {
    if (!board) return;
    const title = newWardTitle.trim();
    if (!title) return;
    const nextBoard = cloneBoard(board);
    nextBoard.columns.push({
      id: crypto.randomUUID(),
      title,
      cards: [],
    });
    setNewWardTitle('');
    await persistBoard(nextBoard);
  };

  const handleOpenAddPatient = (columnId: string) => {
    setNewCardColumnId(columnId);
    setNewCardPatientId('');
    setNewCardSearch('');
    setNewCardDiagnosis('');
    setNewCardDoctorsInput('');
    setNewCardTagsInput('');
    setShowAddPatientModal(true);
  };

  const handleCreateCard = async () => {
    if (!board || !newCardColumnId || !newCardPatientId) return;
    const patient = patientsById.get(newCardPatientId);
    if (!patient) return;
    const targetColumn = board.columns.find((column) => column.id === newCardColumnId);
    if (!targetColumn) return;

    const nowIso = new Date().toISOString();
    const nextBoard = cloneBoard(board);
    const nextColumn = nextBoard.columns.find((column) => column.id === newCardColumnId);
    if (!nextColumn) return;

    nextColumn.cards.unshift({
      id: crypto.randomUUID(),
      patientId: patient.id,
      patientName: patient.name,
      folderNumber: patient.folderNumber,
      diagnosis: newCardDiagnosis.trim(),
      coManagingDoctors: newCardDoctorsInput
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      tags: newCardTagsInput
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      tasks: [],
      enteredColumnAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
      movementHistory: [
        {
          columnId: nextColumn.id,
          columnTitle: nextColumn.title,
          enteredAt: nowIso,
        },
      ],
    });

    setShowAddPatientModal(false);
    await persistBoard(nextBoard);
  };

  const saveDrawerDraft = async () => {
    if (!board || !drawerState || !drawerDraft) return;
    const nextBoard = cloneBoard(board);
    const column = nextBoard.columns.find((item) => item.id === drawerState.columnId);
    const cardIndex = column?.cards.findIndex((item) => item.id === drawerState.cardId) ?? -1;
    if (!column || cardIndex < 0) return;
    column.cards[cardIndex] = {
      ...drawerDraft,
      updatedAt: new Date().toISOString(),
    };
    await persistBoard(nextBoard);
    closeDrawer();
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!board || !over || active.id === over.id) return;

    const activeType = active.data.current?.type as 'column' | 'card' | undefined;
    const overType = over.data.current?.type as 'column' | 'card' | undefined;
    const nextBoard = cloneBoard(board);

    if (activeType === 'column' && overType === 'column') {
      const oldIndex = nextBoard.columns.findIndex((column) => column.id === String(active.id));
      const newIndex = nextBoard.columns.findIndex((column) => column.id === String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      nextBoard.columns = arrayMove(nextBoard.columns, oldIndex, newIndex);
      await persistBoard(nextBoard);
      return;
    }

    if (activeType !== 'card') return;

    const activeLocation = findCardLocation(nextBoard, String(active.id));
    if (!activeLocation) return;

    const sourceColumn = nextBoard.columns[activeLocation.columnIndex];
    const [movedCard] = sourceColumn.cards.splice(activeLocation.cardIndex, 1);
    if (!movedCard) return;

    let targetColumnIndex = -1;
    let targetCardIndex = 0;

    if (overType === 'card') {
      const overLocation = findCardLocation(nextBoard, String(over.id));
      if (!overLocation) return;
      targetColumnIndex = overLocation.columnIndex;
      targetCardIndex = overLocation.cardIndex;
    } else if (overType === 'column') {
      targetColumnIndex = nextBoard.columns.findIndex((column) => column.id === String(over.id));
      if (targetColumnIndex < 0) return;
      targetCardIndex = nextBoard.columns[targetColumnIndex].cards.length;
    }

    const targetColumn = nextBoard.columns[targetColumnIndex];
    if (!targetColumn) return;

    if (sourceColumn.id !== targetColumn.id) {
      const nowIso = new Date().toISOString();
      const lastMovement = movedCard.movementHistory[movedCard.movementHistory.length - 1];
      const updatedHistory = lastMovement
        ? [
            ...movedCard.movementHistory.slice(0, -1),
            { ...lastMovement, exitedAt: lastMovement.exitedAt || nowIso },
            {
              columnId: targetColumn.id,
              columnTitle: targetColumn.title,
              enteredAt: nowIso,
            },
          ]
        : [
            {
              columnId: targetColumn.id,
              columnTitle: targetColumn.title,
              enteredAt: nowIso,
            },
          ];
      movedCard.enteredColumnAt = nowIso;
      movedCard.updatedAt = nowIso;
      movedCard.movementHistory = updatedHistory;
    }

    targetColumn.cards.splice(targetCardIndex, 0, movedCard);
    await persistBoard(nextBoard);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[linear-gradient(180deg,#fbfdff_0%,#f4f9fc_100%)]">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  if (!board || !visibleBoard) {
    return (
      <div className="flex h-full items-center justify-center bg-[linear-gradient(180deg,#fbfdff_0%,#f4f9fc_100%)] text-sm text-slate-400">
        Unable to load the admissions board.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[linear-gradient(180deg,#fbfdff_0%,#f4f9fc_100%)]">
      <div className="border-b border-[#deebf3] bg-white/92 px-5 py-5 backdrop-blur-sm md:px-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-cyan-50 text-cyan-600">
              <LayoutPanelTop className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-[34px] font-semibold tracking-[-0.03em] text-slate-900">
                Admissions
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Manage admitted patients in a shared Halo ward board.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative block min-w-[260px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
              <input
                value={boardSearch}
                onChange={(event) => setBoardSearch(event.target.value)}
                placeholder="Search patients, tags, doctors..."
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-700 outline-none transition focus:border-cyan-300 focus:bg-white"
              />
            </label>
            <button
              type="button"
              onClick={() => handleOpenAddPatient(board.columns[0]?.id || '')}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-5 text-sm font-semibold text-white shadow-[0_18px_30px_-24px_rgba(6,182,212,0.9)] transition hover:bg-cyan-400"
            >
              <Plus className="h-4 w-4" />
              Add patient
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
            Shared inpatient workflow
          </p>
          <div className="text-xs font-medium text-slate-400">
            {saving ? 'Saving board...' : `Updated ${new Date(board.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-5 py-5 md:px-8">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={board.columns.map((column) => column.id)} strategy={horizontalListSortingStrategy}>
            <div className="flex h-full min-w-max items-start gap-5 pb-4">
              {visibleBoard.columns.map((column) => {
                const originalColumn = board.columns.find((item) => item.id === column.id) || column;
                return (
                  <BoardColumn
                    key={column.id}
                    column={column}
                    now={now}
                    isRenaming={renamingColumnId === column.id}
                    renameValue={renameColumnValue}
                    onRenameValueChange={setRenameColumnValue}
                    onRenameSubmit={() => void handleColumnRename(column.id)}
                    onStartRename={() => {
                      setRenamingColumnId(column.id);
                      setRenameColumnValue(originalColumn.title);
                    }}
                    onDelete={() => void handleDeleteColumn(column.id)}
                    onAddPatient={() => handleOpenAddPatient(column.id)}
                    onOpenCard={(cardId) => openCardDrawer(column.id, cardId)}
                  />
                );
              })}

              <div className="w-[280px] shrink-0 rounded-[30px] border border-dashed border-cyan-200 bg-white/75 p-4 shadow-[0_24px_48px_-36px_rgba(15,23,42,0.2)]">
                <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  Add ward
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  Create a new stage or unit for admitted patients.
                </p>
                <input
                  value={newWardTitle}
                  onChange={(event) => setNewWardTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void handleAddWard();
                  }}
                  placeholder="e.g. HDU"
                  className="mt-4 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-cyan-300"
                />
                <button
                  type="button"
                  onClick={() => void handleAddWard()}
                  className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"
                >
                  <Plus className="h-4 w-4" />
                  Add ward
                </button>
              </div>
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {showAddPatientModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Add admitted patient</h2>
                <p className="mt-1 text-sm text-slate-500">Link an existing patient folder to a ward card.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddPatientModal(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-300 transition hover:bg-slate-100 hover:text-slate-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 px-6 py-6">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Find patient
                </label>
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
                  <input
                    value={newCardSearch}
                    onChange={(event) => setNewCardSearch(event.target.value)}
                    placeholder="Search name, DOB, or folder number..."
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-700 outline-none transition focus:border-cyan-300 focus:bg-white"
                  />
                </label>
              </div>

              <div className="max-h-[240px] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/70 p-2">
                {filteredPatientResults.length > 0 ? (
                  <div className="space-y-2">
                    {filteredPatientResults.map((patient) => (
                      <button
                        key={patient.id}
                        type="button"
                        onClick={() => setNewCardPatientId(patient.id)}
                        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                          newCardPatientId === patient.id
                            ? 'border-cyan-200 bg-white text-cyan-700 shadow-sm'
                            : 'border-transparent bg-white/70 text-slate-700 hover:border-slate-200'
                        }`}
                      >
                        <div>
                          <p className="text-sm font-semibold">{patient.name}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {patient.dob}
                            {patient.folderNumber ? ` - ${patient.folderNumber}` : ''}
                          </p>
                        </div>
                        {newCardPatientId === patient.id && (
                          <CheckCircle2 className="h-4 w-4 text-cyan-500" />
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-8 text-center text-sm text-slate-400">
                    No matching patients available.
                  </div>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Admitting diagnosis
                  </label>
                  <input
                    value={newCardDiagnosis}
                    onChange={(event) => setNewCardDiagnosis(event.target.value)}
                    placeholder="#Sepsis"
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-cyan-300"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Initial ward
                  </label>
                  <select
                    value={newCardColumnId || ''}
                    onChange={(event) => setNewCardColumnId(event.target.value)}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-cyan-300"
                  >
                    {board.columns.map((column) => (
                      <option key={column.id} value={column.id}>
                        {column.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Co-managing doctors
                  </label>
                  <input
                    value={newCardDoctorsInput}
                    onChange={(event) => setNewCardDoctorsInput(event.target.value)}
                    placeholder="Comma separated"
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-cyan-300"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Tags
                  </label>
                  <input
                    value={newCardTagsInput}
                    onChange={(event) => setNewCardTagsInput(event.target.value)}
                    placeholder="critical, bloods"
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-cyan-300"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-5">
              <button
                type="button"
                onClick={() => setShowAddPatientModal(false)}
                className="inline-flex h-11 items-center justify-center rounded-2xl px-4 text-sm font-semibold text-slate-500 transition hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCreateCard()}
                disabled={!newCardPatientId || !newCardColumnId}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-5 text-sm font-semibold text-white transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Create card
              </button>
            </div>
          </div>
        </div>
      )}

      {drawerState && drawerDraft && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/35 backdrop-blur-[2px]">
          <button
            type="button"
            className="flex-1 cursor-default"
            onClick={closeDrawer}
            aria-label="Close admissions card"
          />
          <aside className="flex h-full w-full max-w-[520px] flex-col border-l border-slate-200 bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Admissions Card
                  </p>
                  <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.03em] text-slate-900">
                    {drawerDraft.patientName}
                  </h2>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2.5 py-1 font-medium text-cyan-700">
                      <Clock3 className="h-3 w-3" />
                      {formatTimeInStage(drawerDraft.enteredColumnAt, now)}
                    </span>
                    {drawerDraft.folderNumber && (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
                        {drawerDraft.folderNumber}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeDrawer}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-300 transition hover:bg-slate-100 hover:text-slate-500"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => onOpenPatient(drawerDraft.patientId, { tab: 'overview' })}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"
                >
                  <FolderOpen className="h-4 w-4" />
                  Open folder
                </button>
                <button
                  type="button"
                  onClick={() => onOpenPatient(drawerDraft.patientId, { tab: 'notes', freshSession: true })}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"
                >
                  <Stethoscope className="h-4 w-4" />
                  Start consultation
                </button>
                <button
                  type="button"
                  onClick={() => onOpenPatient(drawerDraft.patientId, { tab: 'chat' })}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"
                >
                  <MessageCircle className="h-4 w-4" />
                  Ask Agent
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              <div className="space-y-6">
                <section>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Admitting diagnosis
                  </label>
                  <input
                    value={drawerDraft.diagnosis}
                    onChange={(event) =>
                      setDrawerDraft((prev) => (prev ? { ...prev, diagnosis: event.target.value } : prev))
                    }
                    placeholder="#CAP"
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-700 outline-none transition focus:border-cyan-300 focus:bg-white"
                  />
                </section>

                <section>
                  <div className="mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4 text-slate-300" />
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Co-managing doctors
                    </p>
                  </div>
                  <div className="mb-3 flex flex-wrap gap-2">
                    {drawerDraft.coManagingDoctors.map((doctor) => (
                      <button
                        key={doctor}
                        type="button"
                        onClick={() =>
                          setDrawerDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  coManagingDoctors: prev.coManagingDoctors.filter((item) => item !== doctor),
                                }
                              : prev
                          )
                        }
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
                      >
                        {doctor}
                        <X className="h-3 w-3" />
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={doctorInput}
                      onChange={(event) => setDoctorInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && doctorInput.trim()) {
                          event.preventDefault();
                          setDrawerDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  coManagingDoctors: [...prev.coManagingDoctors, doctorInput.trim()],
                                }
                              : prev
                          );
                          setDoctorInput('');
                        }
                      }}
                      placeholder="Add co-managing doctor"
                      className="h-11 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-700 outline-none transition focus:border-cyan-300 focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!doctorInput.trim()) return;
                        setDrawerDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                coManagingDoctors: [...prev.coManagingDoctors, doctorInput.trim()],
                              }
                            : prev
                        );
                        setDoctorInput('');
                      }}
                      className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"
                    >
                      Add
                    </button>
                  </div>
                </section>

                <section>
                  <div className="mb-3 flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-300" />
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Tags
                    </p>
                  </div>
                  <div className="mb-3 flex flex-wrap gap-2">
                    {drawerDraft.tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() =>
                          setDrawerDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  tags: prev.tags.filter((item) => item !== tag),
                                }
                              : prev
                          )
                        }
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
                      >
                        {tag}
                        <X className="h-3 w-3" />
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={tagInput}
                      onChange={(event) => setTagInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && tagInput.trim()) {
                          event.preventDefault();
                          setDrawerDraft((prev) =>
                            prev
                              ? { ...prev, tags: [...prev.tags, tagInput.trim()] }
                              : prev
                          );
                          setTagInput('');
                        }
                      }}
                      placeholder="Add tag"
                      className="h-11 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-700 outline-none transition focus:border-cyan-300 focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!tagInput.trim()) return;
                        setDrawerDraft((prev) =>
                          prev ? { ...prev, tags: [...prev.tags, tagInput.trim()] } : prev
                        );
                        setTagInput('');
                      }}
                      className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"
                    >
                      Add
                    </button>
                  </div>
                </section>

                <section>
                  <div className="mb-3 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-slate-300" />
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Tasks
                    </p>
                  </div>
                  <div className="space-y-2">
                    {drawerDraft.tasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3"
                      >
                        <input
                          type="checkbox"
                          checked={task.done}
                          onChange={(event) =>
                            setDrawerDraft((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    tasks: prev.tasks.map((item) =>
                                      item.id === task.id ? { ...item, done: event.target.checked } : item
                                    ),
                                  }
                                : prev
                            )
                          }
                          className="h-4 w-4 rounded border-slate-300 text-cyan-500"
                        />
                        <p className={`flex-1 text-sm ${task.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                          {task.title}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            setDrawerDraft((prev) =>
                              prev
                                ? { ...prev, tasks: prev.tasks.filter((item) => item.id !== task.id) }
                                : prev
                            )
                          }
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition hover:bg-white hover:text-rose-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input
                      value={taskInput}
                      onChange={(event) => setTaskInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && taskInput.trim()) {
                          event.preventDefault();
                          setDrawerDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  tasks: [
                                    ...prev.tasks,
                                    {
                                      id: crypto.randomUUID(),
                                      title: taskInput.trim(),
                                      done: false,
                                      createdAt: new Date().toISOString(),
                                    },
                                  ],
                                }
                              : prev
                          );
                          setTaskInput('');
                        }
                      }}
                      placeholder="Add task"
                      className="h-11 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-700 outline-none transition focus:border-cyan-300 focus:bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!taskInput.trim()) return;
                        setDrawerDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                tasks: [
                                  ...prev.tasks,
                                  {
                                    id: crypto.randomUUID(),
                                    title: taskInput.trim(),
                                    done: false,
                                    createdAt: new Date().toISOString(),
                                  },
                                ],
                              }
                            : prev
                        );
                        setTaskInput('');
                      }}
                      className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"
                    >
                      Add
                    </button>
                  </div>
                </section>
              </div>
            </div>

            <div className="border-t border-slate-100 px-6 py-5">
              <button
                type="button"
                onClick={() => void saveDrawerDraft()}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-cyan-500 text-sm font-semibold text-white transition hover:bg-cyan-400"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Save changes
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};
