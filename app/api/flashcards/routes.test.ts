import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, closeDb } from '@/lib/db/client';
import { createProfileService } from '@/lib/services/profileService';
import { GET as getDeck } from './route';
import { GET as getCount } from './count/route';
import { POST as answer } from './answer/route';
import { GET as listWords, POST as addWord } from './words/route';

const post = (fn: (r: Request) => Promise<Response>, body: unknown) =>
  fn(new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }));

// These read the real word lists, so they only assert shapes and "> 0".
describe('/api/flashcards', () => {
  beforeEach(() => {
    process.env.GAIT_DATA_DIR = mkdtempSync(join(tmpdir(), 'gait-deck-'));
    createProfileService(getDb()).updateProfile({ onboardingComplete: true });
  });

  afterEach(() => {
    closeDb();
    delete process.env.GAIT_DATA_DIR;
  });

  it('serves the deck and its count, and validates answers', async () => {
    const deck = await (await getDeck()).json();
    expect(deck.cards.length).toBeGreaterThan(0);
    expect(await (await getCount()).json()).toEqual({ due: deck.cards.length });
    expect((await post(answer, { itemId: 'x', rating: 'knew' })).status).toBe(400);
    expect((await post(answer, { itemId: 1, rating: 'great' })).status).toBe(400);
    const missing = await post(answer, { itemId: 9999, rating: 'knew' });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: 'not_found' });
    const ok = await post(answer, { itemId: deck.cards[0].itemId, rating: 'knew' });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ nextDueAt: expect.any(String) });
  });

  it('refuses a card that is not due with 400 not_due', async () => {
    const db = getDb();
    createProfileService(db).updateProfile({ newWordsPerDay: 1 });
    await getDeck();
    const row = db.prepare("SELECT id FROM vocabulary_items WHERE status = 'not_started' LIMIT 1").get() as { id: number } | undefined;
    expect(row).toBeDefined();
    const res = await post(answer, { itemId: row!.id, rating: 'knew' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'not_due' });
  });

  it('lists the learning words that match a query', async () => {
    const deck = await (await getDeck()).json();
    const lemma: string = deck.cards[0].lemma;
    const res = await listWords(new Request(`http://localhost/api/flashcards/words?query=${encodeURIComponent(lemma)}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expect.arrayContaining([expect.objectContaining({ itemId: deck.cards[0].itemId, lemma })]));
    const none = await listWords(new Request('http://localhost/api/flashcards/words?query=zzzzqq'));
    expect(await none.json()).toEqual([]);
  });

  it('needs an AI provider to add a word', async () => {
    const res = await post(addWord, { word: 'Katze' });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: 'no_provider' });
  });

  it('validates the word, sentence and source', async () => {
    expect((await post(addWord, { word: '  ' })).status).toBe(400);
    expect((await post(addWord, { word: 'Katze', sentence: 5 })).status).toBe(400);
    expect((await post(addWord, { word: 'Katze', source: 'starter' })).status).toBe(400);
    expect((await post(addWord, { word: 'Katze', source: 'manual' })).status).toBe(502);
  });

  it('limits the word to 100 characters and the sentence to 1000', async () => {
    const word = await post(addWord, { word: 'a'.repeat(101) });
    expect(word.status).toBe(400);
    expect(await word.json()).toMatchObject({ code: 'bad_request' });
    const sentence = await post(addWord, { word: 'Katze', sentence: 'a'.repeat(1001) });
    expect(sentence.status).toBe(400);
    expect(await sentence.json()).toMatchObject({ code: 'bad_request' });
    // At the limits validation passes and the request reaches the (missing) AI provider.
    expect((await post(addWord, { word: 'a'.repeat(100), sentence: 'a'.repeat(1000) })).status).toBe(502);
  });

  it('limits the word search query to 100 characters', async () => {
    const res = await listWords(new Request(`http://localhost/api/flashcards/words?query=${'a'.repeat(101)}`));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'bad_request' });
    expect((await listWords(new Request(`http://localhost/api/flashcards/words?query=${'a'.repeat(100)}`))).status).toBe(200);
  });
});
