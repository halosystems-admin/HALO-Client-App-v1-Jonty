import React, { useState, useEffect, useRef } from 'react';
import type { Patient, CalendarEvent } from '../../../shared/types';
import {
  Plus, LogOut, Search, Trash2, ChevronRight, ChevronDown,
  Settings, Loader2, Calendar as CalendarIcon, Users, Clock,
} from 'lucide-react';
import { searchPatientsByConcept } from '../services/api';
import { SidebarCalendar } from './SidebarCalendar';

interface SidebarProps {
  patients: Patient[];
  selectedPatientId: string | null;
  recentPatientIds: string[];
  onSelectPatient: (id: string) => void;
  onCreatePatient: () => void;
  onDeletePatient: (patient: Patient) => void;
  onLogout: () => void;
  onOpenSettings: () => void;
  userEmail?: string;
  calendarEvents?: CalendarEvent[];
  calendarLoading?: boolean;
  onSelectCalendarEvent?: (event: CalendarEvent) => void;
  onOpenFullCalendar?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  patients,
  selectedPatientId,
  recentPatientIds,
  onSelectPatient,
  onCreatePatient,
  onDeletePatient,
  onLogout,
  onOpenSettings,
  userEmail,
  calendarEvents = [],
  calendarLoading = false,
  onSelectCalendarEvent,
  onOpenFullCalendar,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [aiSearchResults, setAiSearchResults] = useState<string[] | null>(null);
  const [isAiSearching, setIsAiSearching] = useState(false);
  const [activeSection, setActiveSection] = useState<'patients' | 'calendar'>('patients');
  const [patientsExpanded, setPatientsExpanded] = useState(true);
  const [calendarExpanded, setCalendarExpanded] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Local filter
  const localFiltered = patients.filter(
    p =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.dob.includes(searchTerm),
  );

  // Debounced AI concept search
  useEffect(() => {
    if (activeSection !== 'patients') return;
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    setAiSearchResults(null);
    if (!searchTerm.trim() || searchTerm.length < 3) return;
    if (localFiltered.length <= 2) {
      searchTimeoutRef.current = setTimeout(async () => {
        setIsAiSearching(true);
        try {
          const ids = await searchPatientsByConcept(searchTerm, patients, {});
          setAiSearchResults(ids);
        } catch {
          setAiSearchResults(null);
        }
        setIsAiSearching(false);
      }, 600);
    }
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchTerm, patients, activeSection]);

  const filteredPatients = searchTerm.trim()
    ? patients.filter(p => {
        const localMatch =
          p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.dob.includes(searchTerm);
        const aiMatch = aiSearchResults?.includes(p.id) ?? false;
        return localMatch || aiMatch;
      })
    : patients;

  const recentPatients =
    recentPatientIds.length > 0
      ? recentPatientIds
          .map(id => patients.find(p => p.id === id))
          .filter((p): p is Patient => !!p)
          .slice(0, 3)
      : patients.slice(0, 3);

  const userInitials = userEmail
    ? userEmail.slice(0, 2).toUpperCase()
    : 'AD';

  const renderPatientRow = (patient: Patient, keyPrefix: string) => (
    <div
      key={`${keyPrefix}-${patient.id}`}
      onClick={() => {
        onSelectPatient(patient.id);
        setActiveSection('patients');
      }}
      className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all mb-0.5 ${
        selectedPatientId === patient.id
          ? 'bg-cyan-50 text-cyan-700'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
      }`}
    >
      <div className="flex items-center gap-2.5 overflow-hidden">
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
            selectedPatientId === patient.id
              ? 'bg-cyan-600 text-white'
              : 'bg-slate-200 text-slate-500 group-hover:bg-slate-300'
          }`}
        >
          {patient.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate leading-tight">{patient.name}</p>
          <p className="text-[11px] text-slate-400 truncate">{patient.dob}</p>
        </div>
      </div>
      <button
        onClick={e => {
          e.stopPropagation();
          onDeletePatient(patient);
        }}
        className="p-1 rounded opacity-0 group-hover:opacity-100 transition-all hover:bg-rose-100 hover:text-rose-500 text-slate-400"
        title="Delete Folder"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );

  return (
    <div className="w-64 bg-white h-full flex flex-col border-r border-slate-200 shadow-sm">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl overflow-hidden shadow-sm">
            <img
              src="/halo-icon.png"
              alt="HALO"
              className="w-full h-full object-cover"
              draggable={false}
            />
          </div>
          <div>
            <h1 className="font-bold text-slate-800 text-base leading-tight">HALO</h1>
            <p className="text-[10px] text-cyan-600 font-semibold tracking-widest uppercase">
              Patient Drive
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 custom-scrollbar">

        {/* ── PATIENTS SECTION ── */}
        <div className="mb-1">
          <button
            type="button"
            onClick={() => {
              setPatientsExpanded(v => !v);
              setActiveSection('patients');
              if (calendarExpanded) setCalendarExpanded(false);
            }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeSection === 'patients'
                ? 'bg-cyan-50 text-cyan-700'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            <Users
              size={17}
              className={activeSection === 'patients' ? 'text-cyan-600' : 'text-slate-400'}
            />
            <span className="flex-1 text-left">Patients</span>
            <span className="text-[11px] text-slate-400 mr-1">{patients.length}</span>
            <ChevronDown
              size={14}
              className={`transition-transform text-slate-400 ${patientsExpanded ? 'rotate-180' : ''}`}
            />
          </button>

          {patientsExpanded && activeSection === 'patients' && (
            <div className="mt-2 space-y-1 pl-1">
              {/* Search */}
              <div className="relative mb-3">
                <Search
                  size={13}
                  className="absolute left-2.5 top-2.5 text-slate-400 pointer-events-none"
                />
                <input
                  type="text"
                  placeholder="Search patients..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-50 text-[13px] pl-8 pr-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-100 transition-all placeholder:text-slate-400"
                />
                {isAiSearching && (
                  <Loader2
                    size={12}
                    className="absolute right-2.5 top-2.5 text-cyan-500 animate-spin"
                  />
                )}
              </div>

              {!searchTerm && recentPatients.length > 0 && (
                <>
                  <div className="flex items-center gap-2 px-2 mb-1.5">
                    <Clock size={11} className="text-slate-400" />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Recent Activity
                    </p>
                  </div>
                  {recentPatients.map(p => renderPatientRow(p, 'recent'))}
                  <div className="my-3 border-t border-slate-100 mx-1" />
                </>
              )}

              <div className="flex items-center gap-2 px-2 mb-1.5">
                <Users size={11} className="text-slate-400" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {searchTerm ? 'Search Results' : 'All Patients'}
                </p>
              </div>
              {filteredPatients.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4 opacity-60">
                  No patients found
                </p>
              ) : (
                filteredPatients.map(p => renderPatientRow(p, 'all'))
              )}
            </div>
          )}
        </div>

        {/* ── CALENDAR SECTION ── */}
        <div className="mb-1">
          <button
            type="button"
            onClick={() => {
              const next = !calendarExpanded;
              setCalendarExpanded(next);
              setActiveSection('calendar');
              if (next) setPatientsExpanded(false);
            }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeSection === 'calendar'
                ? 'bg-cyan-50 text-cyan-700'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            <CalendarIcon
              size={17}
              className={activeSection === 'calendar' ? 'text-cyan-600' : 'text-slate-400'}
            />
            <span className="flex-1 text-left">Calendar</span>
            <ChevronDown
              size={14}
              className={`transition-transform text-slate-400 ${calendarExpanded ? 'rotate-180' : ''}`}
            />
          </button>

          {calendarExpanded && activeSection === 'calendar' && (
            <div className="mt-2 pl-1">
              {onOpenFullCalendar && (
                <button
                  type="button"
                  onClick={onOpenFullCalendar}
                  className="w-full text-xs font-medium text-slate-500 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 flex items-center gap-2 transition-colors mb-2"
                >
                  <CalendarIcon size={12} />
                  Open full calendar
                </button>
              )}
              <SidebarCalendar
                events={calendarEvents}
                patients={patients}
                loading={calendarLoading}
                onSelectEvent={ev => onSelectCalendarEvent && onSelectCalendarEvent(ev)}
              />
            </div>
          )}
        </div>
      </nav>

      {/* Bottom: Create + User */}
      <div className="border-t border-slate-100 p-3 space-y-3">
        <button
          onClick={onCreatePatient}
          className="w-full bg-cyan-600 hover:bg-cyan-500 text-white py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm shadow-cyan-600/20 flex items-center justify-center gap-2 active:scale-[0.98]"
        >
          <Plus size={16} /> New Patient Folder
        </button>

        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-cyan-100 text-cyan-700 flex items-center justify-center text-[11px] font-bold shrink-0">
              {userInitials}
            </div>
            <p className="text-[11px] text-slate-500 truncate">{userEmail || 'admin'}</p>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={onOpenSettings}
              title="Settings"
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <Settings size={15} />
            </button>
            <button
              onClick={onLogout}
              title="Sign Out"
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
