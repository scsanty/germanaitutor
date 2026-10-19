'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import type { TeilSetContent, TeilSetRow, TeilSetStatus } from '@/lib/exam/teilSets';
import type { AudioQuestionsContent, ClozeContent, MatchingContent, PassageQuestionsContent } from '@/lib/curriculum/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import { BTN, FIELD_LABEL, FOCUS, HINT, LINK, TABLE, TABLE_WRAP, TD, TH } from './adminStyles';
import { TeilSetEditor } from './TeilSetEditor';
import { AudioActions } from './AudioActions';
import { readText } from './readText';

export interface ExamPracticeFormatOption {
  id: string;
  name: string;
  parts: { id: string; title: string; taskType: string; items: number }[];
}

const STATUS_VARIANT: Record<TeilSetStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  starter: 'secondary',
  unreviewed: 'outline',
  approved: 'default',
  rejected: 'destructive',
  reserved: 'secondary',
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const DANGER = `${BTN} text-destructive hover:text-destructive`;

function previewText(set: TeilSetContent): string {
  switch (set.taskType) {
    case 'passage_questions':
      return (set.content as PassageQuestionsContent).passage;
    case 'matching':
      return (set.content as MatchingContent).items[0] ?? '';
    case 'cloze':
      return (set.content as ClozeContent).text;
    case 'audio_questions':
      // The spoken words without the speaker tags and the filter line.
      return (set.content as AudioQuestionsContent).transcript
        .split('\n')
        .filter((l) => !l.trim().startsWith('@filter'))
        .map((l) => l.replace(/^\s*\[[^\]]*\]\s*/, ''))
        .join(' ');
  }
}

// Spec: the list shows a short read-only preview of each set's German text.
export function previewOf(set: TeilSetContent | null): string {
  if (!set) return '';
  const text = previewText(set);
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > 80 ? `${flat.slice(0, 79)}…` : flat;
}

async function errorOf(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return typeof data.error === 'string' ? data.error : `Request failed (${res.status})`;
}

// Admin-only, English. Spec: review, edit, duplicate, delete, upload and download exam practice sets per Teil.
export function ExamPracticeAdmin({ formats }: { formats: ExamPracticeFormatOption[] }) {
  const [formatId, setFormatId] = useState(formats[0]?.id ?? '');
  const parts = formats.find((f) => f.id === formatId)?.parts ?? [];
  const [partId, setPartId] = useState(parts[0]?.id ?? '');
  const [rows, setRows] = useState<TeilSetRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<{ id: string; set: TeilSetContent } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  const query = `formatId=${encodeURIComponent(formatId)}&partId=${encodeURIComponent(partId)}`;

  useEffect(() => {
    if (!formatId || !partId) return;
    let cancelled = false;
    fetch(`/api/admin/exam-practice?${query}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as TeilSetRow[];
        if (!cancelled) {
          setRows(data);
          setLoadFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [formatId, partId, query, reload]);

  function choosePart(nextFormat: string, nextPart: string) {
    setFormatId(nextFormat);
    setPartId(nextPart);
    setRows(null);
    setEditing(null);
    setConfirmDelete(null);
    setActionError(null);
  }

  // One request at a time; a double click never sends a second one.
  async function act(url: string, init: RequestInit, after?: (res: Response) => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        setActionError(await errorOf(res));
        return;
      }
      setConfirmDelete(null);
      if (after) await after(res);
      setReload((n) => n + 1);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const patch = (id: string, body: unknown) => act(`/api/admin/exam-practice/${id}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(body) });
  // S18: Duplicate, then open the copy in the editor.
  const duplicate = (id: string) =>
    act(`/api/admin/exam-practice/${id}`, { method: 'POST' }, async (res) => {
      const copy = (await res.json()) as TeilSetRow;
      if (copy.set) setEditing({ id: copy.id, set: copy.set });
    });
  // Other rows' actions leave an open editor (and its unsaved edits) alone.
  const closeEditorFor = (id: string) => async () => setEditing((e) => (e?.id === id ? null : e));

  async function upload() {
    if (!file || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setUploadError(null);
    setUploadMessage(null);
    try {
      const format = /\.ya?ml$/i.test(file.name) ? 'yaml' : 'json';
      const res = await fetch('/api/admin/exam-practice', {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({ formatId, partId, format, text: await readText(file) }),
      });
      if (!res.ok) {
        setUploadError(await errorOf(res));
        return;
      }
      const data = (await res.json()) as { count: number };
      setUploadMessage(`Uploaded ${data.count} ${data.count === 1 ? 'set' : 'sets'}.`);
      setReload((n) => n + 1);
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:max-w-xl sm:grid-cols-2">
        <label className={FIELD_LABEL}>
          Exam format
          <NativeSelect value={formatId} onChange={(e) => choosePart(e.target.value, formats.find((f) => f.id === e.target.value)?.parts[0]?.id ?? '')}>
            {formats.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className={FIELD_LABEL}>
          Part
          <NativeSelect value={partId} onChange={(e) => choosePart(formatId, e.target.value)}>
            {parts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.items} items)
              </option>
            ))}
          </NativeSelect>
        </label>
      </div>

      <Card className="min-w-0 gap-3">
        <CardHeader>
          <h2 className="text-lg leading-tight">Upload and download</h2>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="flex flex-wrap items-center gap-x-3">
            <a href={`/api/admin/exam-practice/export?${query}&format=json`} className={LINK}>
              <Download aria-hidden className="size-4" />
              Download JSON
            </a>
            <a href={`/api/admin/exam-practice/export?${query}&format=yaml`} className={LINK}>
              <Download aria-hidden className="size-4" />
              Download YAML
            </a>
          </p>
          <p className={`${HINT} max-w-prose`}>
            Upload a JSON or YAML file in the download&apos;s format. Uploaded sets are approved, and a set with the same id is
            replaced. A file with any problem is rejected and nothing changes. Rejected and reserved sets are not downloaded.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              aria-label="Teil set file"
              accept=".json,.yaml,.yml"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className={`min-h-11 max-w-full min-w-0 rounded-md border bg-transparent p-2 text-sm file:mr-3 file:rounded-sm file:border-0 file:bg-surface-raised file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-text ${FOCUS}`}
            />
            <Button type="button" className={BTN} onClick={upload} disabled={!file || busy}>
              Upload
            </Button>
          </div>
          {uploadMessage && <p role="status">{uploadMessage}</p>}
          {uploadError && (
            <Alert variant="destructive">
              <AlertDescription>The upload was rejected: {uploadError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {loadFailed && (
        <Alert variant="destructive">
          <AlertDescription>Could not load the sets</AlertDescription>
        </Alert>
      )}
      {actionError && (
        <Alert variant="destructive">
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}
      {!loadFailed && rows === null && <p className="text-text-muted">Loading...</p>}
      {rows && rows.length === 0 && <p className="rounded-lg border bg-card p-4 text-text-muted">No sets for this part yet.</p>}
      {rows && rows.length > 0 && (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col" className={TH}>Set</th>
                <th scope="col" className={TH}>Status</th>
                <th scope="col" className={TH}>Preview</th>
                <th scope="col" className={TH}>Items</th>
                <th scope="col" className={TH}>Created</th>
                <th scope="col" className={TH}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Fragment key={row.id}>
                  <tr>
                    <td className={`${TD} font-mono text-xs break-all`}>{row.id}</td>
                    <td className={TD}>
                      <Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>
                    </td>
                    <td className={`${TD} min-w-48 max-w-80`} lang="de">
                      {row.set ? previewOf(row.set) : <span className={HINT}>Hidden</span>}
                    </td>
                    <td className={TD}>{row.itemCount}</td>
                    <td className={`${TD} whitespace-nowrap`}>{row.createdAt.slice(0, 10)}</td>
                    <td className={`${TD} min-w-72`}>
                      {row.status === 'reserved' ? (
                        <span className={HINT}>Reserved for formal exams</span>
                      ) : (
                        <RowActions
                          row={row}
                          busy={busy}
                          confirming={confirmDelete === row.id}
                          onApprove={() => patch(row.id, { status: 'approved' })}
                          onReject={() => patch(row.id, { status: 'rejected' })}
                          onEdit={() => row.set && setEditing({ id: row.id, set: row.set })}
                          onDuplicate={() => duplicate(row.id)}
                          onDelete={() => setConfirmDelete(row.id)}
                          onConfirmDelete={() => act(`/api/admin/exam-practice/${row.id}`, { method: 'DELETE' }, closeEditorFor(row.id))}
                          onCancelDelete={() => setConfirmDelete(null)}
                        />
                      )}
                      {row.status !== 'reserved' && row.set?.taskType === 'audio_questions' && (
                        <div className="mt-2">
                          <AudioActions transcript={(row.set.content as AudioQuestionsContent).transcript} label={`Set ${row.id}`} />
                        </div>
                      )}
                    </td>
                  </tr>
                  {editing?.id === row.id && (
                    <tr>
                      <td colSpan={6} className={TD}>
                        <TeilSetEditor
                          key={editing.id}
                          setId={row.id}
                          initial={editing.set}
                          saving={busy}
                          onSave={(set) => act(`/api/admin/exam-practice/${row.id}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ set }) }, closeEditorFor(row.id))}
                          onCancel={() => setEditing(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RowActions(props: {
  row: TeilSetRow;
  busy: boolean;
  confirming: boolean;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  const { row, busy } = props;
  if (props.confirming) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span>Delete {row.id}?</span>
        <Button type="button" variant="destructive" className={BTN} disabled={busy} onClick={props.onConfirmDelete}>
          Confirm delete
        </Button>
        <Button type="button" variant="outline" className={BTN} onClick={props.onCancelDelete}>
          Cancel
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" className={BTN} disabled={busy || row.status === 'approved'} onClick={props.onApprove}>
        Approve
      </Button>
      <Button type="button" variant="ghost" className={DANGER} disabled={busy || row.status === 'rejected'} onClick={props.onReject}>
        Reject
      </Button>
      <Button type="button" variant="outline" className={BTN} disabled={busy} onClick={props.onEdit}>
        Edit
      </Button>
      <Button type="button" variant="outline" className={BTN} disabled={busy} onClick={props.onDuplicate}>
        Duplicate
      </Button>
      <Button type="button" variant="ghost" className={DANGER} disabled={busy} onClick={props.onDelete}>
        Delete
      </Button>
    </div>
  );
}
