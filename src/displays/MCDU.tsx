import { renderMcdu, mcduPowered, scratchLine, type Seg } from '../sim/fms';
import { sim } from '../sim/sim';
import { useSimFrame } from '../ui/hooks';

export const mcduState = { hover: false };

const FKEYS = [
  ['DIR', 'PROG', 'PERF', 'INIT', 'DATA', ''],
  ['F-PLN', 'RAD NAV', 'FUEL PRED', 'SEC F-PLN', 'ATC COMM', 'MCDU MENU'],
];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function Segs({ segs }: { segs?: Seg[] }) {
  if (!segs) return null;
  return (
    <>
      {segs.map((g, i) => (
        <span key={i} className={`mc-${g.c} ${g.sm ? 'mc-sm' : ''}`}>
          {g.t}
        </span>
      ))}
    </>
  );
}

function Key({ k, label, cls = '' }: { k: string; label?: string; cls?: string }) {
  return (
    <div
      className={`mkey ${cls}`}
      onMouseDown={(e) => {
        e.preventDefault();
        sim.mcduKey(k);
      }}
    >
      {label ?? k}
    </div>
  );
}

export function MCDU() {
  const s = useSimFrame(12);
  const on = mcduPowered(s);
  const page = on ? renderMcdu(s) : null;
  const sp = scratchLine(s);
  return (
    <div className="mcdu" data-ctl="MCDU" onMouseEnter={() => (mcduState.hover = true)} onMouseLeave={() => (mcduState.hover = false)}>
      <div className="mcdu-top">
        <div className="lsk-col">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="lsk" onMouseDown={(e) => (e.preventDefault(), sim.mcduLsk('L', i))} />
          ))}
        </div>
        <div className="mcdu-screen">
          {page && (
            <>
              <div className="mc-row title">
                <span className="mc-c">
                  <Segs segs={page.title} />
                </span>
                {page.arrowsLR && <span className="mc-arrow">←→</span>}
              </div>
              {page.rows.map(([lbl, dat], i) => (
                <div key={i}>
                  <div className="mc-row small">
                    <span className="mc-l">
                      <Segs segs={lbl.l} />
                    </span>
                    <span className="mc-c">
                      <Segs segs={lbl.c} />
                    </span>
                    <span className="mc-r">
                      <Segs segs={lbl.r} />
                    </span>
                  </div>
                  <div className="mc-row">
                    <span className="mc-l">
                      <Segs segs={dat.l} />
                    </span>
                    <span className="mc-c">
                      <Segs segs={dat.c} />
                    </span>
                    <span className="mc-r">
                      <Segs segs={dat.r} />
                    </span>
                  </div>
                </div>
              ))}
              <div className="mc-row scratch">
                <span className={`mc-l mc-${sp.c === 'a' ? 'a' : 'w'}`}>{sp.t}</span>
                {page.arrowsUD && <span className="mc-arrow">↓↑</span>}
              </div>
            </>
          )}
        </div>
        <div className="lsk-col">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="lsk" onMouseDown={(e) => (e.preventDefault(), sim.mcduLsk('R', i))} />
          ))}
        </div>
      </div>
      <div className="mcdu-keys">
        <div className="fkeys">
          {FKEYS.map((row, r) => (
            <div key={r} className="fk-row">
              {row.map((k, i) => (k ? <Key key={k} k={k} cls="fk" /> : <div key={i} className="mkey blank" />))}
            </div>
          ))}
          <div className="fk-row">
            <Key k="AIRPORT" cls="fk" />
            <div className="mkey blank" />
            <Key k="LEFT" label="←" cls="fk" />
            <Key k="UP" label="↑" cls="fk" />
            <div className="mkey blank" />
            <div className="mkey blank" />
          </div>
          <div className="fk-row">
            <div className="mkey blank" />
            <div className="mkey blank" />
            <Key k="RIGHT" label="→" cls="fk" />
            <Key k="DOWN" label="↓" cls="fk" />
            <div className="mkey blank" />
            <div className="mkey blank" />
          </div>
        </div>
        <div className="mk-lower">
          <div className="digits-pad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '+/-'].map((k) => (
              <Key key={k} k={k} cls="dk" />
            ))}
          </div>
          <div className="letters-pad">
            {LETTERS.map((k) => (
              <Key key={k} k={k} cls="lk" />
            ))}
            <Key k="SP" cls="lk" />
            <Key k="/" cls="lk" />
            <Key k="OVFY" label="OVFY" cls="lk sm" />
            <Key k="CLR" cls="lk sm" />
          </div>
        </div>
      </div>
    </div>
  );
}
