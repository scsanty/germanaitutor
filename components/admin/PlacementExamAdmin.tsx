'use client';

import { useState } from 'react';

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
    <div>
      <a href="/admin/curriculum">Back to curriculum</a>
      <h1>Placement exam</h1>
      <p>The active exam has {count} questions.</p>
      <p>
        Download: <a href="/api/admin/placement-exam?format=json">JSON</a> ·{' '}
        <a href="/api/admin/placement-exam?format=yaml">YAML</a>
      </p>
      <h2>Replace the exam</h2>
      <p>
        Upload a JSON or YAML file in the same format as the download. The whole exam is replaced. A file with any problem
        is rejected and nothing changes. Past placement results and unlocked levels are kept.
      </p>
      <input
        type="file"
        aria-label="Exam file"
        accept=".json,.yaml,.yml"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <button type="button" onClick={upload} disabled={!file || uploading}>
        Upload
      </button>
      {message && <p>{message}</p>}
      {errors.length > 0 && (
        <div role="alert">
          <p>The upload was rejected:</p>
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
