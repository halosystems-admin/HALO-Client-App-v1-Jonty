import React, { useMemo, useRef, useState } from 'react';
import { BadgeCheck, FileText, RefreshCw } from 'lucide-react';
import {
  billingGetClaims,
  billingGetClaimById,
  billingCheckEligibility,
  billingSubmitClaim,
  billingReverseClaim,
  type BillingClaimCreatePayload,
  type BillingEligibilityPayload,
  type StoredClaimRecord,
} from '../services/billingApi';
import type { Patient } from '../../../shared/types';
import type { UserSettings } from '../../../shared/types';
import { appendPatientBillingClaim, fetchPatientBillingClaims } from '../services/api';

type ToastFn = (message: string, type?: 'success' | 'error' | 'info') => void;

type BillingTab = 'claims' | 'eligibility';
type ClaimsSubTab = 'list' | 'submit' | 'reverse';

const LS_LAST_SUBMIT = 'halo_billing_last_submit_payload_v1';
const LS_LAST_ELIGIBILITY = 'halo_billing_last_eligibility_payload_v1';
const LS_SUBMITTED_BY_TX = 'halo_billing_submitted_by_tx_v1';

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function getEmptyClaimPayload(): BillingClaimCreatePayload {
  return {
    externalReference: '',
    patient: {
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      initials: '',
      statusIndicator: '',
      dependantCode: '',
      idNumber: '',
      memberNumber: '',
      planCode: '',
    },
    provider: {
      name: '',
      practiceNumber: '',
      hpcNumber: '',
      bhfNumber: '',
      groupPracticeNumber: '',
    },
    diagnoses: [{ code: '', description: '' }],
    lineItems: [
      {
        procedureCode: '',
        description: '',
        quantity: 1,
        unitPriceCents: 0,
        totalPriceCents: 0,
        serviceDate: '',
      },
    ],
    other: {
      wcaNumber: '',
      insuranceReferenceNumber: '',
      dateOfAccident: '',
    },
  };
}

export function BillingPage({
  onToast,
  patients,
  selectedPatientId,
  userSettings,
}: {
  onToast: ToastFn;
  patients: Patient[];
  selectedPatientId: string | null;
  userSettings: UserSettings | null;
}) {
  const [tab, setTab] = useState<BillingTab>('claims');
  const [billingPatientId, setBillingPatientId] = useState<string>('');

  const effectivePatientId = billingPatientId || selectedPatientId || '';
  const effectivePatient = effectivePatientId ? patients.find(p => p.id === effectivePatientId) : undefined;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 md:p-6">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <header className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm md:px-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-800">Billing</h1>
              <p className="text-sm text-slate-500">
                MediKredit Integration (dev). Forms are manual for now; data mapping comes next.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-[260px]">
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                  value={effectivePatientId}
                  onChange={(e) => setBillingPatientId(e.target.value)}
                >
                  <option value="">Select patient…</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.dob})
                    </option>
                  ))}
                </select>
              </div>
              <TabButton active={tab === 'claims'} onClick={() => setTab('claims')} icon={<FileText size={16} />}>
                Claims
              </TabButton>
              <TabButton
                active={tab === 'eligibility'}
                onClick={() => setTab('eligibility')}
                icon={<BadgeCheck size={16} />}
              >
                Eligibility
              </TabButton>
            </div>
          </div>
        </header>

        {tab === 'claims' ? (
          <ClaimsTab onToast={onToast} patient={effectivePatient} userSettings={userSettings} />
        ) : (
          <EligibilityTab onToast={onToast} patient={effectivePatient} userSettings={userSettings} />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
        active
          ? 'border-cyan-200 bg-cyan-50 text-cyan-800'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function Section({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-4 md:flex-row md:items-start md:justify-between md:px-6">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-800">{title}</h2>
          {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      <div className="px-4 py-4 md:px-6">{children}</div>
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{children}</label>;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 ${
        props.className || ''
      }`}
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 ${
        props.className || ''
      }`}
    />
  );
}

function SmallButton({
  onClick,
  children,
  variant = 'primary',
  disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  const styles =
    variant === 'primary'
      ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm shadow-cyan-600/20'
      : variant === 'danger'
        ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-sm shadow-rose-600/20'
        : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition active:scale-[0.99] disabled:opacity-50 ${styles}`}
    >
      {children}
    </button>
  );
}

function formatCents(cents?: number | null): string {
  if (typeof cents !== 'number') return '';
  const rands = cents / 100;
  return rands.toLocaleString(undefined, { style: 'currency', currency: 'ZAR' });
}

function sumClaimTotalCents(payload?: BillingClaimCreatePayload | null): number | null {
  if (!payload?.lineItems?.length) return null;
  const total = payload.lineItems.reduce((acc, li) => acc + (Number(li.totalPriceCents) || 0), 0);
  return Number.isFinite(total) ? total : null;
}

function formatMoneyOrDash(cents?: number | null): string {
  if (typeof cents !== 'number') return '—';
  return formatCents(cents);
}

function renderLineItemsSummary(claim: StoredClaimRecord) {
  const items = claim.lineItemsSummary || [];
  if (!items.length) return null;

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Line items summary</p>
      <div className="mt-2 space-y-2">
        {items.map((li, idx) => (
          <div
            key={`${li.procedureCode}-${li.serviceDate}-${idx}`}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-sm font-semibold text-slate-800">
                {li.procedureCode} {li.description ? `— ${li.description}` : ''}
              </p>
              <span className="shrink-0 text-xs font-semibold text-slate-600">
                {formatCents(li.totalPriceCents)}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Qty {li.quantity} • Unit {formatCents(li.unitPriceCents)} • {li.serviceDate}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: fullName.trim(), lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

function ClaimsTab({
  onToast,
  patient,
  userSettings,
}: {
  onToast: ToastFn;
  patient?: Patient;
  userSettings: UserSettings | null;
}) {
  const [subTab, setSubTab] = useState<ClaimsSubTab>('list');
  const [claims, setClaims] = useState<StoredClaimRecord[] | null>(null);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [selectedClaimId, setSelectedClaimId] = useState<string>('');
  const [selectedClaim, setSelectedClaim] = useState<StoredClaimRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const claimDetailReqIdRef = useRef(0);
  const pollTimerRef = useRef<number | null>(null);
  const [patientClaims, setPatientClaims] = useState<unknown[] | null>(null);
  const [patientClaimsLoading, setPatientClaimsLoading] = useState(false);

  const [submitPayload, setSubmitPayload] = useState<BillingClaimCreatePayload>(() => {
    const saved = readJson<BillingClaimCreatePayload>(LS_LAST_SUBMIT);
    return saved ?? getEmptyClaimPayload();
  });

  const [reversalTx, setReversalTx] = useState('');
  const [reversalPayload, setReversalPayload] = useState<BillingClaimCreatePayload>(() => {
    const saved = readJson<BillingClaimCreatePayload>(LS_LAST_SUBMIT);
    return saved ?? getEmptyClaimPayload();
  });

  const applyPatientToClaim = (base: BillingClaimCreatePayload): BillingClaimCreatePayload => {
    if (!patient) return base;
    const name = splitName(patient.name || '');
    const providerDefaults = userSettings?.billing?.provider;
    return {
      ...base,
      patient: {
        ...base.patient,
        firstName: name.firstName || base.patient.firstName,
        lastName: name.lastName || base.patient.lastName,
        dateOfBirth: patient.dob && patient.dob !== 'Unknown' ? patient.dob : base.patient.dateOfBirth,
        idNumber: patient.idNumber || base.patient.idNumber,
        dependantCode: patient.dependantCode || base.patient.dependantCode,
        planCode: patient.planCode || patient.medicalAidPlan || base.patient.planCode,
        memberNumber: patient.memberNumber || patient.medicalAidNumber || base.patient.memberNumber,
      },
      provider: {
        ...base.provider,
        name: providerDefaults?.name || base.provider.name,
        practiceNumber: providerDefaults?.practiceNumber || base.provider.practiceNumber,
        hpcNumber: providerDefaults?.hpcNumber || base.provider.hpcNumber,
        bhfNumber: providerDefaults?.bhfNumber || base.provider.bhfNumber,
        groupPracticeNumber: providerDefaults?.groupPracticeNumber || base.provider.groupPracticeNumber,
      },
    };
  };

  // Auto-apply patient + provider defaults when patient changes (Submit + Reverse)
  React.useEffect(() => {
    if (!patient?.id) return;
    setSubmitPayload((prev) => applyPatientToClaim(prev));
    setReversalPayload((prev) => applyPatientToClaim(prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient?.id]);

  const canSubmit = useMemo(() => {
    const hasPatient = submitPayload.patient.firstName.trim() && submitPayload.patient.lastName.trim();
    const hasMember = submitPayload.patient.memberNumber.trim();
    const hasProvider = submitPayload.provider.name.trim();
    const hasDx = submitPayload.diagnoses.some(d => d.code.trim());
    const hasLine = submitPayload.lineItems.some(li => li.procedureCode.trim() && !!li.serviceDate);
    return !!(hasPatient && hasMember && hasProvider && hasDx && hasLine);
  }, [submitPayload]);

  const refreshClaims = async () => {
    setClaimsLoading(true);
    try {
      const data = await billingGetClaims({ limit: 50, offset: 0 });
      setClaims(data);
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Failed to load claims.', 'error');
    } finally {
      setClaimsLoading(false);
    }
  };

  const refreshPatientClaims = async () => {
    if (!patient?.id) {
      setPatientClaims(null);
      return;
    }
    setPatientClaimsLoading(true);
    try {
      const res = await fetchPatientBillingClaims(patient.id);
      setPatientClaims(res.claims || []);
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Failed to load patient claim history.', 'error');
    } finally {
      setPatientClaimsLoading(false);
    }
  };

  // Auto-refresh claims in the background (keeps list + reverse dropdown up to date).
  React.useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await refreshClaims();
    };

    tick();

    if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
    pollTimerRef.current = window.setInterval(() => {
      tick().catch(() => {});
    }, 12_000);

    return () => {
      cancelled = true;
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    refreshPatientClaims().catch(() => {});
  }, [patient?.id]);

  const selectAndLoadClaim = async (id: string) => {
    setSelectedClaimId(id);
    setSelectedClaim(null);
    setDetailLoading(true);
    const reqId = ++claimDetailReqIdRef.current;
    try {
      const data = await billingGetClaimById(id.trim());
      if (reqId !== claimDetailReqIdRef.current) return;
      setSelectedClaim(data);
    } catch (e) {
      if (reqId !== claimDetailReqIdRef.current) return;
      onToast(e instanceof Error ? e.message : 'Failed to load claim.', 'error');
    } finally {
      if (reqId === claimDetailReqIdRef.current) setDetailLoading(false);
    }
  };

  const submitClaim = async () => {
    try {
      const result = await billingSubmitClaim(submitPayload);
      onToast(`Claim ${result.status}.`, result.status === 'accepted' ? 'success' : 'info');
      // Persist for fast re-testing
      writeJson(LS_LAST_SUBMIT, submitPayload);
      if (result.transactionNumber) {
        const existing = readJson<Record<string, BillingClaimCreatePayload>>(LS_SUBMITTED_BY_TX) || {};
        existing[result.transactionNumber] = submitPayload;
        writeJson(LS_SUBMITTED_BY_TX, existing);
      }

      if (patient?.id) {
        await appendPatientBillingClaim(patient.id, {
          savedAt: new Date().toISOString(),
          patientId: patient.id,
          claimRequest: submitPayload,
          claimResult: result,
        });
        await refreshPatientClaims();
      }

      await refreshClaims();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Failed to submit claim.', 'error');
    }
  };

  const reverseClaim = async () => {
    if (!reversalTx.trim()) {
      onToast('Transaction number is required for reversal.', 'error');
      return;
    }
    try {
      const result = await billingReverseClaim({ ...reversalPayload, transactionNumber: reversalTx.trim() });
      onToast(`Reversal ${result.status}.`, result.status === 'accepted' ? 'success' : 'info');
      await refreshClaims();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Failed to reverse claim.', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <Section
        title="Claims"
        subtitle="Work with billing claims: list, submit, and reverse."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5">
              <button
                type="button"
                onClick={() => setSubTab('list')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-full transition ${
                  subTab === 'list'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                List
              </button>
              <button
                type="button"
                onClick={() => setSubTab('submit')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-full transition ${
                  subTab === 'submit'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Submit
              </button>
              <button
                type="button"
                onClick={() => setSubTab('reverse')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-full transition ${
                  subTab === 'reverse'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Reverse
              </button>
            </div>
            {claimsLoading ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500">
                <RefreshCw size={14} className="animate-spin" />
                Updating…
              </span>
            ) : null}
          </div>
        }
      >
        {subTab === 'list' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Recent claims</p>
              {claims === null ? (
                <p className="text-sm text-slate-500">Loading claims…</p>
              ) : claims.length === 0 ? (
                <p className="text-sm text-slate-500">No claims found.</p>
              ) : (
                <div className="space-y-2">
                  {claims.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        selectAndLoadClaim(c.id);
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:bg-slate-50"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {c.patientLastName || '—'}
                        </p>
                        <span
                          className={`shrink-0 rounded-full border bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                            c.reversed
                              ? 'border-rose-200 text-rose-700'
                              : 'border-slate-200 text-slate-500'
                          }`}
                          title={
                            c.reversed
                              ? `Reversed${c.reversalStatus ? ` (${c.reversalStatus})` : ''}`
                              : c.status
                          }
                        >
                          {c.reversed ? 'reversed' : c.status}
                        </span>
                      </div>
                      {(() => {
                        const savedByTx = readJson<Record<string, BillingClaimCreatePayload>>(LS_SUBMITTED_BY_TX) || {};
                        const savedPayload = c.transactionNumber ? savedByTx[c.transactionNumber] : null;
                        const totalCents = sumClaimTotalCents(savedPayload);
                        const backendTotal = typeof c.totalClaimedCents === 'number' ? c.totalClaimedCents : null;
                        const totalLabel = backendTotal !== null ? formatMoneyOrDash(backendTotal) : totalCents === null ? '—' : formatCents(totalCents);
                        return (
                          <p className="mt-1 truncate text-xs text-slate-500">
                            Member: {c.memberNumber} • Tx: {c.transactionNumber || '—'} • Items: {c.totalLineItems ?? c.lineItemsSummary?.length ?? '—'} • Total: {totalLabel}
                          </p>
                        );
                      })()}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Claim details</p>
                {detailLoading ? (
                  <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <RefreshCw size={14} className="animate-spin" />
                    Loading…
                  </span>
                ) : null}
              </div>

              <div className="mt-3">
                {(() => {
                  const savedByTx = readJson<Record<string, BillingClaimCreatePayload>>(LS_SUBMITTED_BY_TX) || {};
                  const tx = selectedClaim?.transactionNumber;
                  const savedPayload = tx ? savedByTx[tx] : null;
                  const totalCents = sumClaimTotalCents(savedPayload);
                  const backendClaimed = typeof selectedClaim?.totalClaimedCents === 'number' ? selectedClaim.totalClaimedCents : null;
                  const backendPaid = typeof selectedClaim?.totalPaidCents === 'number' ? selectedClaim.totalPaidCents : null;
                  const backendVariance = typeof selectedClaim?.varianceCents === 'number' ? selectedClaim.varianceCents : null;

                  if (backendClaimed === null && totalCents === null) return null;
                  return (
                    <div className="mb-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
                      <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Financial summary</p>
                      <div className="mt-1 grid grid-cols-1 gap-1 text-sm font-semibold text-emerald-900 md:grid-cols-3">
                        <div>
                          Total claimed:{' '}
                          {backendClaimed !== null ? formatMoneyOrDash(backendClaimed) : formatCents(totalCents ?? 0)}
                        </div>
                        <div>Total paid: {formatMoneyOrDash(backendPaid)}</div>
                        <div>Variance: {formatMoneyOrDash(backendVariance)}</div>
                      </div>
                      <p className="mt-1 text-xs text-emerald-700">
                        {backendClaimed !== null
                          ? 'Provided by the billing API.'
                          : 'Derived from the locally-saved submitted claim payload (line item totals).'}
                      </p>
                    </div>
                  );
                })()}

                {selectedClaim ? (
                  <>
                    {renderLineItemsSummary(selectedClaim)}
                    <pre className="mt-3 max-h-[340px] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                      {JSON.stringify(selectedClaim, null, 2)}
                    </pre>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">Click any claim to view details.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {subTab === 'list' && patient?.id && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Patient claim history</p>
                <p className="text-sm font-semibold text-slate-800">{patient.name}</p>
              </div>
              {patientClaimsLoading ? (
                <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <RefreshCw size={14} className="animate-spin" />
                  Loading…
                </span>
              ) : null}
            </div>
            <div className="mt-3">
              {patientClaims === null ? (
                <p className="text-sm text-slate-500">Select a patient to see saved claim history.</p>
              ) : patientClaims.length === 0 ? (
                <p className="text-sm text-slate-500">No saved claims for this patient yet.</p>
              ) : (
                <pre className="max-h-[260px] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  {JSON.stringify(patientClaims.slice(-20), null, 2)}
                </pre>
              )}
            </div>
          </div>
        )}

        {subTab === 'submit' && (
          <div className="mt-1">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Submit new claim
            </p>
            <div className="mb-3 flex flex-wrap gap-2">
              <SmallButton
                onClick={() => {
                  if (!patient) {
                    onToast('Select a patient first to autofill.', 'info');
                    return;
                  }
                  setSubmitPayload((prev) => applyPatientToClaim(prev));
                  onToast('Autofilled claim from patient billing fields.', 'success');
                }}
                variant="secondary"
              >
                Use patient billing
              </SmallButton>
              <SmallButton
                onClick={() => {
                  const saved = readJson<BillingClaimCreatePayload>(LS_LAST_SUBMIT);
                  if (saved) {
                    setSubmitPayload(saved);
                    onToast('Autofilled from last submitted claim.', 'success');
                  } else {
                    onToast('No saved claim found yet. Submit a claim once to enable autofill.', 'info');
                  }
                }}
                variant="secondary"
              >
                Use last claim
              </SmallButton>
              <SmallButton
                onClick={() => {
                  setSubmitPayload(getEmptyClaimPayload());
                  onToast('Cleared claim form.', 'info');
                }}
                variant="secondary"
              >
                Clear
              </SmallButton>
            </div>
            <ClaimForm
              payload={submitPayload}
              onChange={setSubmitPayload}
              actionLabel="Submit claim"
              onAction={submitClaim}
              actionDisabled={!canSubmit}
            />
          </div>
        )}

        {subTab === 'reverse' && (
          <div className="mt-1 space-y-4">
            <div className="flex flex-wrap gap-2">
              <SmallButton
                onClick={() => {
                  if (!patient) {
                    onToast('Select a patient first to autofill.', 'info');
                    return;
                  }
                  setReversalPayload((prev) => applyPatientToClaim(prev));
                  onToast('Autofilled reversal details from patient billing fields.', 'success');
                }}
                variant="secondary"
              >
                Use patient billing
              </SmallButton>
              <SmallButton
                onClick={() => {
                  // Use the current submit form as the reversal base
                  setReversalPayload(submitPayload);
                  onToast('Copied reversal details from the submit form.', 'success');
                }}
                variant="secondary"
              >
                Copy from submit form
              </SmallButton>
              <SmallButton
                onClick={() => {
                  const saved = readJson<BillingClaimCreatePayload>(LS_LAST_SUBMIT);
                  if (saved) {
                    setReversalPayload(saved);
                    onToast('Autofilled reversal details from last submitted claim.', 'success');
                  } else {
                    onToast('No saved claim found yet.', 'info');
                  }
                }}
                variant="secondary"
              >
                Use last claim
              </SmallButton>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="md:col-span-2">
                <Label>Select claim to reverse</Label>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
                  value={reversalTx}
                  onChange={e => {
                    const tx = e.target.value;
                    setReversalTx(tx);
                    const savedByTx = readJson<Record<string, BillingClaimCreatePayload>>(LS_SUBMITTED_BY_TX) || {};
                    const savedPayload = tx ? savedByTx[tx] : undefined;
                    if (savedPayload) {
                      setReversalPayload(savedPayload);
                      onToast('Filled reversal details from the originally submitted claim.', 'success');
                      return;
                    }
                    const match = claims?.find(c => c.transactionNumber === tx);
                    if (match) {
                      setReversalPayload(prev => ({
                        ...prev,
                        patient: {
                          ...prev.patient,
                          firstName: match.patientFirstName || prev.patient.firstName,
                          lastName: match.patientLastName || prev.patient.lastName,
                          memberNumber: match.memberNumber || prev.patient.memberNumber,
                        },
                      }));
                    }
                  }}
                >
                  <option value="">Select a claim…</option>
                  {claims?.map(c =>
                    c.transactionNumber ? (
                      <option key={c.id} value={c.transactionNumber}>
                        {c.transactionNumber} — {c.patientLastName || ''} ({c.memberNumber})
                      </option>
                    ) : null
                  )}
                </select>
              </div>
              <div>
                <Label>Transaction number</Label>
                <Input
                  value={reversalTx}
                  onChange={e => setReversalTx(e.target.value)}
                  placeholder="e.g. TX123456789"
                />
              </div>
            </div>
            <ClaimForm
              payload={reversalPayload}
              onChange={setReversalPayload}
              actionLabel="Reverse claim"
              onAction={reverseClaim}
              actionVariant="danger"
            />
          </div>
        )}
      </Section>
    </div>
  );
}

function ClaimForm({
  payload,
  onChange,
  actionLabel,
  onAction,
  actionDisabled,
  actionVariant = 'primary',
}: {
  payload: BillingClaimCreatePayload;
  onChange: (p: BillingClaimCreatePayload) => void;
  actionLabel: string;
  onAction: () => void;
  actionDisabled?: boolean;
  actionVariant?: 'primary' | 'secondary' | 'danger';
}) {
  const updatePatient = (patch: Partial<BillingClaimCreatePayload['patient']>) =>
    onChange({ ...payload, patient: { ...payload.patient, ...patch } });
  const updateProvider = (patch: Partial<BillingClaimCreatePayload['provider']>) =>
    onChange({ ...payload, provider: { ...payload.provider, ...patch } });

  const updateDiagnosis = (idx: number, patch: Partial<BillingClaimCreatePayload['diagnoses'][number]>) => {
    const diagnoses = payload.diagnoses.map((d, i) => (i === idx ? { ...d, ...patch } : d));
    onChange({ ...payload, diagnoses });
  };
  const addDiagnosis = () => onChange({ ...payload, diagnoses: [...payload.diagnoses, { code: '', description: '' }] });
  const removeDiagnosis = (idx: number) => {
    const diagnoses = payload.diagnoses.filter((_, i) => i !== idx);
    onChange({ ...payload, diagnoses: diagnoses.length ? diagnoses : [{ code: '', description: '' }] });
  };

  const updateLineItem = (idx: number, patch: Partial<BillingClaimCreatePayload['lineItems'][number]>) => {
    const lineItems = payload.lineItems.map((li, i) => (i === idx ? { ...li, ...patch } : li));
    onChange({ ...payload, lineItems });
  };
  const addLineItem = () =>
    onChange({
      ...payload,
      lineItems: [
        ...payload.lineItems,
        {
          procedureCode: '',
          description: '',
          quantity: 1,
          unitPriceCents: 0,
          totalPriceCents: 0,
          serviceDate: '',
        },
      ],
    });
  const removeLineItem = (idx: number) => {
    const lineItems = payload.lineItems.filter((_, i) => i !== idx);
    onChange({
      ...payload,
      lineItems: lineItems.length
        ? lineItems
        : [
            {
              procedureCode: '',
              description: '',
              quantity: 1,
              unitPriceCents: 0,
              totalPriceCents: 0,
              serviceDate: '',
            },
          ],
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Reference</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>External reference</Label>
            <Input
              value={payload.externalReference || ''}
              onChange={e => onChange({ ...payload, externalReference: e.target.value })}
              placeholder="e.g. ENCOUNTER-123 / INVOICE-456"
            />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <Label>Patient first name</Label>
          <Input value={payload.patient.firstName} onChange={e => updatePatient({ firstName: e.target.value })} />
        </div>
        <div>
          <Label>Patient last name</Label>
          <Input value={payload.patient.lastName} onChange={e => updatePatient({ lastName: e.target.value })} />
        </div>
        <div>
          <Label>Date of birth</Label>
          <Input
            type="date"
            value={payload.patient.dateOfBirth}
            onChange={e => updatePatient({ dateOfBirth: e.target.value })}
          />
        </div>
        <div>
          <Label>Initials</Label>
          <Input value={payload.patient.initials || ''} onChange={e => updatePatient({ initials: e.target.value })} />
        </div>
        <div>
          <Label>Status indicator</Label>
          <Input
            value={payload.patient.statusIndicator || ''}
            onChange={e => updatePatient({ statusIndicator: e.target.value })}
            placeholder="e.g. A"
          />
        </div>
        <div>
          <Label>Member number</Label>
          <Input value={payload.patient.memberNumber} onChange={e => updatePatient({ memberNumber: e.target.value })} />
        </div>
        <div>
          <Label>Dependant code</Label>
          <Input value={payload.patient.dependantCode || ''} onChange={e => updatePatient({ dependantCode: e.target.value })} />
        </div>
        <div>
          <Label>ID number</Label>
          <Input value={payload.patient.idNumber || ''} onChange={e => updatePatient({ idNumber: e.target.value })} />
        </div>
        <div>
          <Label>Plan code</Label>
          <Input value={payload.patient.planCode || ''} onChange={e => updatePatient({ planCode: e.target.value })} />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Provider</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Provider name</Label>
            <Input value={payload.provider.name} onChange={e => updateProvider({ name: e.target.value })} />
          </div>
          <div>
            <Label>Practice number</Label>
            <Input value={payload.provider.practiceNumber || ''} onChange={e => updateProvider({ practiceNumber: e.target.value })} />
          </div>
          <div>
            <Label>HPC number</Label>
            <Input value={payload.provider.hpcNumber || ''} onChange={e => updateProvider({ hpcNumber: e.target.value })} />
          </div>
          <div>
            <Label>BHF number</Label>
            <Input value={payload.provider.bhfNumber || ''} onChange={e => updateProvider({ bhfNumber: e.target.value })} />
          </div>
          <div>
            <Label>Group practice number</Label>
            <Input
              value={payload.provider.groupPracticeNumber || ''}
              onChange={e => updateProvider({ groupPracticeNumber: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Diagnoses</p>
          <SmallButton onClick={addDiagnosis} variant="secondary">
            Add diagnosis
          </SmallButton>
        </div>
        <div className="mt-3 space-y-3">
          {payload.diagnoses.map((d, idx) => (
            <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <Label>Code</Label>
                  <Input value={d.code} onChange={e => updateDiagnosis(idx, { code: e.target.value })} placeholder="e.g. J06.9" />
                </div>
                <div>
                  <Label>Description</Label>
                  <Input
                    value={d.description || ''}
                    onChange={e => updateDiagnosis(idx, { description: e.target.value })}
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <SmallButton onClick={() => removeDiagnosis(idx)} variant="danger" disabled={payload.diagnoses.length <= 1}>
                  Remove
                </SmallButton>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-3">
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Other (COID / contextual)</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <Label>WCA number</Label>
            <Input
              value={payload.other?.wcaNumber || ''}
              onChange={e =>
                onChange({
                  ...payload,
                  other: { ...(payload.other || {}), wcaNumber: e.target.value },
                })
              }
              placeholder="e.g. W/1361779/2"
            />
          </div>
          <div>
            <Label>Insurance reference</Label>
            <Input
              value={payload.other?.insuranceReferenceNumber || ''}
              onChange={e =>
                onChange({
                  ...payload,
                  other: { ...(payload.other || {}), insuranceReferenceNumber: e.target.value },
                })
              }
              placeholder="Employer/insurer ref"
            />
          </div>
          <div>
            <Label>Date of accident</Label>
            <Input
              type="date"
              value={payload.other?.dateOfAccident || ''}
              onChange={e =>
                onChange({
                  ...payload,
                  other: { ...(payload.other || {}), dateOfAccident: e.target.value },
                })
              }
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Line items</p>
          <SmallButton onClick={addLineItem} variant="secondary">
            Add line item
          </SmallButton>
        </div>
        <div className="mt-3 space-y-3">
          {payload.lineItems.map((li, idx) => (
            <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <Label>Procedure code</Label>
                  <Input value={li.procedureCode} onChange={e => updateLineItem(idx, { procedureCode: e.target.value })} placeholder="e.g. 99201" />
                </div>
                <div>
                  <Label>Service date</Label>
                  <Input type="date" value={li.serviceDate} onChange={e => updateLineItem(idx, { serviceDate: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <Label>Description</Label>
                  <Input value={li.description || ''} onChange={e => updateLineItem(idx, { description: e.target.value })} placeholder="Optional" />
                </div>
                <div>
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    min={0}
                    value={li.quantity}
                    onChange={e => updateLineItem(idx, { quantity: Number(e.target.value || 0) })}
                  />
                </div>
                <div>
                  <Label>Unit price (cents)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={li.unitPriceCents}
                    onChange={e => {
                      const unit = Number(e.target.value || 0);
                      const qty = Number(li.quantity || 0);
                      updateLineItem(idx, { unitPriceCents: unit, totalPriceCents: unit * qty });
                    }}
                  />
                  <p className="mt-1 text-xs text-slate-400">{formatCents(li.unitPriceCents)}</p>
                </div>
                <div>
                  <Label>Total price (cents)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={li.totalPriceCents}
                    onChange={e => updateLineItem(idx, { totalPriceCents: Number(e.target.value || 0) })}
                  />
                  <p className="mt-1 text-xs text-slate-400">{formatCents(li.totalPriceCents)}</p>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <SmallButton onClick={() => removeLineItem(idx)} variant="danger" disabled={payload.lineItems.length <= 1}>
                  Remove
                </SmallButton>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <SmallButton onClick={onAction} disabled={actionDisabled} variant={actionVariant}>
          {actionLabel}
        </SmallButton>
      </div>
    </div>
  );
}

function EligibilityTab({
  onToast,
  patient,
  userSettings,
}: {
  onToast: ToastFn;
  patient?: Patient;
  userSettings: UserSettings | null;
}) {
  const [payload, setPayload] = useState<BillingEligibilityPayload>({
    requestType: 'normal',
    memberNumber: '',
    schemeCode: '',
    planCode: '',
    dependantCode: '',
    patientDateOfBirth: '',
    patientIdNumber: '',
    patientFirstName: '',
    patientLastName: '',
    patientInitials: '',
    serviceDate: '',
    providerPracticeNumber: '',
    bhfNumber: '',
    groupPracticeNumber: '',
  });
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const compactEligibilityPayload = (p: BillingEligibilityPayload): BillingEligibilityPayload => {
    const compact = (value: string | undefined) => {
      const v = (value ?? '').trim();
      return v.length ? v : undefined;
    };

    return {
      requestType: compact(p.requestType) || 'normal',
      memberNumber: compact(p.memberNumber),
      serviceDate: p.serviceDate,
      // These are often required by upstream even if our OpenAPI marks them optional.
      schemeCode: compact(p.schemeCode)?.toUpperCase(),
      planCode: compact(p.planCode),
      dependantCode: compact(p.dependantCode),
      patientDateOfBirth: compact(p.patientDateOfBirth),
      patientIdNumber: compact(p.patientIdNumber),
      patientFirstName: compact(p.patientFirstName),
      patientLastName: compact(p.patientLastName),
      patientInitials: compact(p.patientInitials),
      providerPracticeNumber: compact(p.providerPracticeNumber),
      bhfNumber: compact(p.bhfNumber),
      groupPracticeNumber: compact(p.groupPracticeNumber),
    };
  };

  const check = async () => {
    // OpenAPI only requires serviceDate, but in practice MediKredit often needs scheme+plan
    // and either memberNumber OR patientIdNumber (IDCHECK flow).
    const hasMemberOrId = !!(payload.memberNumber ?? '').trim() || !!payload.patientIdNumber?.trim();
    if (!payload.serviceDate || !payload.schemeCode?.trim() || !payload.planCode?.trim() || !hasMemberOrId) {
      onToast('Service date, scheme code, plan code, and either member number or patient ID number are required.', 'error');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await billingCheckEligibility(compactEligibilityPayload(payload));
      setResult(res);
      onToast(`Eligibility: ${res.status}.`, res.status === 'eligible' ? 'success' : 'info');
      writeJson(LS_LAST_ELIGIBILITY, payload);
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Eligibility check failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const set = (patch: Partial<BillingEligibilityPayload>) => setPayload(prev => ({ ...prev, ...patch }));

  return (
    <Section
      title="Eligibility check"
      subtitle="Manual form. Required: memberNumber + serviceDate + schemeCode + planCode."
      right={
      <SmallButton onClick={check} disabled={loading}>
        {loading ? <RefreshCw size={16} className="animate-spin" /> : null}
        Check
      </SmallButton>
    }>
      <div className="mb-3 flex flex-wrap gap-2">
        <SmallButton
          onClick={() => {
            if (!patient) {
              onToast('Select a patient first to autofill.', 'info');
              return;
            }
            const name = splitName(patient.name || '');
            setPayload((prev) => ({
              ...prev,
              memberNumber: patient.memberNumber || patient.medicalAidNumber || prev.memberNumber,
              dependantCode: patient.dependantCode || prev.dependantCode,
              patientDateOfBirth: (patient.dob && patient.dob !== 'Unknown') ? patient.dob : prev.patientDateOfBirth,
              patientIdNumber: patient.idNumber || prev.patientIdNumber,
              patientFirstName: name.firstName || prev.patientFirstName,
              patientLastName: name.lastName || prev.patientLastName,
              planCode: patient.planCode || patient.medicalAidPlan || prev.planCode,
              schemeCode: patient.schemeCode || userSettings?.billing?.schemeCode || prev.schemeCode,
            }));
            onToast('Autofilled eligibility from patient billing fields.', 'success');
          }}
          variant="secondary"
        >
          Use patient billing
        </SmallButton>
        <SmallButton
          onClick={() => {
            const saved = readJson<BillingEligibilityPayload>(LS_LAST_ELIGIBILITY);
            if (saved) {
              setPayload(saved);
              onToast('Autofilled eligibility form from last run.', 'success');
            } else {
              onToast('No saved eligibility check yet.', 'info');
            }
          }}
          variant="secondary"
        >
          Use last eligibility
        </SmallButton>
        <SmallButton
          onClick={() => {
            const savedClaim = readJson<BillingClaimCreatePayload>(LS_LAST_SUBMIT);
            if (savedClaim) {
              setPayload(prev => ({
                ...prev,
                memberNumber: savedClaim.patient.memberNumber || prev.memberNumber,
                dependantCode: savedClaim.patient.dependantCode || prev.dependantCode,
                patientDateOfBirth: savedClaim.patient.dateOfBirth || prev.patientDateOfBirth,
                patientIdNumber: savedClaim.patient.idNumber || prev.patientIdNumber,
                patientFirstName: savedClaim.patient.firstName || prev.patientFirstName,
                patientLastName: savedClaim.patient.lastName || prev.patientLastName,
                patientInitials: savedClaim.patient.initials || prev.patientInitials,
                planCode: savedClaim.patient.planCode || prev.planCode,
                providerPracticeNumber: savedClaim.provider.practiceNumber || prev.providerPracticeNumber,
                bhfNumber: savedClaim.provider.bhfNumber || prev.bhfNumber,
                groupPracticeNumber: savedClaim.provider.groupPracticeNumber || prev.groupPracticeNumber,
              }));
              onToast('Pulled patient/provider fields from last claim.', 'success');
            } else {
              onToast('No saved claim found yet.', 'info');
            }
          }}
          variant="secondary"
        >
          Use last claim fields
        </SmallButton>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <Label>Request type</Label>
          <select
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            value={payload.requestType || 'normal'}
            onChange={e => set({ requestType: e.target.value as BillingEligibilityPayload['requestType'] })}
          >
            <option value="normal">Normal</option>
            <option value="family">Family</option>
            <option value="auth">Auth</option>
            <option value="exclusion">Exclusion</option>
            <option value="auth_and_exclusion">Auth + Exclusion</option>
          </select>
        </div>
        <div>
          <Label>Member number *</Label>
          <Input value={payload.memberNumber} onChange={e => set({ memberNumber: e.target.value })} />
        </div>
        <div>
          <Label>Service date *</Label>
          <Input type="date" value={payload.serviceDate} onChange={e => set({ serviceDate: e.target.value })} />
        </div>
        <div>
          <Label>Scheme code *</Label>
          <Input
            value={payload.schemeCode || ''}
            onChange={e => set({ schemeCode: e.target.value })}
            placeholder="e.g. DISC"
            autoCapitalize="characters"
          />
        </div>
        <div>
          <Label>Plan code *</Label>
          <Input value={payload.planCode || ''} onChange={e => set({ planCode: e.target.value })} />
        </div>
        <div>
          <Label>Dependant code</Label>
          <Input value={payload.dependantCode || ''} onChange={e => set({ dependantCode: e.target.value })} placeholder="e.g. 01" />
        </div>
        <div>
          <Label>Patient date of birth</Label>
          <Input type="date" value={payload.patientDateOfBirth || ''} onChange={e => set({ patientDateOfBirth: e.target.value })} />
        </div>
        <div>
          <Label>Patient ID number</Label>
          <Input value={payload.patientIdNumber || ''} onChange={e => set({ patientIdNumber: e.target.value })} />
        </div>
        <div>
          <Label>Patient initials</Label>
          <Input value={payload.patientInitials || ''} onChange={e => set({ patientInitials: e.target.value })} />
        </div>
        <div>
          <Label>Patient first name</Label>
          <Input value={payload.patientFirstName || ''} onChange={e => set({ patientFirstName: e.target.value })} />
        </div>
        <div>
          <Label>Patient last name</Label>
          <Input value={payload.patientLastName || ''} onChange={e => set({ patientLastName: e.target.value })} />
        </div>
        <div>
          <Label>Provider practice number</Label>
          <Input value={payload.providerPracticeNumber || ''} onChange={e => set({ providerPracticeNumber: e.target.value })} />
        </div>
        <div>
          <Label>BHF number</Label>
          <Input value={payload.bhfNumber || ''} onChange={e => set({ bhfNumber: e.target.value })} />
        </div>
        <div>
          <Label>Group practice number</Label>
          <Input value={payload.groupPracticeNumber || ''} onChange={e => set({ groupPracticeNumber: e.target.value })} />
        </div>
      </div>

      <div className="mt-4">
        {result ? (
          <pre className="max-h-[360px] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            {JSON.stringify(result, null, 2)}
          </pre>
        ) : (
          <p className="text-sm text-slate-500">Run a check to see the parsed eligibility result.</p>
        )}
      </div>
    </Section>
  );
}
