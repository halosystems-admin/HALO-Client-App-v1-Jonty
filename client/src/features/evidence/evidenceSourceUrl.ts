import type { EvidenceSource } from '../../../../shared/types';

/** Always returns an https URL for opening in a new tab (PubMed search fallback). */
export function resolveEvidenceSourceUrl(src: EvidenceSource): string {
  if (src.url && /^https?:\/\//i.test(src.url.trim())) {
    return src.url.trim();
  }
  const q = [src.title, src.organizationOrJournal, src.year].filter(Boolean).join(' ');
  return `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(q)}`;
}
