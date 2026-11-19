/** Circuit result tabs: network reduction (equivalent impedance, Thévenin/Norton) and AC frequency response. */

import { useMemo, useState } from 'react';
import { Tex } from '@/components/balance/Tex';
import { LineChartBox } from '@/components/heat/charts';
import { Notice } from '@/components/workbench/controls';
import { lampR, ldrR, ntcR, pinsOf, type CComponent } from '@/engine/circuits/devices';
import { cabs, reduceNetwork, type Cx, type RStep } from '@/engine/circuits/reduce';
import { acSweep, solveCircuit } from '@/engine/circuits/solver';
import { formatSI, parseSI } from '@/engine/circuits/units';
import { t, useLang } from '@/i18n';
import { cn } from '@/lib/utils';
import { useCircuit, useCircuitSolution } from '@/store/circuitStore';

const comma = () => useLang.getState().lang !== 'en';
const si = (v: number, u: string, d = 4) => formatSI(v, u, d, comma());
const resistance = (cmp: CComponent) =>
  cmp.kind === 'lamp' ? lampR(cmp.params) : cmp.kind === 'ldr' ? ldrR(cmp.params) : cmp.kind === 'thermistor' ? ntcR(cmp.params) : cmp.kind === 'speaker' ? cmp.params.R ?? 8 : cmp.kind === 'fuse' ? cmp.params.R ?? 0.01 : cmp.params.R ?? 1000;

/** Complex impedance as LaTeX: real (Ω) or a + jb = |Z|∠φ. */
function zTex(z: Cx): string {
  const n = (v: number) => si(v, '', 4).trim().replace(',', '{,}').replace('µ', '\\mu ');
  if (Math.abs(z.im) < 1e-9 * Math.max(1, Math.abs(z.re))) return `${n(z.re)}\\,\\Omega`;
  const ph = (Math.atan2(z.im, z.re) * 180) / Math.PI;
  return `(${n(z.re)} ${z.im < 0 ? '-' : '+'} j\\,${n(Math.abs(z.im))})\\,\\Omega = ${n(cabs(z))}\\,\\Omega\\angle ${ph.toFixed(1).replace('.', comma() ? '{,}' : '.')}^\\circ`;
}

function netLabels(netOf: Map<string, number>, comps: CComponent[]) {
  const by = new Map<number, string[]>();
  for (const c of comps) {
    for (const p of pinsOf(c)) {
      const n = netOf.get(`${c.id}:${p}`);
      if (n === undefined) continue;
      if (!by.has(n)) by.set(n, []);
      by.get(n)!.push(c.kind === 'ground' ? 'GND' : pinsOf(c).length === 2 ? `${c.name}.${p === 'a' ? 1 : 2}` : `${c.name}.${p}`);
    }
  }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([n, l]) => ({ n, label: `${n}: ${l.slice(0, 4).join(', ')}${l.length > 4 ? ' …' : ''}` }));
}

export function SimplifyTab() {
  const { circuit, result } = useCircuitSolution();
  const twoPin = circuit.components.filter((c) => c.kind !== 'ground' && pinsOf(c).length === 2);
  const sources = twoPin.filter((c) => ['vsource', 'acsource', 'battery', 'isource'].includes(c.kind));
  const [mode, setMode] = useState<'source' | 'nodes' | 'thevenin'>('source');
  const [src, setSrc] = useState('');
  const [load, setLoad] = useState('');
  const [a, setA] = useState<number | null>(null);
  const [b, setB] = useState<number | null>(null);
  const [fText, setFText] = useState('0');
  const f = Math.max(0, parseSI(fText) ?? 0);
  const nets = netLabels(result.netOf, circuit.components);
  const srcC = sources.find((c) => c.id === src) ?? sources[0];
  const loadC = twoPin.find((c) => c.id === load) ?? twoPin.find((c) => ['resistor', 'lamp', 'led', 'speaker'].includes(c.kind) && !c.name.startsWith('U'));

  const r = useMemo(() => {
    if (mode === 'source') {
      if (!srcC) return null;
      const others = { ...circuit, components: circuit.components.filter((c) => c.id !== srcC.id) };
      const A = result.netOf.get(`${srcC.id}:a`)!;
      const B = result.netOf.get(`${srcC.id}:b`)!;
      return { red: reduceNetwork(others, result.netOf, A, B, f, resistance), th: null };
    }
    if (mode === 'nodes') {
      if (a === null || b === null) return null;
      return { red: reduceNetwork(circuit, result.netOf, a, b, f, resistance), th: null };
    }
    if (!loadC) return null;
    // Thévenin: replace the load by an ideal voltmeter (keeps its terminals and wires)
    const open = { ...circuit, components: circuit.components.map((c) => (c.id === loadC.id ? { ...c, kind: 'voltmeter' as const, params: {} } : c)) };
    const dc = solveCircuit(open);
    const Uth = dc.ok ? dc.comps.get(loadC.id)!.V : NaN;
    const A = dc.netOf.get(`${loadC.id}:a`)!;
    const B = dc.netOf.get(`${loadC.id}:b`)!;
    const red = reduceNetwork(open, dc.netOf, A, B, 0, resistance);
    return { red, th: { Uth, load: loadC } };
  }, [mode, srcC, loadC, a, b, f, circuit, result.netOf]);

  const sel = 'rounded border border-white/[0.08] bg-plant-950/70 px-2 py-1 text-[11px] text-plant-100';
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-plant-300">
        <div role="group" className="flex rounded border border-white/[0.08] p-0.5">
          {(
            [
              ['source', 'Seen by a source'],
              ['nodes', 'Between two nodes'],
              ['thevenin', 'Thévenin / Norton'],
            ] as const
          ).map(([m, l]) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={cn('rounded-sm px-2 py-0.5', mode === m ? 'bg-signal-vapor/15 text-signal-vapor' : 'hover:text-plant-100')}>
              {t(l)}
            </button>
          ))}
        </div>
        {mode === 'source' && (
          <select aria-label={t('Source')} className={sel} value={srcC?.id ?? ''} onChange={(e) => setSrc(e.target.value)}>
            {sources.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        {mode === 'nodes' && (
          <>
            {[
              ['A', a, setA],
              ['B', b, setB],
            ].map(([lbl, v, set]) => (
              <select key={lbl as string} aria-label={`${t('Node')} ${lbl}`} className={sel} value={v === null ? '' : String(v)} onChange={(e) => (set as (x: number | null) => void)(e.target.value === '' ? null : Number(e.target.value))}>
                <option value="">{`${t('Node')} ${lbl}…`}</option>
                {nets.map((nn) => (
                  <option key={nn.n} value={nn.n}>
                    {nn.label}
                  </option>
                ))}
              </select>
            ))}
          </>
        )}
        {mode === 'thevenin' && (
          <select aria-label={t('Load')} className={sel} value={loadC?.id ?? ''} onChange={(e) => setLoad(e.target.value)}>
            {twoPin
              .filter((c) => !['vsource', 'acsource', 'battery', 'isource'].includes(c.kind))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        )}
        {mode !== 'thevenin' && (
          <label className="flex items-center gap-1">
            f =
            <input aria-label={t('Frequency')} value={fText} onChange={(e) => setFText(e.target.value)} className="w-16 rounded border border-white/[0.08] bg-plant-950/70 px-1 py-0.5 font-mono text-plant-100" />
            Hz <span className="text-plant-500">{t('(0 = DC: C open, L short)')}</span>
          </label>
        )}
      </div>
      {!r && <Notice tone="info">{t('Choose what to simplify.')}</Notice>}
      {r && <Steps red={r.red} />}
      {r?.th && r.red.Z && (
        <div className="rounded-md border border-white/[0.05] p-3 text-[13px] text-plant-100">
          <p className="mb-1 text-[11px] text-plant-400">{t('Equivalent source seen by {name}', { name: r.th.load.name })}</p>
          <Tex block math={`U_{th} = U_{${r.th.load.name}}\\big|_{\\text{${t('open')}}} = ${si(r.th.Uth, 'V').replace(',', '{,}')}`} />
          <Tex block math={`R_{th} = ${zTex(r.red.Z)},\\qquad I_N = \\frac{U_{th}}{R_{th}} = ${si(r.th.Uth / r.red.Z.re, 'A').replace(',', '{,}').replace('µ', '\\mu ')}`} />
          {['resistor', 'lamp', 'speaker'].includes(r.th.load.kind) && (
            <Tex
              block
              math={`I_{${r.th.load.name}} = \\frac{U_{th}}{R_{th} + R_{${r.th.load.name}}} = ${si(r.th.Uth / (r.red.Z.re + resistance(r.th.load)), 'A').replace(',', '{,}').replace('µ', '\\mu ')}`}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Steps({ red }: { red: ReturnType<typeof reduceNetwork> }) {
  if (red.error === 'nonlinear')
    return <Notice tone="warning">{t('Only resistors, lamps, capacitors, inductors and similar two-terminal parts can be combined. Not supported here: {list}.', { list: red.unsupported.join(', ') })}</Notice>;
  return (
    <div className="space-y-1 text-[13px] text-plant-100">
      <ol className="space-y-1">
        {red.steps.map((s, i) => (
          <li key={i} className="flex gap-2 rounded border border-white/[0.04] px-2 py-1">
            <span className="mt-1 font-mono text-[10px] text-plant-500">{i + 1}.</span>
            <StepView s={s} />
          </li>
        ))}
      </ol>
      {red.error === 'open' && <Notice tone="info">{t('No path between the two nodes: the equivalent resistance is infinite (open circuit).')}</Notice>}
      {red.error === 'stuck' && red.Z && <Notice tone="info">{t('A node with four or more branches remains; the rest is evaluated by nodal analysis.')}</Notice>}
      {red.Z && (
        <div className="text-signal-vapor">
          <Tex block math={`\\Rightarrow\\ Z_{ers} = ${zTex(red.Z)}`} />
        </div>
      )}
      {red.check && red.Z && <p className="text-[10px] text-plant-500">{t('Check by nodal analysis: {z}', { z: `${si(cabs(red.check), 'Ω')}` })}</p>}
    </div>
  );
}

function StepView({ s }: { s: RStep }) {
  switch (s.kind) {
    case 'short':
      return <span className="text-[11px] text-plant-300">{t('{name}: ideal voltage source set to zero → short circuit', { name: s.text })}</span>;
    case 'remove':
      return <span className="text-[11px] text-plant-300">{t('{name}: ideal current source set to zero → open circuit', { name: s.text })}</span>;
    case 'dead':
      return <Tex math={`${s.sym}\\ \\text{${t('carries no current (dead end) → removed')}}`} />;
    case 'series':
      return (
        <div>
          <p className="text-[10px] text-plant-500">{t('Series: impedances add')}</p>
          <Tex math={`${s.sym} = ${s.parts.join(' + ')} = ${s.Zs.map((z) => zTex(z)).join(' + ')} = ${zTex(s.Z)}`} />
        </div>
      );
    case 'parallel':
      return (
        <div>
          <p className="text-[10px] text-plant-500">{t('Parallel: admittances add')}</p>
          <Tex
            math={
              s.parts.length === 2
                ? `${s.sym} = ${s.parts[0]} \\parallel ${s.parts[1]} = \\frac{${s.parts[0]} \\cdot ${s.parts[1]}}{${s.parts[0]} + ${s.parts[1]}} = ${zTex(s.Z)}`
                : `\\frac{1}{${s.sym}} = ${s.parts.map((p) => `\\frac{1}{${p}}`).join(' + ')} \\Rightarrow ${s.sym} = ${zTex(s.Z)}`
            }
          />
        </div>
      );
    case 'stardelta':
      return (
        <div>
          <p className="text-[10px] text-plant-500">{t('Star → delta transformation (node with three branches)')}</p>
          <Tex math={`${s.delta.map((d, i) => `${d.sym} = \\frac{${s.star[0]!.sym}${s.star[1]!.sym} + ${s.star[1]!.sym}${s.star[2]!.sym} + ${s.star[2]!.sym}${s.star[0]!.sym}}{${s.star[(i + 2) % 3]!.sym}} = ${zTex(d.Z)}`).join(',\\quad ')}`} />
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// AC analysis
// ---------------------------------------------------------------------------

export function BodeTab() {
  const { circuit } = useCircuitSolution();
  const a = useCircuit((s) => s.analysis);
  const setA = useCircuit((s) => s.setAnalysis);
  const sources = circuit.components.filter((c) => ['vsource', 'acsource', 'battery', 'isource'].includes(c.kind));
  const outs = circuit.components.filter((c) => ['probe', 'voltmeter'].includes(c.kind));
  const input = sources.find((c) => c.id === a.acInput) ?? sources[0];
  const r = useMemo(() => (input ? acSweep(circuit, input.id, a.fMin ?? 1, a.fMax ?? 1e6, 241) : null), [circuit, input, a.fMin, a.fMax]);
  if (!input) return <Notice tone="info">{t('Add a voltage or AC source as the input.')}</Notice>;
  if (!r?.ok) return <Notice tone="error">{t('The AC analysis failed: the linearised circuit has no unique solution.')}</Notice>;
  if (!outs.length) return <Notice tone="info">{t('Place scope probes or voltmeters at the outputs whose frequency response you want.')}</Notice>;
  const traces = outs.map((o) => {
    const pins = pinsOf(o);
    const n1 = r.nets[r.netOf.get(`${o.id}:${pins[0]}`)!]!;
    const n2 = pins.length > 1 ? r.nets[r.netOf.get(`${o.id}:${pins[1]}`)!]! : null;
    const H = r.f.map((_, i) => ({ re: n1.re[i]! - (n2?.re[i] ?? 0), im: n1.im[i]! - (n2?.im[i] ?? 0) }));
    let off = 0;
    let prev = 0;
    const ph = H.map((h, i) => {
      let p = (Math.atan2(h.im, h.re) * 180) / Math.PI;
      if (i) {
        while (p + off - prev > 180) off -= 360;
        while (p + off - prev < -180) off += 360;
      }
      prev = p + off;
      return prev;
    });
    const db = H.map((h) => 20 * Math.log10(Math.max(Math.hypot(h.re, h.im), 1e-12)));
    const maxDb = Math.max(...db);
    const lv = maxDb - 3.0103;
    const i3 = db.findIndex((v, i) => i > 0 && (db[i - 1]! - lv) * (v - lv) < 0);
    // log-frequency interpolation between the two grid points around the −3 dB level
    const fc = i3 > 0 ? r.f[i3 - 1]! * (r.f[i3]! / r.f[i3 - 1]!) ** ((db[i3 - 1]! - lv) / (db[i3 - 1]! - db[i3]!)) : undefined;
    return { name: o.name, db, ph, fc, maxDb };
  });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-plant-300">
        <label className="flex items-center gap-1">
          {t('Input')}
          <select className="rounded border border-white/[0.08] bg-plant-950/70 px-1 py-0.5 text-plant-100" value={input.id} onChange={(e) => setA({ acInput: e.target.value })}>
            {sources.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <FreqInput label="f_min" value={a.fMin ?? 1} onChange={(v) => setA({ fMin: v })} />
        <FreqInput label="f_max" value={a.fMax ?? 1e6} onChange={(v) => setA({ fMax: v })} />
        <span className="text-plant-500">
          {traces.map((tr) => (tr.fc ? `${tr.name}: f₋₃dB ≈ ${si(tr.fc, 'Hz', 3)}` : null)).filter(Boolean).join(' · ')}
        </span>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        <LineChartBox series={traces.map((tr) => ({ name: `${tr.name} |H| [dB]`, data: r.f.map((f, i) => ({ x: f, y: tr.db[i]! })) }))} xLabel="f [Hz]" yLabel="|H| [dB]" logX height={200} digits={1} />
        <LineChartBox series={traces.map((tr) => ({ name: `${tr.name} φ [°]`, data: r.f.map((f, i) => ({ x: f, y: tr.ph[i]! })) }))} xLabel="f [Hz]" yLabel="φ [°]" logX height={200} digits={0} />
      </div>
      <p className="text-[10px] text-plant-500">{t('Small-signal analysis: every device linearised at the DC operating point, input amplitude 1, all other sources zero.')}</p>
    </div>
  );
}

function FreqInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(si(value, '', 3).trim());
  return (
    <label className="flex items-center gap-1">
      {label}
      <input
        aria-label={label}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseSI(e.target.value);
          if (v !== null && v > 0) onChange(v);
        }}
        className="w-16 rounded border border-white/[0.08] bg-plant-950/70 px-1 py-0.5 font-mono text-plant-100"
      />
      Hz
    </label>
  );
}
