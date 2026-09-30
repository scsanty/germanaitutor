import { describe, it, expect } from 'vitest';
import { lessonTextProblems, milestoneTextProblems } from './bilingualValidation';

const ok = { title: 'Hello', titleDe: 'Hallo', explanation: null, explanationDe: null, examples: null, examplesDe: null };

describe('lessonTextProblems', () => {
  it('accepts a complete lesson', () => {
    expect(lessonTextProblems({ ...ok, explanation: 'E', explanationDe: 'D', examples: ['a'], examplesDe: ['b'] })).toEqual([]);
  });

  it('requires a German title, both explanations or neither, and both versions of every example', () => {
    expect(lessonTextProblems({ ...ok, titleDe: ' ' })).toEqual(['German title is required']);
    expect(lessonTextProblems({ ...ok, explanation: 'E' })).toEqual(['The explanation needs both English and German']);
    expect(lessonTextProblems({ ...ok, examples: ['a', 'b'], examplesDe: ['x'] })).toEqual([
      'Every example needs both English and German',
    ]);
    expect(lessonTextProblems({ ...ok, examples: ['a'], examplesDe: [''] })).toEqual(['Every example needs both English and German']);
  });
});

describe('milestoneTextProblems', () => {
  it('requires a German title and both descriptions or neither', () => {
    expect(milestoneTextProblems({ title: 'A', titleDe: 'B', description: null, descriptionDe: null })).toEqual([]);
    expect(milestoneTextProblems({ title: 'A', titleDe: '', description: 'd', descriptionDe: null })).toEqual([
      'German title is required',
      'The description needs both English and German',
    ]);
  });
});
