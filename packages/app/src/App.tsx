import { useEffect, useRef } from 'react';
import { LazyMotion, domAnimation } from 'framer-motion';
import { useGameStore } from './store/gameStore.js';
import { readJoinLink } from './lib/joinLink.js';
import { MainMenu } from './screens/MainMenu.js';
import { Lobby } from './screens/Lobby.js';
import { Table } from './screens/Table.js';
import { WaitingRoom } from './screens/WaitingRoom.js';
import { CopyToast } from './components/CopyToast.js';

function Screen() {
  const screen = useGameStore((s) => s.screen);
  const online = useGameStore((s) => s.online);
  const dealt = useGameStore((s) => s.view !== null);
  const ceremony = useGameStore((s) => s.ceremony.kind);

  if (screen === 'menu') return <MainMenu />;
  if (screen === 'lobby') return <Lobby />;
  // A shared table waits for the people it was shared with. Once it has dealt
  // — or started dealing — the table itself takes over.
  if (online && !dealt && ceremony === 'idle') return <WaitingRoom />;
  return <Table />;
}

/**
 * Sits down at a table on load, if there is one to sit at.
 *
 * A host whose page just reloaded goes straight back to the lobby they were
 * running (9.18). Otherwise, the table named in the address bar: a link is the
 * whole of the joining flow, so arriving from one should land you at the table,
 * not at a menu with the table hidden behind it.
 */
function useJoinOnLoad() {
  const joinByCode = useGameStore((s) => s.joinByCode);
  const setPlayerName = useGameStore((s) => s.setPlayerName);
  const reopenHostedTable = useGameStore((s) => s.reopenHostedTable);
  const joined = useRef(false);

  useEffect(() => {
    if (joined.current) return;
    joined.current = true;
    if (reopenHostedTable()) return;
    const link = readJoinLink(window.location.href);
    if (!link) return;
    // A name in the link is a convenience, not a commitment — it can be
    // changed from inside the room like any other.
    if (link.name) setPlayerName(link.name);
    joinByCode(link.table);
  }, [joinByCode, setPlayerName, reopenHostedTable]);
}

export function App() {
  useJoinOnLoad();

  // Only the DOM animation feature set is loaded: this app animates transforms
  // and opacity, and hand-rolls its own drag against the fan geometry. Pulling
  // in Framer's layout and gesture engines as well would roughly double the
  // animation bundle for features nothing uses. `strict` makes that a build
  // error rather than a silent regression if someone reaches for `motion.*`.
  return (
    <LazyMotion features={domAnimation} strict>
      <Screen />
      <CopyToast />
    </LazyMotion>
  );
}
