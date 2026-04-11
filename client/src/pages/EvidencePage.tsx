import React, { useEffect, useState } from 'react';
import type { Patient } from '../../../shared/types';
import { fetchPatientSummary } from '../services/api';
import { EvidencePanel } from '../features/evidence';

interface Props {
  patients: Patient[];
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const EvidencePage: React.FC<Props> = ({ patients, onToast }) => {
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [patientSummaryMarkdown, setPatientSummaryMarkdown] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    if (!selectedPatientId) {
      setPatientSummaryMarkdown('');
      setSummaryLoading(false);
      return;
    }
    let cancelled = false;
    setSummaryLoading(true);
    setPatientSummaryMarkdown('');
    fetchPatientSummary(selectedPatientId)
      .then((res) => {
        if (!cancelled) setPatientSummaryMarkdown(res.markdown || '');
      })
      .catch(() => {
        if (!cancelled) setPatientSummaryMarkdown('');
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPatientId]);

  const selectedPatient = patients.find((p) => p.id === selectedPatientId) ?? null;

  return (
    <EvidencePanel
      patients={patients}
      selectedPatient={selectedPatient}
      selectedPatientId={selectedPatientId}
      onSelectPatient={setSelectedPatientId}
      patientSummaryMarkdown={patientSummaryMarkdown}
      summaryLoading={summaryLoading}
      onToast={onToast}
    />
  );
};
