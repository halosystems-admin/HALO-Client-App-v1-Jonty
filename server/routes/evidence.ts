import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { generateText, safeJsonParse } from '../services/gemini';
import { fetchAllFilesInFolder, extractTextFromFile } from '../services/drive';
import { evidenceStructuredPrompt } from '../utils/prompts';
import type {
  EvidenceQueryResponse,
  EvidenceSource,
  EvidenceSourceType,
} from '../../shared/types';

const router = Router();
router.use(requireAuth);

const SOURCE_TYPES: EvidenceSourceType[] = [
  'guideline',
  'trial',
  'review',
  'drug_label',
  'public_health',
  'other',
];

function isValidSourceType(t: string): t is EvidenceSourceType {
  return SOURCE_TYPES.includes(t as EvidenceSourceType);
}

function pubmedSearchUrl(title: string, organizationOrJournal?: string, year?: string): string {
  const q = [title, organizationOrJournal, year].filter(Boolean).join(' ');
  return `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(q)}`;
}

async function buildPatientFolderContext(token: string, patientId: string): Promise<string> {
  const allFiles = await fetchAllFilesInFolder(token, patientId);
  const readableFiles = allFiles.filter(
    f =>
      f.name.endsWith('.txt') ||
      f.name.endsWith('.pdf') ||
      f.name.endsWith('.docx') ||
      f.name.endsWith('.doc') ||
      f.mimeType === 'text/plain' ||
      f.mimeType === 'application/pdf' ||
      f.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      f.mimeType === 'application/msword' ||
      f.mimeType === 'application/vnd.google-apps.document'
  ).slice(0, 10);

  const contextParts: string[] = [];
  const fileList = allFiles
    .filter(f => f.mimeType !== 'application/vnd.google-apps.folder')
    .map(f => `- ${f.name} (${f.mimeType})`)
    .join('\n');
  contextParts.push(`Patient files:\n${fileList}`);

  for (const file of readableFiles) {
    const textContent = await extractTextFromFile(token, file, 2000);
    if (textContent.trim()) {
      contextParts.push(`\n--- File: ${file.name} ---\n${textContent}`);
    }
  }

  return contextParts.join('\n').substring(0, 15000);
}

interface RawEvidencePayload {
  sections?: {
    bottomLine?: string;
    keyEvidence?: string;
    patientApplication?: string;
    caveats?: string;
    practicalTakeaways?: string;
  };
  sources?: Array<{
    id?: string | number;
    title?: string;
    organizationOrJournal?: string;
    year?: string;
    type?: string;
    url?: string;
    relevanceNote?: string;
  }>;
  answerSegments?: Array<{ text?: string; sourceIds?: string[] }>;
  images?: unknown[];
}

function normalizeResponse(
  query: string,
  raw: RawEvidencePayload,
  hasPatient: boolean
): EvidenceQueryResponse {
  const sec = raw.sections || {};
  const bottomLine = typeof sec.bottomLine === 'string' ? sec.bottomLine : 'Evidence summary unavailable.';
  const keyEvidence = typeof sec.keyEvidence === 'string' ? sec.keyEvidence : '';
  const caveats = typeof sec.caveats === 'string' ? sec.caveats : '';
  const practicalTakeaways = typeof sec.practicalTakeaways === 'string' ? sec.practicalTakeaways : '';

  let patientApplication: string | undefined =
    typeof sec.patientApplication === 'string' ? sec.patientApplication : undefined;
  if (!hasPatient) {
    patientApplication = undefined;
  }

  const rawSources = Array.isArray(raw.sources) ? raw.sources : [];
  const sources: EvidenceSource[] = rawSources.map((s, idx) => {
    const id = String(s.id ?? idx + 1);
    const type: EvidenceSourceType =
      s.type && isValidSourceType(s.type) ? s.type : 'other';
    return {
      id,
      title: typeof s.title === 'string' && s.title.trim() ? s.title : `Source ${id}`,
      organizationOrJournal:
        typeof s.organizationOrJournal === 'string' ? s.organizationOrJournal : undefined,
      year: typeof s.year === 'string' ? s.year : undefined,
      type,
      url:
        typeof s.url === 'string' && s.url.startsWith('http')
          ? s.url
          : pubmedSearchUrl(
              typeof s.title === 'string' && s.title.trim() ? s.title : `Source ${id}`,
              typeof s.organizationOrJournal === 'string' ? s.organizationOrJournal : undefined,
              typeof s.year === 'string' ? s.year : undefined
            ),
      relevanceNote: typeof s.relevanceNote === 'string' ? s.relevanceNote : undefined,
    };
  });

  const answerSegments = Array.isArray(raw.answerSegments)
    ? raw.answerSegments
        .filter(seg => seg && typeof seg.text === 'string')
        .map(seg => ({
          text: seg.text as string,
          sourceIds: Array.isArray(seg.sourceIds)
            ? seg.sourceIds.map(x => String(x))
            : [],
        }))
    : undefined;

  return {
    query,
    sections: {
      bottomLine,
      keyEvidence,
      ...(patientApplication !== undefined && patientApplication !== ''
        ? { patientApplication }
        : {}),
      caveats,
      practicalTakeaways,
    },
    sources,
    answerSegments,
    images: [],
  };
}

function emptyFallback(query: string, hasPatient: boolean): EvidenceQueryResponse {
  return normalizeResponse(
    query,
    {
      sections: {
        bottomLine:
          'We could not generate a structured evidence summary. Please try again or rephrase your question.',
        keyEvidence: '',
        caveats: 'If this persists, check that the AI service is configured on the server.',
        practicalTakeaways: 'Retry the search; consider narrowing the clinical question.',
        ...(hasPatient ? { patientApplication: 'Not available — generation failed.' } : {}),
      },
      sources: [],
      answerSegments: [],
      images: [],
    },
    hasPatient
  );
}

// POST /query — structured clinical evidence answer
router.post('/query', async (req: Request, res: Response) => {
  try {
    const { query, patientId, patientName: bodyPatientName, patientSummary } = req.body as {
      query?: string;
      patientId?: string;
      patientName?: string;
      /** HALO patient-summary.md markdown from client when a patient is selected */
      patientSummary?: string;
    };

    if (!query || typeof query !== 'string' || !query.trim()) {
      res.status(400).json({ error: 'query is required.' });
      return;
    }

    const trimmed = query.trim();
    const token = req.session.accessToken;

    const hasPatientId = Boolean(patientId && typeof patientId === 'string');
    const hasPatient = hasPatientId && Boolean(token);

    const summaryText =
      typeof patientSummary === 'string' && patientSummary.trim()
        ? patientSummary.trim().slice(0, 12_000)
        : '';

    let folderContext = '';
    if (hasPatient && token && patientId) {
      try {
        folderContext = await buildPatientFolderContext(token, patientId);
      } catch (e) {
        console.error('Evidence patient context error:', e);
        folderContext = '';
      }
    }

    let patientContext = '';
    if (summaryText) {
      patientContext += `HALO persistent patient summary (patient-summary.md):\n${summaryText}\n\n`;
    }
    if (folderContext) {
      patientContext += folderContext;
    }

    const patientName = typeof bodyPatientName === 'string' ? bodyPatientName : undefined;
    const prompt = evidenceStructuredPrompt(
      trimmed,
      patientContext,
      patientName,
      hasPatientId
    );

    let text: string;
    try {
      text = await generateText(prompt);
    } catch (err) {
      console.error('Evidence generateText error:', err);
      res.status(500).json({ error: 'Could not generate evidence summary. Please try again.' });
      return;
    }

    const parsed = safeJsonParse<RawEvidencePayload>(text, {});
    const parseFailed = Object.keys(parsed).length === 0;

    if (parseFailed) {
      res.json(emptyFallback(trimmed, hasPatientId));
      return;
    }

    const normalized = normalizeResponse(trimmed, parsed, hasPatientId);
    res.json(normalized);
  } catch (err) {
    console.error('Evidence /query error:', err);
    res.status(500).json({ error: 'Evidence request failed. Please try again.' });
  }
});

export default router;
