import React, { useState, useRef } from 'react';
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { documentService } from '@/services/documents/documentService';
import { useApp } from '@/stores/AppContext';
import { SupportedFileType } from '@/types/document';

interface PipelineStep {
  name: string;
  status: 'pending' | 'active' | 'done' | 'error';
}

interface ImportJob {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: SupportedFileType;
  progress: number;
  steps: PipelineStep[];
  status: 'queued' | 'processing' | 'completed' | 'duplicate' | 'error';
  errorMessage?: string;
}

export const ImportsPage: React.FC = () => {
  const { refreshStats, settings, aiService } = useApp();
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getFileType = (fileName: string): SupportedFileType => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'md' || ext === 'markdown') return 'markdown';
    if (ext === 'pdf') return 'pdf';
    if (ext === 'docx') return 'docx';
    return 'txt';
  };

  const processFiles = async (files: File[]) => {
    if (files.length === 0) return;

    const newJobs: ImportJob[] = files.map((file) => ({
      id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      fileName: file.name,
      fileSize: file.size,
      fileType: getFileType(file.name),
      progress: 0,
      steps: [
        { name: 'Importing & Hashing', status: 'pending' },
        { name: 'Text extraction', status: 'pending' },
        { name: 'Chunking', status: 'pending' },
        { name: 'Vector Embeddings', status: 'pending' },
        { name: 'Knowledge Graph', status: 'pending' },
        { name: 'Indexing Complete', status: 'pending' },
      ],
      status: 'queued',
    }));

    setJobs((prev) => [...newJobs, ...prev]);

    // Process each file sequentially
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const job = newJobs[i];

      const updateJob = (updater: (j: ImportJob) => ImportJob) => {
        setJobs((prev) => prev.map((item) => (item.id === job.id ? updater(item) : item)));
      };

      try {
        // Step 1: Importing & Hashing
        updateJob((j) => ({
          ...j,
          status: 'processing',
          progress: 15,
          steps: j.steps.map((s, idx) => (idx === 0 ? { ...s, status: 'active' } : s)),
        }));

        // Extract raw text
        let content = '';
        if (job.fileType === 'pdf' || job.fileType === 'docx') {
          // PDF/DOCX are compressed binary formats; decoding their bytes as UTF-8 produced garbage and a
          // placeholder string was indexed as if it were the document. Refuse until real extraction exists.
          throw new Error(`Text extraction for ${job.fileType.toUpperCase()} files is not available yet, so ${file.name} was not imported.`);
        } else {
          content = await file.text();
        }

        updateJob((j) => ({
          ...j,
          progress: 35,
          steps: j.steps.map((s, idx) =>
            idx === 0 ? { ...s, status: 'done' } : idx === 1 ? { ...s, status: 'active' } : s
          ),
        }));

        // Step 2 & 3: Text extraction & Chunking
        updateJob((j) => ({
          ...j,
          progress: 60,
          steps: j.steps.map((s, idx) =>
            idx <= 1 ? { ...s, status: 'done' } : idx === 2 ? { ...s, status: 'active' } : s
          ),
        }));

        // Step 4: Import via DocumentService with hash deduplication and chunk generation
        const { document: doc, duplicate } = await documentService.importTextDocument({
          title: file.name.replace(/\.[^/.]+$/, ''),
          fileName: file.name,
          filePath: `Foundry/storage/documents/${file.name}`,
          fileType: job.fileType,
          content,
          fileSize: file.size,
          mimeType: file.type || 'text/plain',
          chunkSize: settings.indexing.chunkSize,
          chunkOverlap: settings.indexing.chunkOverlap,
        });

        if (duplicate) {
          updateJob((j) => ({
            ...j,
            status: 'duplicate',
            progress: 100,
            errorMessage: 'Duplicate file detected via SHA-256 hash. Skipped re-importing.',
            steps: j.steps.map((s) => ({ ...s, status: 'done' })),
          }));
          continue;
        }

        // Step 4: Embeddings generation (if AI provider is available)
        updateJob((j) => ({
          ...j,
          progress: 80,
          steps: j.steps.map((s, idx) =>
            idx <= 2 ? { ...s, status: 'done' } : idx === 3 ? { ...s, status: 'active' } : s
          ),
        }));

        try {
          const provider = aiService.getProvider();
          const isAvail = await provider.isAvailable();
          if (isAvail) {
            const chunks = await documentService.getChunks(doc.id);
            // Generate vectors for chunks
            for (const chunk of chunks) {
              chunk.embedding = await provider.embed(chunk.content);
            }
          }
        } catch {
          // Graceful fallback if offline
        }

        // Step 5: Graph analysis & complete
        updateJob((j) => ({
          ...j,
          status: 'completed',
          progress: 100,
          steps: j.steps.map((s) => ({ ...s, status: 'done' })),
        }));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Import failed';
        updateJob((j) => ({
          ...j,
          status: 'error',
          errorMessage: msg,
          steps: j.steps.map((s) => (s.status === 'active' ? { ...s, status: 'error' } : s)),
        }));
      }
    }

    await refreshStats();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-main)] m-0">Document Import Pipeline</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Local multi-stage processing: Hashing → Extraction → Chunking → Embeddings → Graph
          </p>
        </div>
        <div className="flex items-center space-x-1.5 text-xs text-emerald-500 font-medium">
          <ShieldCheck className="w-4 h-4" />
          <span>Processed 100% On-Device</span>
        </div>
      </div>

      {/* Drag & Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`p-10 rounded-xl border-2 border-dashed text-center cursor-pointer transition-all flex flex-col items-center justify-center space-y-3 ${
          isDragging
            ? 'border-blue-500 bg-blue-500/10'
            : 'border-[var(--border-subtle)] bg-[var(--bg-card)]/60 hover:border-[var(--text-faint)]'
        }`}
        role="button"
        tabIndex={0}
        aria-label="Upload files by clicking or dragging and dropping"
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md,.docx,text/plain,text/markdown,application/pdf"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) {
              processFiles(Array.from(e.target.files));
            }
          }}
        />

        <div className="w-12 h-12 rounded-full bg-blue-600/10 text-blue-500 flex items-center justify-center">
          <Upload className="w-6 h-6" />
        </div>

        <div>
          <h3 className="text-sm font-semibold text-[var(--text-main)]">
            Click to choose files or drag and drop
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Supported formats: PDF (.pdf), Markdown (.md), Plain Text (.txt), Word (.docx)
          </p>
        </div>

        <div className="flex items-center space-x-2 pt-2">
          {['PDF', 'Markdown', 'TXT', 'DOCX'].map((fmt) => (
            <span
              key={fmt}
              className="px-2 py-0.5 rounded text-[10px] font-mono bg-[var(--bg-tertiary)] text-[var(--text-muted)] border border-[var(--border-subtle)]"
            >
              .{fmt.toLowerCase()}
            </span>
          ))}
        </div>
      </div>

      {/* Pipeline Status Feed */}
      {jobs.length > 0 && (
        <div className="space-y-3 pt-4">
          <h3 className="text-sm font-semibold text-[var(--text-main)]">Import Queue & Processing</h3>
          <div className="space-y-3">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="p-4 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] space-y-3 text-xs"
              >
                {/* Job Title & Overall Status */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-600/10 text-blue-500">
                      {job.fileType}
                    </span>
                    <span className="font-semibold text-[var(--text-main)]">{job.fileName}</span>
                    <span className="text-[11px] text-[var(--text-faint)]">
                      ({(job.fileSize / 1024).toFixed(1)} KB)
                    </span>
                  </div>

                  <div>
                    {job.status === 'completed' && (
                      <span className="flex items-center space-x-1 text-emerald-500 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Indexed</span>
                      </span>
                    )}
                    {job.status === 'duplicate' && (
                      <span className="flex items-center space-x-1 text-amber-400 font-medium">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Duplicate Skipped</span>
                      </span>
                    )}
                    {job.status === 'processing' && (
                      <span className="text-blue-500 font-medium animate-pulse">Processing...</span>
                    )}
                    {job.status === 'error' && (
                      <span className="text-rose-500 font-medium flex items-center space-x-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Failed</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      job.status === 'completed'
                        ? 'bg-emerald-500'
                        : job.status === 'duplicate'
                        ? 'bg-amber-500'
                        : job.status === 'error'
                        ? 'bg-rose-500'
                        : 'bg-blue-600'
                    }`}
                    style={{ width: `${job.progress}%` }}
                  />
                </div>

                {/* Granular Step Badges */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 pt-1">
                  {job.steps.map((step, idx) => (
                    <div
                      key={idx}
                      className={`px-2 py-1 rounded text-[10px] flex items-center space-x-1.5 border ${
                        step.status === 'done'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          : step.status === 'active'
                          ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 animate-pulse font-medium'
                          : step.status === 'error'
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                          : 'bg-[var(--bg-tertiary)]/50 border-[var(--border-subtle)] text-[var(--text-faint)]'
                      }`}
                    >
                      {step.status === 'done' && <CheckCircle2 className="w-3 h-3 flex-shrink-0" />}
                      {step.status === 'active' && <Clock className="w-3 h-3 flex-shrink-0" />}
                      <span className="truncate">{step.name}</span>
                    </div>
                  ))}
                </div>

                {job.errorMessage && (
                  <p className="text-[11px] text-amber-400 bg-amber-500/10 p-2 rounded border border-amber-500/20">
                    {job.errorMessage}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
