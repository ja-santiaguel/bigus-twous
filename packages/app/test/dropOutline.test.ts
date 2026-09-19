import { describe, expect, it } from 'vitest';
import { clearOf } from '../src/lib/dropOutline.js';

/** The drop area's outline, pulled in clear of the seats and controls around it. */
describe('drop outline', () => {
  const band = { left: 375, top: 242, right: 901, bottom: 419 };

  it('leaves an area with nothing in it alone', () => {
    const sideSeat = { left: 222, top: 242, right: 367, bottom: 419 };
    expect(clearOf(band, [sideSeat])).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('takes a seat hanging into the top off the top, not off a side', () => {
    const topSeat = { left: 375, top: 137, right: 901, bottom: 274 };
    expect(clearOf(band, [topSeat])).toEqual({ top: 32, right: 0, bottom: 0, left: 0 });
  });

  it('takes something reaching in from a side off that side', () => {
    const label = { left: 340, top: 300, right: 400, bottom: 320 };
    expect(clearOf(band, [label])).toEqual({ top: 0, right: 0, bottom: 0, left: 25 });
  });

  it('clears several neighbours at once', () => {
    const topSeat = { left: 375, top: 137, right: 901, bottom: 274 };
    const readout = { left: 400, top: 400, right: 700, bottom: 440 };
    expect(clearOf(band, [topSeat, readout])).toEqual({ top: 32, right: 0, bottom: 19, left: 0 });
  });
});
