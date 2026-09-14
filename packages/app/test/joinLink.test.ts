import { describe, expect, it } from 'vitest';
import { joinLinkFor, readJoinLink } from '../src/lib/joinLink.js';

/**
 * A link says *what* to join. Where the server is, is `serverAddress`'s
 * question — and this file used to answer it too, which pointed every shared
 * link at whatever was serving the client instead of at the tables.
 */
describe('joining from a link', () => {
  it('reads a table code', () => {
    expect(readJoinLink('https://bigtwo.example/?table=AVXLEY')).toEqual({ table: 'AVXLEY' });
  });

  it('accepts a code in any case, since one gets typed by hand', () => {
    expect(readJoinLink('http://localhost:5173/?table=abc123')).toEqual({ table: 'ABC123' });
  });

  it('carries a name along when the link offers one', () => {
    expect(readJoinLink('https://x/?table=ABC123&name=Jas')).toEqual({ table: 'ABC123', name: 'Jas' });
  });

  it('is not a join link without a table', () => {
    expect(readJoinLink('https://bigtwo.example/')).toBeNull();
    expect(readJoinLink('not a url at all')).toBeNull();
  });

  it('refuses a code that could not be a code', () => {
    expect(readJoinLink('https://x/?table=../../admin')).toBeNull();
    expect(readJoinLink('https://x/?table=' + 'A'.repeat(20))).toBeNull();
  });

  it('builds the link somebody shares', () => {
    expect(joinLinkFor('avxley', 'https://bigtwo.example/')).toBe('https://bigtwo.example/?table=AVXLEY');
  });
});
