import { Fragment, type ReactNode } from 'react';
import { InfoTip } from './InfoTip.js';
import { GLOSSARY } from '../lib/glossary.js';

/**
 * Game words, explained where they are read.
 *
 * A line of rules — "a straight of five or more can beat a single 2" — is
 * only as clear as its words. Every word the game uses in a sense of its own
 * is marked with a dotted underline; pointing at it, tabbing to it or tapping
 * it shows what it means in a sentence, the same sentence wherever it
 * appears. The meanings follow How to play, and live in lib/glossary.ts;
 * GLOSSARY.md at the repository's root carries the same sentences.
 */

/** Every way a term is written, and which term it is. Longest first, so "pair chain" wins over "pair". */
const FORMS: [string, string][] = (
  [
    ['chain of three pairs', 'pair chain'],
    ['chains of pairs', 'pair chain'],
    ['chain of pairs', 'pair chain'],
    ['pair chains', 'pair chain'],
    ['pair chain', 'pair chain'],
    ['four of a kind', 'four of a kind'],
    ['table prize', 'table prize'],
    ['short seat', 'short seat'],
    ['medallions', 'medallion'],
    ['medallion', 'medallion'],
    ['elite', 'elite'],
    ['class plays', 'class play'],
    ['class play', 'class play'],
    ['reckonings', 'reckoning'],
    ['reckoning', 'reckoning'],
    ['requiem', 'requiem'],
    ['fallen', 'fallen'],
    ['straights', 'straight'],
    ['straight', 'straight'],
    ['buy-ins', 'buy-in'],
    ['buy-in', 'buy-in'],
    ['triples', 'triple'],
    ['triple', 'triple'],
    ['singles', 'single'],
    ['single', 'single'],
    ['chopped', 'chop'],
    ['bombs', 'bomb'],
    ['bomb', 'bomb'],
    ['pairs', 'pair'],
    ['pair', 'pair'],
    ['antes', 'ante'],
    ['ante', 'ante'],
    ['tribute', 'tribute'],
    ['lead', 'lead'],
    ['pot', 'pot'],
  ] as [string, string][]
).sort((a, b) => b[0].length - a[0].length);

const PATTERN = new RegExp(`\\b(${FORMS.map(([form]) => form.replace(/[-]/g, '\\-')).join('|')})\\b`, 'gi');
const TERM_OF = new Map(FORMS);

/** One term, with its meaning on hand. */
export function Term({ term, children }: { term: string; children: ReactNode }) {
  const meaning = GLOSSARY[term];
  if (!meaning) return <>{children}</>;
  return (
    <InfoTip label={term} word={children}>
      <p>{meaning}</p>
    </InfoTip>
  );
}

/**
 * A line of text with its game terms marked. Each term is marked once — the
 * first time it appears in the line — so a sentence is not a row of links.
 */
export function Terms({ children }: { children: string }) {
  const parts: ReactNode[] = [];
  const seen = new Set<string>();
  let last = 0;
  for (const match of children.matchAll(PATTERN)) {
    const term = TERM_OF.get(match[0].toLowerCase());
    if (!term || seen.has(term) || match.index === undefined) continue;
    seen.add(term);
    parts.push(children.slice(last, match.index));
    parts.push(
      <Term key={match.index} term={term}>
        {match[0]}
      </Term>,
    );
    last = match.index + match[0].length;
  }
  parts.push(children.slice(last));
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>{part}</Fragment>
      ))}
    </>
  );
}
