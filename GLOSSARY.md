# Glossary

The game's words: what each means, and which word to use. Kept up to date as
the game changes — when a word is added, renamed or retired in the game, it
changes here in the same change.

Two parts. **Explained in the game** are the words shown with a dotted
underline, whose note is the sentence given here, word for word (they live in
`packages/app/src/lib/glossary.ts`, and a test checks this file against it).
**Words we use** is the house vocabulary: the one word for each thing, on every
screen, and the words not to use instead.

## Explained in the game

### Cards and plays

- **Single** — One card.
- **Pair** — Two cards of the same rank.
- **Triple** — Three cards of the same rank.
- **Straight** — Three or more ranks in a row, like 7 8 9. No 2s, and no wrapping past A.
- **Pair chain** — Three or more pairs in a row, like 5 5 6 6 7 7. A bomb.
- **Four of a kind** — All four cards of a rank. A bomb.
- **Bomb** — Four of a kind, or a pair chain. Bombs only beat 2s.
- **Chop** — To beat a 2 with a bomb.
- **Lead** — The first play onto an empty table, when anything may be played.

### Gold

- **Ante** — What every seat pays into the pot to be dealt a hand.
- **Pot** — The gold put in this hand. It pays as the table prize does: 70% to first, 25% to second, 5% to third.
- **Buy-in** — What a seat at a table costs. The four buy-ins make the table prize.
- **Table prize** — The four buy-ins, paid out when the table ends: 70% to the best placed, 25% to second, 5% to third.
- **Short seat** — A seat bought with less than the buy-in: all your gold but three antes. It can win back only its share of what it paid.

### The campaign

- **Tribute** — The gold you must win at a table. Come to its last hand holding it and the table is yours; hold it sooner and you may call a Reckoning.
- **Reckoning** — Called by you once you hold the tribute, once a table: the others ante three times, you once, and you play for the whole pot. Finish first and the table is yours, with a bounty for the hands left.
- **Requiem** — The last hand of a table: everyone antes three times, and whoever finishes first wins it.
- **Fallen** — Out of gold, and out. A player who falls leaves their chair empty for the rest of the table; if you fall, the run ends.
- **Event** — A ? on the map: a wager, a find or a toll, unknown until you go down to it.
- **Class play** — A play only your class’s rules allow. It costs gold, paid into the pot.
- **Medallion** — A piece of your build: it bends one of your rules, or your gold. Most go up in level.
- **Elite** — A harder table — richer players, more of them carrying Medallions — that pays a rarer Medallion.

## Words we use

One word for each thing. Sentence case on screen; the words below are written
as they appear mid-sentence.

| Use                                         | For                                                                                                  | Not                                        |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| gold                                        | what you have, and what everything costs                                                             | Worth, money, chips, coins                 |
| your gold                                   | your total, off the table or at it                                                                   | balance, purse, bankroll                   |
| in the pot                                  | gold you have put into the hand being played ("30 in the pot")                                       | in, staked, at risk, bet                   |
| ante                                        | the price of being dealt a hand                                                                      | blind, fee                                 |
| ante share                                  | a class's part of every table's ante: ×0.75 Wanderer, ×1 Courtier, ×1.5 Tyrant                       | ante multiplier, first ante                |
| pot                                         | one hand's gold                                                                                      | bank                                       |
| buy-in                                      | the price of a seat at a table                                                                       | stake, Table Stake, entry fee              |
| short seat                                  | a seat bought with less than the buy-in                                                              | credit, loan, partial buy-in               |
| table prize                                 | the four buy-ins, paid out when the table ends; labelled **Table** in the table's read-out           | stake pot, prize pool, stakes              |
| win the table, lose the table               | a table's two ends; either way you go on down                                                        | clear, fail, close                         |
| tribute                                     | the gold you must win at a table: hold it to the Requiem, or call a Reckoning                        | target, Mark, threshold, goal              |
| Reckoning                                   | the showdown you call early, once a table (always capitalised)                                       | Showdown, early showdown, duel             |
| Requiem                                     | a table's last hand, three antes each (always capitalised)                                           | Showdown, Knell, final                     |
| the last hand                               | a table's final hand, always the Requiem                                                             | last call, final hand                      |
| hand                                        | one deal, played out                                                                                 | round, game                                |
| trick                                       | the plays from one lead to the table clearing                                                        | round                                      |
| table                                       | four seats and the hands played at them                                                              | match, game, encounter                     |
| the Hollow Deep                             | the world a run descends through; its depths are numbered, and room names are kept for acts          | the dungeon, the tower                     |
| depth                                       | how far down the map you are, a node at a time ("Depth 3 of 9")                                      | room, tier, floor, level                   |
| run, a new run, continue run                | one descent, from choosing a class to the throne or to falling                                       | campaign (for one run), game, save         |
| the map                                     | the run's route, read from the top down                                                              | ladder, tree, climb                        |
| descend, go down                            | to move to the next room                                                                             | climb, move up, advance                    |
| the Bone Merchant                           | the node that sells Medallions                                                                       | shop, store                                |
| the spoils                                  | what a won table offers you                                                                          | reward, loot screen                        |
| class                                       | Wanderer, Courtier, Tyrant (Seer to come)                                                            | role, job, hero                            |
| Fortitude, Avarice, Guile                   | a class's profile: how hard it is to break, how fast its gold grows, how much reading the table pays | staying power, growth, finesse             |
| class play                                  | a play only your class's rules allow; its name is the class's rule (Uprising, Allegiance, Decree)    | passive, ability, special                  |
| Medallion                                   | a build piece (always capitalised)                                                                   | relic, item, charm                         |
| level                                       | a Medallion's strength, shown as a numeral: Uprising II                                              | rank, tier, upgrade                        |
| elite                                       | a harder table (Gilded, Carrion)                                                                     | boss, hard mode                            |
| Vestige                                     | one of your past winning runs, seated on the Hollow Throne                                           | ghost, phantom (in the interface)          |
| run name                                    | two words drawn for each run: your name at its tables, and its Vestige's                             | "(you)" at pile select                     |
| ? event                                     | a ? node: the Ferryman's Wager, the Drowned Reliquary or the Tithe-Taker                             | random event, mystery                      |
| bounty                                      | what a won Reckoning pays: an ante for each hand left unplayed                                       | bonus, swift reward                        |
| welcome                                     | the screen that names you before a run's map                                                         | intro, splash                              |
| fallen                                      | out of gold, and out: a chair left empty; if you fall, the run ends                                  | broke, dead, bust, bankrupt                |
| sit down                                    | to pay a buy-in and take a seat                                                                      | join, enter                                |
| Paupers', Starving, Mirror, Carrion, Gilded | the kinds of table                                                                                   | Modest, Desperate, Predator's, High-stakes |

The base game (on your own, with friends) plays a match of **rounds**, and
says "round" for what the campaign calls a hand: a match counts them, a
campaign table counts hands. Neither screen uses the other's word.

Code keeps some older names where renaming them would only churn the code
(`worth`, `tier`, `markAntes`, the archetype ids `modest`, `desperation`,
`predator`, `high-stakes`); what a player reads never uses them.
