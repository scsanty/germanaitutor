import { describe, it, expect } from 'vitest';
import { extractJsonObject } from '../ai/json';
import { FREESTYLE_MODES } from './modes';
import { SCENARIOS, scenariosFor } from './scenarios';
import {
  buildArticlePrompt,
  buildConversationPrompt,
  buildDrillPrompt,
  buildNormalizePrompt,
  buildSummaryPrompt,
  buildWritingPrompt,
} from './prompts';
import {
  parseArticleReply,
  parseConversationReply,
  parseDrillReply,
  parseNormalizeReply,
  parseSummaryReply,
  parseWritingReply,
} from './replies';

const correction = { wrong: 'Ich habe gegangen', right: 'Ich bin gegangen', reason_en: 'gehen uses sein', reason_de: 'gehen mit sein' };

describe('extractJsonObject', () => {
  it('finds the object inside surrounding text and rejects non-objects', () => {
    expect(extractJsonObject('Sure! {"a": 1} Done.')).toEqual({ a: 1 });
    expect(extractJsonObject('[1,2]')).toBeNull();
    expect(extractJsonObject('no json')).toBeNull();
  });
});

describe('registries', () => {
  it('enables the four built modes only', () => {
    expect(FREESTYLE_MODES.filter((m) => m.enabled).map((m) => m.mode)).toEqual(['conversation', 'grammar_drill', 'free_reading', 'free_writing']);
  });

  it('has 6–10 scenarios per level with unique level-prefixed ids, both title languages and a German opener', () => {
    for (const level of ['A1', 'A2', 'B1', 'B2', 'C1'] as const) {
      const n = scenariosFor(level).length;
      expect(n).toBeGreaterThanOrEqual(6);
      expect(n).toBeLessThanOrEqual(10);
    }
    for (const s of SCENARIOS) {
      expect(s.id).toMatch(/^(a1|a2|b1|b2|c1)-[a-z0-9-]+$/);
      expect(s.id.startsWith(`${s.level.toLowerCase()}-`)).toBe(true);
      expect(s.title.en.trim()).not.toBe('');
      expect(s.title.de.trim()).not.toBe('');
      expect(s.opener.trim()).not.toBe('');
    }
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
  });
});

describe('prompts', () => {
  it('pins the level, the German-only rule, and the reply shape', () => {
    const conversation = buildConversationPrompt({ level: 'B1', scenario: 'Arzttermin', history: [], message: 'Hallo' });
    expect(conversation.systemPrompt).toContain('CEFR level B1');
    expect(conversation.systemPrompt).toContain('"corrections"');
    expect(conversation.systemPrompt).toContain('Arzttermin');
    expect(buildDrillPrompt({ level: 'A2', topic: 'Perfekt', history: [], answer: null }).systemPrompt).toContain('Perfekt');
    expect(buildArticlePrompt({ level: 'A1', topic: 'Sport' }).systemPrompt).toContain('about 120 words');
    expect(buildWritingPrompt({ level: 'B1', prompt: 'Urlaub', text: 'Ich war…' }).systemPrompt).toContain('"corrected"');
    expect(buildSummaryPrompt({ mode: 'conversation', level: 'B1', transcript: 'user: Hallo' }).systemPrompt).toContain('"wentWell"');
    expect(buildNormalizePrompt('hund', 'Der hund bellt.').messages[0].content).toContain('hund');
  });
});

describe('reply parsers', () => {
  it('parse well-formed replies', () => {
    expect(parseNormalizeReply('{"lemma":"der Hund","partOfSpeech":"noun","plural":"die Hunde","meaningEn":"dog","meaningDe":"ein Haustier"}')).toEqual({
      lemma: 'der Hund',
      partOfSpeech: 'noun',
      plural: 'die Hunde',
      meaningEn: 'dog',
      meaningDe: 'ein Haustier',
    });
    expect(parseConversationReply(JSON.stringify({ corrections: [correction], reply: 'Wann?' }))).toEqual({
      corrections: [{ wrong: 'Ich habe gegangen', right: 'Ich bin gegangen', reason: { en: 'gehen uses sein', de: 'gehen mit sein' } }],
      reply: 'Wann?',
    });
    expect(parseDrillReply('{"verdict":null,"explanation_en":null,"explanation_de":null,"next":"Frage 1?"}')).toEqual({
      verdict: null,
      explanation: null,
      next: 'Frage 1?',
    });
    expect(
      parseArticleReply(
        JSON.stringify({
          title: 'Sport',
          text: 'Text.',
          questions: [1, 2, 3].map((n) => ({ question: `F${n}?`, options: ['a', 'b', 'c'], correctIndex: 1 })),
        })
      )?.questions
    ).toHaveLength(3);
    expect(parseWritingReply(JSON.stringify({ corrections: [], corrected: 'X.', comment_en: 'Good.', comment_de: 'Gut.' }))).toEqual({
      corrections: [],
      corrected: 'X.',
      comment: { en: 'Good.', de: 'Gut.' },
    });
    expect(
      parseSummaryReply(
        JSON.stringify({ wentWell: [{ en: 'a', de: 'b' }], mistakes: [], words: [{ lemma: 'der Termin', meaningEn: 'appointment' }] })
      )
    ).toEqual({ wentWell: [{ en: 'a', de: 'b' }], mistakes: [], words: [{ lemma: 'der Termin', meaningEn: 'appointment' }] });
  });

  it('reject malformed replies', () => {
    expect(parseNormalizeReply('{"lemma":"der Hund"}')).toBeNull();
    // M6: a noun lemma needs its article, as in the word lists.
    expect(parseNormalizeReply('{"lemma":"Hund","partOfSpeech":"noun","plural":"die Hunde","meaningEn":"dog","meaningDe":"ein Haustier"}')).toBeNull();
    expect(parseNormalizeReply('{"lemma":"laufen","partOfSpeech":"verb","plural":null,"meaningEn":"to run","meaningDe":"rennen"}')).toMatchObject({ lemma: 'laufen' });
    expect(parseConversationReply('{"reply":"x","corrections":[{"wrong":"a"}]}')).toBeNull();
    expect(parseDrillReply('{"verdict":"maybe","next":"x"}')).toBeNull();
    expect(parseArticleReply('{"title":"t","text":"x","questions":[{"question":"q","options":["a"],"correctIndex":3}]}')).toBeNull();
    expect(parseArticleReply(JSON.stringify({ title: 't', text: 'x', questions: [{ question: 'q', options: ['a', 'b'], correctIndex: 0 }] }))).toBeNull();
    expect(parseWritingReply('{"corrected":"x"}')).toBeNull();
    expect(parseSummaryReply('{"wentWell":"good"}')).toBeNull();
  });
});
