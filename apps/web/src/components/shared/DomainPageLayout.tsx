import { useCallback, useEffect } from 'react';
import type { Domain } from '@docintel/ai-engine';
import { useDocumentStore } from '../../stores/useDocumentStore';
import { DocumentLibrary } from '../documents/DocumentLibrary';
import { DocumentViewer } from '../documents/DocumentViewer';
import { ChatPanel } from './ChatPanel';
import { FileUploader } from './FileUploader';
import { ProcessingProgress } from '../documents/ProcessingProgress';

interface DomainPageLayoutProps {
  domain: Domain;
  title: string;
  children?: React.ReactNode;
}

export function DomainPageLayout({ domain, title, children }: DomainPageLayoutProps) {
  const documents = useDocumentStore((s) => s.documents);
  const selectedDocumentId = useDocumentStore((s) => s.selectedDocumentId);
  const processingStatus = useDocumentStore((s) => s.processingStatus);
  const processingProgress = useDocumentStore((s) => s.processingProgress);
  const processingStatusText = useDocumentStore((s) => s.processingStatusText);
  const loadDocuments = useDocumentStore((s) => s.loadDocuments);
  const selectDocument = useDocumentStore((s) => s.selectDocument);
  const uploadAndIngest = useDocumentStore((s) => s.uploadAndIngest);
  const deleteDocument = useDocumentStore((s) => s.deleteDocument);

  useEffect(() => {
    loadDocuments(domain);
  }, [domain, loadDocuments]);

  const handleFiles = useCallback(async (files: File[]) => {
    for (const file of files) {
      try {
        await uploadAndIngest(file, domain);
      } catch {
        // Individual file failure doesn't block remaining files
      }
    }
  }, [uploadAndIngest, domain]);

  return (
    <div className="flex h-full gap-4">
      {/* Left panel — documents */}
      <div className="flex w-64 shrink-0 flex-col gap-4 overflow-auto">
        <h2 className="text-lg font-bold">{title}</h2>
        <FileUploader onFiles={handleFiles} />
        {processingStatus !== 'idle' && (
          <ProcessingProgress
            status={processingStatus}
            progress={processingProgress}
            statusText={processingStatusText}
          />
        )}
        <DocumentLibrary
          documents={documents}
          selectedId={selectedDocumentId}
          onSelect={selectDocument}
          onDelete={deleteDocument}
        />
      </div>

      {/* Center panel — viewer + domain-specific */}
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-auto">
        {children}
        {selectedDocumentId != null && <DocumentViewer documentId={selectedDocumentId} />}
      </div>

      {/* Right panel — chat */}
      <div className="flex w-80 shrink-0 flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <ChatPanel
          placeholder={`Ask about your ${domain} documents...`}
        />
      </div>
    </div>
  );
}
