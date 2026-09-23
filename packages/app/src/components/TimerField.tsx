import { HostOnly } from './HostOnly.js';
import { InfoTip } from './InfoTip.js';

/**
 * Whether a shared table puts people on a clock. The host's call, before the
 * first deal, in the same outlined set as the match length: On or Off, the
 * choice marked, read-only with a "Host only" tag for everyone else.
 */
export function TimerField({
  on,
  onChange,
  editable,
  hostOnly = false,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  editable: boolean;
  hostOnly?: boolean;
}) {
  return (
    <div className="field">
      <div className="field__head">
        <span className="field__labelgroup">
          <span className="field__label" id="timer-label">
            Turn timer
          </span>
          <InfoTip label="How the turn timer works">
            <p>
              On, each person has a set time to play or pass, and the table plays for anyone who runs out. Off, nobody
              is hurried — for friends in one room.
            </p>
          </InfoTip>
        </span>
        {hostOnly && <HostOnly />}
      </div>
      <div
        className={`optionset ${editable ? '' : 'is-locked'}`}
        role="group"
        aria-labelledby="timer-label"
        title={hostOnly ? 'Only the host can change the timer' : undefined}
      >
        <div className="optionset__row">
          <div className="optionset__choices">
            {[true, false].map((value) => (
              <button
                key={String(value)}
                type="button"
                className="chip"
                aria-pressed={on === value}
                disabled={!editable}
                onClick={() => onChange(value)}
              >
                {value ? 'On' : 'Off'}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="field__hint">
        {on ? 'Each person has a time limit on their turn.' : 'No time limit: the table waits for everyone.'}
      </p>
    </div>
  );
}
