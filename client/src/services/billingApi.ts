export const BILLING_API_BASE = 'https://medikredit-integration-dev-17803b194e77.herokuapp.com';

export class BillingApiError extends Error {
  status: number;
  body?: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'BillingApiError';
    this.status = status;
    this.body = body;
  }
}

async function billingRequest<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const base = BILLING_API_BASE.replace(/\/$/, '');
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    throw new BillingApiError(
      `Billing API unreachable. ${error instanceof Error ? error.message : 'Unknown error'}`,
      0
    );
  }

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  let data: unknown = null;
  if (isJson) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else {
    // Non-JSON responses should still surface a readable error.
    try {
      data = await res.text();
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const message =
      (data && typeof data === 'object' && 'message' in (data as Record<string, unknown>) && typeof (data as any).message === 'string'
        ? (data as any).message
        : isJson && data && typeof data === 'object' && 'error' in (data as Record<string, unknown>) && typeof (data as any).error === 'string'
          ? (data as any).error
          : typeof data === 'string' && data.trim()
            ? data
            : `Billing API request failed (${res.status})`);
    throw new BillingApiError(message, res.status, data);
  }

  return data as T;
}

// ---- Types (aligned to provided OpenAPI) ----

export interface BasicHealthDto {
  status: string;
}

export interface MedikreditHealthOkDto {
  medikredit: 'ok';
  statusCode: number;
}

export interface MedikreditHealthUnavailableDto {
  medikredit: 'unavailable';
  statusCode: number;
  message: string;
}

export interface StoredClaimRecord {
  id: string;
  transactionNumber?: string;
  memberNumber: string;
  patientFirstName?: string;
  patientLastName?: string;
  dependantCode?: string;
  status: string;
  messages: string[];
  reversed: boolean;
  reversalStatus?: string;
  reversalMessages: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BillingPatientPayload {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  initials?: string;
  dependantCode?: string;
  idNumber?: string;
  memberNumber: string;
  planCode?: string;
}

export interface BillingProviderPayload {
  name: string;
  practiceNumber?: string;
  hpcNumber?: string;
  bhfNumber?: string;
  groupPracticeNumber?: string;
}

export interface BillingDiagnosisPayload {
  code: string;
  description?: string;
}

export interface BillingClaimLineItemPayload {
  procedureCode: string;
  description?: string;
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
  serviceDate: string;
}

export interface BillingClaimCreatePayload {
  patient: BillingPatientPayload;
  provider: BillingProviderPayload;
  diagnoses: BillingDiagnosisPayload[];
  lineItems: BillingClaimLineItemPayload[];
}

export interface BillingClaimReversePayload extends BillingClaimCreatePayload {
  transactionNumber: string;
}

export interface ClaimResultDto {
  claimId?: string;
  status: 'pending' | 'accepted' | 'rejected' | string;
  authorizationNumber?: string;
  transactionNumber?: string;
  messages: string[];
}

export interface BillingEligibilityPayload {
  memberNumber: string;
  schemeCode?: string;
  planCode?: string;
  dependantCode?: string;
  patientDateOfBirth?: string;
  patientIdNumber?: string;
  patientFirstName?: string;
  patientLastName?: string;
  patientInitials?: string;
  serviceDate: string;
  providerPracticeNumber?: string;
  bhfNumber?: string;
  groupPracticeNumber?: string;
}

export interface EligibilityResponseDto {
  status: 'eligible' | 'ineligible' | 'unknown' | string;
  messages: string[];
}

export interface BillingEraIngestPayload {
  content: string;
  sourceFileName?: string;
}

export interface StoredEraRecord {
  id: string;
  transactionNumber: string;
  remittanceNumber?: string;
  memberNumber?: string;
  dependantCode?: string;
  status: string;
  serviceDate?: string;
  paymentDate?: string;
  totalClaimedCents?: number;
  totalPaidCents?: number;
  notes?: string;
  rawPayload?: string;
  lineItems: Array<{
    lineNumber?: number;
    procedureCode?: string;
    claimedAmountCents?: number;
    paidAmountCents?: number;
    adjustmentReason?: string;
    messages?: string[];
  }>;
  reconciliationStatus: string;
  reconciliationNotes?: string;
  varianceCents?: number;
  linkedClaimId?: string;
  createdAt: string;
  updatedAt: string;
}

// ---- API helpers ----

export const billingHealth = () => billingRequest<BasicHealthDto>('/health');

export const billingMedikreditHealth = async () => {
  try {
    return await billingRequest<MedikreditHealthOkDto>('/health/medikredit');
  } catch (e) {
    if (e instanceof BillingApiError && e.status === 503) {
      return e.body as MedikreditHealthUnavailableDto;
    }
    throw e;
  }
};

export const billingGetClaims = (params?: { limit?: number; offset?: number }) => {
  const qs = new URLSearchParams();
  if (typeof params?.limit === 'number') qs.set('limit', String(params.limit));
  if (typeof params?.offset === 'number') qs.set('offset', String(params.offset));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return billingRequest<StoredClaimRecord[]>(`/claims${suffix}`);
};

export const billingGetClaimById = (id: string) =>
  billingRequest<StoredClaimRecord>(`/claims/${encodeURIComponent(id)}`);

export const billingSubmitClaim = (payload: BillingClaimCreatePayload) =>
  billingRequest<ClaimResultDto>('/claims', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const billingReverseClaim = (payload: BillingClaimReversePayload) =>
  billingRequest<ClaimResultDto>('/claims/reversal', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const billingCheckEligibility = (payload: BillingEligibilityPayload) =>
  billingRequest<EligibilityResponseDto>('/eligibility-checks', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const billingIngestEra = (payload: BillingEraIngestPayload) =>
  billingRequest<StoredEraRecord[]>('/era/ingest', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const billingGetErasByTransactionNumber = (transactionNumber?: string) => {
  const qs = new URLSearchParams();
  if (transactionNumber) qs.set('transactionNumber', transactionNumber);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return billingRequest<StoredEraRecord[]>(`/era${suffix}`);
};

export const billingGetEraById = (id: string) =>
  billingRequest<StoredEraRecord>(`/era/${encodeURIComponent(id)}`);

export const billingCreateEra = (payload: {
  transactionNumber: string;
  status: 'paid' | 'part_paid' | 'rejected' | 'pending' | string;
  remittanceNumber?: string;
  memberNumber?: string;
  dependantCode?: string;
  serviceDate?: string;
  paymentDate?: string;
  totalClaimedCents?: number;
  totalPaidCents?: number;
  notes?: string;
  rawPayload?: string;
  lineItems?: Array<{
    lineNumber?: number;
    procedureCode?: string;
    claimedAmountCents?: number;
    paidAmountCents?: number;
    adjustmentReason?: string;
    messages?: string[];
  }>;
}) =>
  billingRequest<StoredEraRecord>('/era', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

