import React, { useMemo, useState } from 'react';
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

type ToastFn = (message: string, type?: 'success' | 'error' | 'info') => void;

type BillingTab = 'claims' | 'eligibility';
type ClaimsSubTab = 'list' | 'submit' | 'reverse';

export function BillingPage({ onToast }: { onToast: ToastFn }) {
  const [tab, setTab] = useState<BillingTab>('claims');

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
            <div className="flex flex-wrap gap-2">
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
          <ClaimsTab onToast={onToast} />
        ) : (
          <EligibilityTab onToast={onToast} />
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

function ClaimsTab({ onToast }: { onToast: ToastFn }) {
  const [subTab, setSubTab] = useState<ClaimsSubTab>('list');
  const [claims, setClaims] = useState<StoredClaimRecord[] | null>(null);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [selectedClaimId, setSelectedClaimId] = useState<string>('');
  const [selectedClaim, setSelectedClaim] = useState<StoredClaimRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [submitPayload, setSubmitPayload] = useState<BillingClaimCreatePayload>({
    patient: {
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      initials: '',
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
  });

  const [reversalTx, setReversalTx] = useState('');
  const [reversalPayload, setReversalPayload] = useState<BillingClaimCreatePayload>({
    patient: {
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      initials: '',
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
  });

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
      onToast(`Loaded ${data.length} claim(s).`, 'success');
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Failed to load claims.', 'error');
    } finally {
      setClaimsLoading(false);
    }
  };

  const loadClaimDetail = async () => {
    if (!selectedClaimId.trim()) return;
    setDetailLoading(true);
    try {
      const data = await billingGetClaimById(selectedClaimId.trim());
      setSelectedClaim(data);
      onToast('Claim loaded.', 'success');
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Failed to load claim.', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const submitClaim = async () => {
    try {
      const result = await billingSubmitClaim(submitPayload);
      onToast(`Claim ${result.status}.`, result.status === 'accepted' ? 'success' : 'info');
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
            <SmallButton onClick={refreshClaims} disabled={claimsLoading} variant="secondary">
              <RefreshCw size={16} className={claimsLoading ? 'animate-spin' : ''} />
              Refresh
            </SmallButton>
          </div>
        }
      >
        {subTab === 'list' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Recent claims</p>
              {claims === null ? (
                <p className="text-sm text-slate-500">Click refresh to load claims.</p>
              ) : claims.length === 0 ? (
                <p className="text-sm text-slate-500">No claims found.</p>
              ) : (
                <div className="space-y-2">
                  {claims.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedClaimId(c.id);
                        setSelectedClaim(null);
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:bg-slate-50"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {c.patientLastName || '—'}
                        </p>
                        <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                          {c.status}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        Member: {c.memberNumber} • Tx: {c.transactionNumber || '—'}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Fetch by ID</p>
              <div className="flex gap-2">
                <Input
                  value={selectedClaimId}
                  onChange={e => setSelectedClaimId(e.target.value)}
                  placeholder="Claim UUID"
                />
                <SmallButton onClick={loadClaimDetail} disabled={detailLoading}>
                  {detailLoading ? <RefreshCw size={16} className="animate-spin" /> : null}
                  Load
                </SmallButton>
              </div>
              <div className="mt-3">
                {selectedClaim ? (
                  <pre className="max-h-[340px] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                    {JSON.stringify(selectedClaim, null, 2)}
                  </pre>
                ) : (
                  <p className="text-sm text-slate-500">
                    Select a claim or load one by id to view details.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {subTab === 'submit' && (
          <div className="mt-1">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Submit new claim
            </p>
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
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="md:col-span-2">
                <Label>Select claim to reverse</Label>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
                  value={reversalTx}
                  onChange={e => {
                    const tx = e.target.value;
                    setReversalTx(tx);
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

function EligibilityTab({ onToast }: { onToast: ToastFn }) {
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
    if (!(payload.memberNumber ?? '').trim() || !payload.serviceDate || !payload.schemeCode?.trim() || !payload.planCode?.trim()) {
      onToast('Member number, service date, scheme code, and plan code are required.', 'error');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await billingCheckEligibility(compactEligibilityPayload(payload));
      setResult(res);
      onToast(`Eligibility: ${res.status}.`, res.status === 'eligible' ? 'success' : 'info');
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
