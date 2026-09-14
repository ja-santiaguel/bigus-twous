import { lazy, Suspense, useEffect, useRef } from 'react';
import { LazyMotion } from 'framer-motion';
import { useGameStore } from './store/gameStore.js';
import { readJoinLink } from './lib/joinLink.js';
import { MainMenu } from './screens/MainMenu.js';
import { CopyToast } from './components/CopyToast.js';

/*
 * Only the menu is in the first download. The lobbies, the table and the
 * animation features are separate files — roughly half the script a visitor
 * would otherwise wait for before seeing anything — fetched as soon as the menu
 * is on screen, so starting a game does not wait on them either.
 */
const loadLobby = () => import('./screens/Lobby.js');
const loadWaitingRoom = () => import('./screens/WaitingRoom.js');
const loadTable = () => import('./screens/Table.js');
const loadMotion = () => import('./design/motionFeatures.js').then((module) => module.default);

const Lobby = lazy(() => loadLobby().then((module) => ({ default: module.Lobby })));
const WaitingRoom = lazy(() => loadWaitingRoom().then((module) => ({ default: module.WaitingRoom })));
const Table = lazy(() => loadTable().then((module) => ({ default: module.Table })));

/** Fetch the rest of the game once the browser has a moment, rather than on the first click. */
function usePreloadScreens() {
  useEffect(() => {
    const preload = () => {
      void loadLobby();
      void loadWaitingRoom();
      void loadTable();
      void loadMotion();
    };
    // Safari has no idle callback; a short delay does the same job there.
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(preload, { timeout: 2_000 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = setTimeout(preload, 500);
    return () => clearTimeout(timer);
  }, []);
}

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
  usePreloadScreens();

  // Only the DOM animation feature set is loaded: this app animates transforms
  // and opacity, and hand-rolls its own drag against the fan geometry. Pulling
  // in Framer's layout and gesture engines as well would roughly double the
  // animation bundle for features nothing uses. `strict` makes that a build
  // error rather than a silent regression if someone reaches for `motion.*`.
  // The features load asynchronously; anything that renders first simply
  // starts at its resting state.
  return (
    <LazyMotion features={loadMotion} strict>
      {/* Nothing to draw for the moment a screen's file is still arriving —
          preloading makes that moment all but invisible. */}
      <Suspense fallback={null}>
        <Screen />
      </Suspense>
      <CopyToast />
    </LazyMotion>
  );
}
