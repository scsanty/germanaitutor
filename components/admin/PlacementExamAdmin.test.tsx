import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { delayedResponse } from '@/test/delayedResponse';
import { PlacementExamAdmin } from './PlacementExamAdmin';

function chooseFile(name: string, content: string) {
  const file = new File([content], name, { type: 'text/plain' });
  fireEvent.change(screen.getByLabelText('Exam file'), { target: { files: [file] } });
}

describe('PlacementExamAdmin', () => {
  it('offers JSON and YAML downloads', () => {
    render(<PlacementExamAdmin questionCount={40} />);
    expect(screen.getByText('The active exam has 40 questions.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'JSON' })).toHaveAttribute('href', '/api/admin/placement-exam?format=json');
    expect(screen.getByRole('link', { name: 'YAML' })).toHaveAttribute('href', '/api/admin/placement-exam?format=yaml');
  });

  it('uploads a YAML file and reports the new question count', async () => {
    const fetchMock = vi.fn(() => delayedResponse({ ok: true, questionCount: 12 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<PlacementExamAdmin questionCount={40} />);
    chooseFile('exam.yaml', 'questions: []');
    fireEvent.click(screen.getByText('Upload'));

    expect(await screen.findByText('Exam replaced: 12 questions.')).toBeInTheDocument();
    expect(screen.getByText('The active exam has 12 questions.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/placement-exam?format=yaml', {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: 'questions: []',
    });
  });

  it('lists every error when the upload is rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => delayedResponse({ errors: ['Question 1: bad', 'Question 2: worse'] }, { ok: false, status: 400 }))
    );
    render(<PlacementExamAdmin questionCount={40} />);
    chooseFile('exam.json', '{}');
    fireEvent.click(screen.getByText('Upload'));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Question 1: bad'));
    expect(screen.getByRole('alert')).toHaveTextContent('Question 2: worse');
    expect(screen.getByText('The active exam has 40 questions.')).toBeInTheDocument();
  });

  it('keeps Upload disabled until a file is chosen', () => {
    render(<PlacementExamAdmin questionCount={40} />);
    expect(screen.getByText('Upload')).toBeDisabled();
  });
});
