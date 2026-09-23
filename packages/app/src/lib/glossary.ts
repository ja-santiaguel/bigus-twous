/**
 * What the game's own words mean, one sentence each: the notes shown on a
 * dotted-underlined word (components/Terms). GLOSSARY.md at the repository's
 * root lists every one of these sentences word for word — a test holds the two
 * together — alongside the rest of the game's vocabulary.
 */
export const GLOSSARY: Record<string, string> = {
  single: 'One card.',
  pair: 'Two cards of the same rank.',
  triple: 'Three cards of the same rank.',
  straight: 'Three or more ranks in a row, like 7 8 9. No 2s, and no wrapping past A.',
  'pair chain': 'Three or more pairs in a row, like 5 5 6 6 7 7. A bomb.',
  'four of a kind': 'All four cards of a rank. A bomb.',
  bomb: 'Four of a kind, or a pair chain. Bombs only beat 2s.',
  chop: 'To beat a 2 with a bomb.',
  lead: 'The first play onto an empty table, when anything may be played.',
  ante: 'What every seat pays into the pot to be dealt a hand.',
  pot: 'The gold put in this hand. It pays as the table prize does: 70% to first, 25% to second, 5% to third.',
  'buy-in': 'What a seat at a table costs. The four buy-ins make the table prize.',
  'table prize': 'The four buy-ins, paid out when the table ends: 70% to the best placed, 25% to second, 5% to third.',
  'short seat':
    'A seat bought with less than the buy-in: all your gold but three antes. It can win back only its share of what it paid.',
  tribute:
    'The gold you must win at a table. Come to its last hand holding it and the table is yours; hold it sooner and you may call a Reckoning.',
  reckoning:
    'Called by you once you hold the tribute, once a table: the others ante three times, you once, and you play for the whole pot. Finish first and the table is yours, with a bounty for the hands left.',
  requiem: 'The last hand of a table: everyone antes three times, and whoever finishes first wins it.',
  fallen:
    'Out of gold, and out. A player who falls leaves their chair empty for the rest of the table; if you fall, the run ends.',
  event: 'A ? on the map: a wager, a find or a toll, unknown until you go down to it.',
  'class play': 'A play only your class’s rules allow. It costs gold, paid into the pot.',
  medallion: 'A piece of your build: it bends one of your rules, or your gold. Most go up in level.',
  elite: 'A harder table — richer players, more of them carrying Medallions — that pays a rarer Medallion.',
};
