import { useMemo } from 'react';
import { useGameStore } from '../store/gameStore.js';

/**
 * Who is in each seat, by seat index.
 *
 * Built from what the table published rather than from anything local, so it
 * is the same answer for everybody looking at the same game. A seat with no
 * name in it simply is not in the map, and the formatters fall back to its
 * number — which is what every seat is called until somebody says otherwise.
 */
export function useSeatNames(): ReadonlyMap<number, string> {
  const seats = useGameStore((s) => s.seatsAtTable);
  return useMemo(() => {
    const names = new Map<number, string>();
    for (const seat of seats) {
      const name = seat.name?.trim();
      // A default "Seat 3" from the table is not a name; leaving it out lets
      // the formatter own how an unnamed seat reads, in one place.
      if (name && !/^Seat \d+$/.test(name)) names.set(seat.seat, name);
    }
    return names;
  }, [seats]);
}
