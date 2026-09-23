import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GLOSSARY } from '../src/lib/glossary.js';

/**
 * GLOSSARY.md lists every word the game explains on hover, with the same
 * sentence the game shows — so the document cannot fall behind the game.
 */
const doc = readFileSync(fileURLToPath(new URL('../../../GLOSSARY.md', import.meta.url)), 'utf8');

describe('the glossary', () => {
  it.each(Object.entries(GLOSSARY))('lists "%s" with the sentence the game shows', (term, meaning) => {
    const entry = doc.split('\n').find((line) => line.toLowerCase().startsWith(`- **${term.toLowerCase()}**`));
    expect(entry, `GLOSSARY.md has no entry for "${term}"`).toBeDefined();
    expect(entry).toContain(meaning);
  });
});
