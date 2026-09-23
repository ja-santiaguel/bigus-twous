import { describe, expect, it } from 'vitest';
import { useGameStore } from '../src/store/gameStore.js';
import { buildTableView } from '../src/lib/tableView.js';
import { useCampaignStore } from '../src/store/campaignStore.js';
import { canCallReckoning, choices, CLASS_IDS, eventOver } from '@big-two/campaign';
import { createRng } from '@big-two/engine';

/**
 * Campaign runs driven through the real stores — the local table, its session
 * and the campaign's gold — with your seat making random legal plays and
 * passes, taking random paths down the map and calling Showdowns at random, to
 * show a table never stalls: every hand that ends is settled, and the next one
 * can always be dealt or the table left.
 */

const game = useGameStore;
/** Whether the round on the table has ended, as the table screen reads it. */
const roundOver = () => {
  const view = game.getState().view;
  return view ? buildTableView(view).isRoundOver : false;
};
const campaign = useCampaignStore;

async function until(test: () => boolean, what: string, ms = 8_000) {
  const start = Date.now();
  while (!test()) {
    const s = game.getState();
    if (s.ceremony.kind === 'picking' && s.ceremony.interactive) s.choosePile(s.ceremony.remaining[0]!);
    if (Date.now() - start > ms) {
      const run = useCampaignStore.getState().run;
      const view = game.getState().view;
      console.log(
        'STALL',
        what,
        JSON.stringify({
          phase: run?.phase,
          hand: run?.table?.hand,
          handsPlayed: run?.table?.handsPlayed,
          last: run?.lastHand?.placing,
          fo: view?.finishOrder,
          tail: view?.history.slice(-8),
          seats: run?.table?.seats.map((x) => [x.id, x.worth]),
        }),
      );
      throw new Error(`Stalled: ${what}`);
    }
    await new Promise((r) => setTimeout(r, 2));
  }
}

/** Plays your seat until the round is over: any legal move, or a pass, at random. */
async function playRound(pick: () => number) {
  for (;;) {
    const s = game.getState();
    if (roundOver()) return;
    if (s.ceremony.kind === 'picking' && s.ceremony.interactive) s.choosePile(s.ceremony.remaining[0]!);
    else if (s.awaitingHuman && s.canPass && (s.legalMoves.length === 0 || pick() < 0.3)) s.pass();
    else if (s.awaitingHuman && s.legalMoves.length > 0)
      s.playCards(s.legalMoves[Math.floor(pick() * s.legalMoves.length)]!.cards);
    else if (s.error) throw new Error(`Table error: ${s.error}`);
    await new Promise((r) => setTimeout(r, 1));
  }
}

describe('a campaign table played through the stores', () => {
  for (const classId of CLASS_IDS) {
    it(`never stalls between hands (${classId})`, { timeout: 60_000 }, async () => {
      game.getState().setPaced(false);
      const pick = createRng(`flow-${classId}`);
      let hands = 0;
      for (let runs = 0; runs < 12 && hands < 60; runs++) {
        campaign.getState().begin(classId);
        for (let step = 0; step < 400; step++) {
          const run = campaign.getState().run;
          if (!run || run.phase === 'won' || run.phase === 'lost') break;
          if (run.phase === 'map') {
            const open = choices(run);
            campaign.getState().choose(open[Math.floor(pick() * open.length)]!.id);
            continue;
          }
          if (run.phase === 'shop') {
            campaign.getState().leaveShop();
            continue;
          }
          if (run.phase === 'reward') {
            campaign.getState().claim(0);
            continue;
          }
          if (run.phase === 'event') {
            const event = run.event!;
            if (eventOver(event)) campaign.getState().leaveEvent();
            else if (event.id === 'ferryman')
              campaign
                .getState()
                .act(event.turned.length === 0 ? { kind: 'stake' } : { kind: 'call', higher: pick() < 0.5 });
            else if (event.id === 'reliquary')
              campaign.getState().act({ kind: 'open', coffer: Math.floor(pick() * 3) });
            else campaign.getState().act(pick() < 0.5 ? { kind: 'haggle' } : { kind: 'pay' });
            continue;
          }
          // At a table.
          if (game.getState().screen !== 'table') {
            campaign.getState().rejoin();
            continue;
          }
          await playRound(pick);
          hands += 1;
          await until(() => !campaign.getState().run?.table?.hand, 'hand settled');
          const after = campaign.getState().run!;
          expect(after.lastHand).not.toBeNull();
          if (after.lastHand!.end || after.phase !== 'table') {
            campaign.getState().leaveTable();
            continue;
          }
          campaign.getState().deal(canCallReckoning(after.table!) && pick() < 0.5);
          await until(() => !roundOver(), 'next hand dealt');
        }
        campaign.getState().abandon();
        game.getState().leaveTable();
      }
      expect(hands).toBeGreaterThanOrEqual(60);
    });
  }
});
