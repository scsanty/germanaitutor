'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { BTN, FOCUS, HINT, LINK, PAGE_TITLE } from './adminStyles';

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsText(file);
  });
}

export function PlacementExamAdmin({ questionCount }: { questionCount: number }) {
  const [count, setCount] = useState(questionCount);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function upload() {
    if (!file) return;
    const format = /\.ya?ml$/i.test(file.name) ? 'yaml' : 'json';
    setUploading(true);
    setErrors([]);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/placement-exam?format=${format}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: await readText(file),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCount(data.questionCount);
        setMessage(`Exam replaced: ${data.questionCount} questions.`);
      } else {
        setErrors(Array.isArray(data.errors) ? data.errors : [data.error ?? `Upload failed (${res.status})`]);
      }
    } catch (err) {
      setErrors([(err as Error).message]);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className={PAGE_TITLE}>Placement exam</h1>
      <Card className="min-w-0 gap-3">
        <CardHeader>
          <p className="text-lg font-semibold">The active exam has {count} questions.</p>
        </CardHeader>
        <CardContent>
          <p className="flex flex-wrap items-center gap-x-2">
            <span className={HINT}>Download:</span>
            <a href="/api/admin/placement-exam?format=json" className={LINK}>
              <Download aria-hidden className="size-4" />
              JSON
            </a>
            <a href="/api/admin/placement-exam?format=yaml" className={LINK}>
              <Download aria-hidden className="size-4" />
              YAML
            </a>
          </p>
        </CardContent>
      </Card>
      <Card className="min-w-0 gap-3">
        <CardHeader>
          <h2 className="text-lg leading-tight">Replace the exam</h2>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className={`${HINT} max-w-prose`}>
            Upload a JSON or YAML file in the same format as the download. The whole exam is replaced. A file with any
            problem is rejected and nothing changes. Past placement results and unlocked levels are kept.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              aria-label="Exam file"
              accept=".json,.yaml,.yml"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className={`min-h-11 max-w-full min-w-0 rounded-md border bg-transparent p-2 text-sm file:mr-3 file:rounded-sm file:border-0 file:bg-surface-raised file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-text ${FOCUS}`}
            />
            <Button type="button" className={BTN} onClick={upload} disabled={!file || uploading}>
              Upload
            </Button>
          </div>
          {message && <p role="status">{message}</p>}
          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                <p>The upload was rejected:</p>
                <ul className="mt-1 list-disc pl-5">
                  {errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
