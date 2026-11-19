import { RotateCw, Trash2 } from 'lucide-react';
import { useEffect, useState, type DragEvent } from 'react';
import { Tex } from '@/components/balance/Tex';
import { Notice } from '@/components/workbench/controls';
import { diodeParams, lampR, type CKind, type CParams } from '@/engine/circuits/solver';
import { formatSI, parseSI } from '@/engine/circuits/units';
import { t, useLang } from '@/i18n';
import { cn } from '@/lib/utils';
import { EXAMPLES, useCircuit, useCircuitSolution, type CNode, type ExampleId } from '@/store/circuitStore';
import { CIRCUIT_DND, Symbol, valueLabel } from './CircuitCanvas';

export const KIND_LABEL: Record<CKind, string> = {
  resistor: 'Resistor',
  vsource: 'Voltage source',
  isource: 'Current source',
  diode: 'Diode',
  led: 'LED',
  lamp: 'Lamp',
  switch: 'Switch',
  capacitor: 'Capacitor',
  inductor: 'Inductor',
  ammeter: 'Ammeter',
  voltmeter: 'Voltmeter',
  ground: 'Ground',
};

const GROUPS: { title: string; kinds: CKind[] }[] = [
  { title: 'Sources', kinds: ['vsource', 'isource', 'ground'] },
  { title: 'Passive', kinds: ['resistor', 'lamp', 'capacitor', 'inductor', 'switch'] },
  { title: 'Semiconductors', kinds: ['diode', 'led'] },
  { title: 'Measurement', kinds: ['ammeter', 'voltmeter'] },
];

const comma = () => useLang.getState().lang !== 'en';
const si = (v: number, u: string, d = 3) => formatSI(v, u, d, comma());

export function CircuitPalette() {
  const load = useCircuit((s) => s.load);
  const clear = useCircuit((s) => s.clear);
  const onDragStart = (e: DragEvent, kind: CKind) => {
    e.dataTransfer.setData(CIRCUIT_DND, kind);
    e.dataTransfer.effectAllowed = 'move';
  };
  return (
    <aside className="glass flex w-56 shrink-0 flex-col overflow-y-auto">
      <div className="border-b border-white/[0.05] px-3 py-2.5">
        <p className="tag text-plant-400">{t('Components')}</p>
        <p className="mt-0.5 text-[10px] text-plant-500">{t('Drag in, then wire the terminals')}</p>
      </div>
      <div className="space-y-2 p-2">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p className="tag px-2 pb-1 pt-1 text-plant-500">{t(g.title)}</p>
            <ul className="space-y-0.5">
              {g.kinds.map((k) => (
                <li
                  key={k}
                  draggable
                  onDragStart={(e) => onDragStart(e, k)}
                  className="group flex cursor-grab items-center gap-2.5 rounded-md border border-transparent px-2 py-1 transition-colors hover:border-white/[0.06] hover:bg-white/[0.03] active:cursor-grabbing"
                >
                  <svg viewBox={k === 'ground' ? '18 0 60 40' : '0 0 96 40'} className="h-5 w-12 shrink-0 fill-none stroke-plant-300 stroke-[2] text-plant-300 group-hover:stroke-signal-vapor" aria-hidden>
                    <Symbol kind={k} params={{ closed: false, color: 'red' }} />
                  </svg>
                  <span className="text-xs text-plant-200">{t(KIND_LABEL[k])}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-auto space-y-1 border-t border-white/[0.05] p-3">
        <p className="tag mb-1 text-plant-400">{t('Examples')}</p>
        {(Object.keys(EXAMPLES) as ExampleId[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => load(id)}
            className="block w-full rounded border border-white/[0.08] px-2 py-1 text-left text-[11px] text-plant-200 hover:border-signal-vapor/40 hover:text-signal-vapor"
          >
            {t(EXAMPLES[id].label)}
          </button>
        ))}
        <button type="button" onClick={clear} className="block w-full rounded border border-white/[0.08] px-2 py-1 text-left text-[11px] text-plant-300 hover:border-signal-alarm/40 hover:text-signal-alarm">
          {t('Empty sheet')}
        </button>
      </div>
    </aside>
  );
}

const inputCls = 'w-full rounded border border-white/[0.08] bg-plant-950/70 px-2 py-1 font-mono text-xs text-plant-100 outline-none focus:border-signal-vapor/50';

/** Number field with SI prefixes (4k7, 10m, 2,2µ). */
function SIInput({ label, unit, value, onChange }: { label: string; unit: string; value: number | undefined; onChange: (v: number) => void }) {
  const [text, setText] = useState(value === undefined ? '' : si(value, '', 4).trim());
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setText((cur) => (parseSI(cur) === value ? cur : value === undefined ? '' : si(value, '', 4).trim()));
  }, [value]);
  return (
    <label className="grid grid-cols-[minmax(0,1fr)_110px_28px] items-center gap-2 text-[11px] text-plant-300">
      <span>{label}</span>
      <input
        className={cn(inputCls, bad && 'border-signal-alarm/60')}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseSI(e.target.value);
          setBad(v === null);
          if (v !== null) onChange(v);
        }}
      />
      <span className="font-mono text-[10px] text-plant-500">{unit}</span>
    </label>
  );
}

const FIELDS: Partial<Record<CKind, { key: keyof CParams; label: string; unit: string }[]>> = {
  resistor: [
    { key: 'R', label: 'Resistance R', unit: 'Ω' },
    { key: 'Pmax', label: 'Power rating (optional)', unit: 'W' },
  ],
  vsource: [{ key: 'V', label: 'Voltage U', unit: 'V' }],
  isource: [{ key: 'I', label: 'Current I', unit: 'A' }],
  diode: [
    { key: 'Is', label: 'Saturation current I_S', unit: 'A' },
    { key: 'n', label: 'Emission coefficient n', unit: '' },
  ],
  led: [
    { key: 'Vf', label: 'Forward voltage U_F', unit: 'V' },
    { key: 'Inom', label: 'Nominal current I_F', unit: 'A' },
  ],
  lamp: [
    { key: 'Vnom', label: 'Rated voltage', unit: 'V' },
    { key: 'Pnom', label: 'Rated power', unit: 'W' },
  ],
  capacitor: [{ key: 'C', label: 'Capacitance C', unit: 'F' }],
  inductor: [{ key: 'L', label: 'Inductance L', unit: 'H' }],
};

const HINT: Partial<Record<CKind, string>> = {
  vsource: 'Terminal + is on the side marked +.',
  isource: 'The arrow shows the direction the current leaves the source.',
  diode: 'Shockley equation I = I_S·(e^(U/(n·U_T)) − 1); defaults: 1N4148.',
  led: 'Modelled as a diode that passes I_F at U_F (n = 2). Brightness follows the current.',
  lamp: 'Hot resistance R = U²/P from the rating; brightness follows the power.',
  capacitor: 'At DC a capacitor carries no current (open circuit).',
  inductor: 'At DC an inductor is a short circuit.',
  ammeter: 'Ideal: no voltage drop. Insert it in series.',
  voltmeter: 'Ideal: no current. Connect it in parallel.',
  switch: 'Double-click the switch on the sheet to toggle it.',
  ground: 'Reference potential 0 V.',
};

function CompPanel({ n }: { n: CNode }) {
  const update = useCircuit((s) => s.update);
  const setParam = useCircuit((s) => s.setParam);
  const rotate = useCircuit((s) => s.rotate);
  const remove = useCircuit((s) => s.remove);
  const { result } = useCircuitSolution();
  const r = result.comps.get(n.id);
  const d = n.data;
  return (
    <>
      <div className="space-y-2 border-b border-white/[0.04] px-4 py-3">
        <p className="tag text-plant-500">{t(KIND_LABEL[d.kind])}</p>
        <input aria-label={t('Name')} className={cn(inputCls, 'font-sans')} value={d.name} onChange={(e) => update(n.id, { name: e.target.value })} />
        <div className="flex gap-2">
          {d.kind !== 'ground' && (
            <button type="button" onClick={() => rotate(n.id)} className="flex items-center gap-1 rounded border border-white/[0.08] px-2 py-1 text-[11px] text-plant-300 hover:text-signal-vapor">
              <RotateCw className="h-3 w-3" /> {t('Rotate')}
            </button>
          )}
          <button type="button" onClick={() => remove(n.id)} className="flex items-center gap-1 rounded border border-white/[0.08] px-2 py-1 text-[11px] text-plant-300 hover:text-signal-alarm">
            <Trash2 className="h-3 w-3" /> {t('Delete')}
          </button>
        </div>
      </div>
      {(FIELDS[d.kind] || d.kind === 'switch' || d.kind === 'led') && (
        <div className="space-y-2 border-b border-white/[0.04] px-4 py-3">
          <p className="tag text-plant-500">{t('Parameters')}</p>
          {FIELDS[d.kind]?.map((f) => (
            <SIInput key={f.key} label={t(f.label)} unit={f.unit} value={d.params[f.key] as number | undefined} onChange={(v) => setParam(n.id, f.key, v)} />
          ))}
          {d.kind === 'led' && (
            <label className="grid grid-cols-[minmax(0,1fr)_138px] items-center gap-2 text-[11px] text-plant-300">
              <span>{t('Colour')}</span>
              <select value={d.params.color ?? 'red'} onChange={(e) => setParam(n.id, 'color', e.target.value as CParams['color'])} className="rounded border border-white/[0.08] bg-plant-950/70 px-2 py-1 text-xs text-plant-100">
                {(['red', 'green', 'blue', 'yellow', 'white'] as const).map((c) => (
                  <option key={c} value={c}>
                    {t(c)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {d.kind === 'switch' && (
            <label className="flex cursor-pointer items-center gap-2 text-[11px] text-plant-300">
              <input type="checkbox" checked={!!d.params.closed} onChange={(e) => setParam(n.id, 'closed', e.target.checked)} />
              {t('Switch closed')}
            </label>
          )}
        </div>
      )}
      {HINT[d.kind] && <p className="border-b border-white/[0.04] px-4 py-3 text-[10px] leading-relaxed text-plant-500">{t(HINT[d.kind]!)}</p>}
      {r && result.ok && d.kind !== 'ground' && (
        <div className="space-y-1 px-4 py-3 font-mono text-[11px]">
          <p className="tag mb-1 font-sans text-plant-500">{t('Operating point')}</p>
          <Row k="U" v={si(r.V, 'V', 4)} />
          <Row k="I" v={si(r.I, 'A', 4)} />
          <Row k="P" v={`${si(Math.abs(r.P), 'W', 4)} ${r.P < -1e-15 ? t('delivered') : r.P > 1e-15 ? t('absorbed') : ''}`} />
          {Math.abs(r.I) > 1e-12 && <Row k="R = U/I" v={si(r.V / r.I, 'Ω', 4)} />}
          {r.level !== undefined && <Row k={t('Brightness')} v={`${Math.round(r.level * 100)} %`} />}
        </div>
      )}
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-plant-400">{k}</span>
      <span className="text-plant-100">{v}</span>
    </div>
  );
}

export function CircuitInspector() {
  const node = useCircuit((s) => s.nodes.find((n) => n.selected));
  return (
    <aside className="glass flex w-72 shrink-0 flex-col overflow-y-auto">
      <div className="border-b border-white/[0.05] px-4 py-3">
        <p className="tag text-plant-400">{t('Inspector')}</p>
        <p className="mt-0.5 text-xs text-plant-200">{node ? node.data.name : t('Select a component')}</p>
      </div>
      {node ? (
        <CompPanel key={node.id} n={node} />
      ) : (
        <div className="space-y-2 px-4 py-4 text-[11px] leading-relaxed text-plant-400">
          <p>{t('1. Drag components onto the sheet.')}</p>
          <p>{t('2. Drag from one terminal to another to draw a wire. Terminals joined by wires form one node.')}</p>
          <p>{t('3. Click a component to name it and set its values; SI prefixes work: 4k7, 330, 10m, 2,2µ.')}</p>
          <p>{t('4. Place a ground symbol to fix the 0 V reference. Results update instantly below.')}</p>
        </div>
      )}
    </aside>
  );
}

type Tab = 'table' | 'nodes' | 'system' | 'power';

export function CircuitResults() {
  const [tab, setTab] = useState<Tab>('table');
  const { result } = useCircuitSolution();
  const tabs: { id: Tab; label: string }[] = [
    { id: 'table', label: 'Currents & voltages' },
    { id: 'nodes', label: 'Node potentials' },
    { id: 'system', label: 'Nodal equations' },
    { id: 'power', label: 'Power balance' },
  ];
  return (
    <section className="glass flex h-[42%] min-h-[220px] shrink-0 flex-col overflow-hidden">
      <div role="tablist" className="flex items-center gap-1 border-b border-white/[0.05] px-2 py-1.5">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            role="tab"
            type="button"
            aria-selected={tab === tb.id}
            onClick={() => setTab(tb.id)}
            className={cn('rounded px-2.5 py-1 text-[11px] transition-colors', tab === tb.id ? 'bg-signal-vapor/15 text-signal-vapor' : 'text-plant-300 hover:bg-white/[0.04]')}
          >
            {t(tb.label)}
          </button>
        ))}
        <span className="ml-auto pr-2 font-mono text-[10px]">
          {result.ok ? (
            <span className="text-signal-ok">
              {t('solved')} · {result.nets} {t('nodes')}
              {result.iterations > 1 ? ` · ${result.iterations} ${t('Newton iterations')}` : ''}
            </span>
          ) : (
            <span className="text-signal-alarm">{t('not solvable')}</span>
          )}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <Messages />
        {result.ok && (tab === 'table' ? <Table /> : tab === 'nodes' ? <Nodes /> : tab === 'system' ? <System /> : <Power />)}
      </div>
    </section>
  );
}

function Messages() {
  const { result, circuit } = useCircuitSolution();
  const names = new Map(circuit.components.map((c) => [c.id, c.name]));
  const msgs: { tone: 'error' | 'warning' | 'info'; text: string }[] = [];
  if (result.error === 'empty') msgs.push({ tone: 'info', text: t('Drag components onto the sheet to start.') });
  if (result.error === 'singular')
    msgs.push({ tone: 'error', text: t('The circuit has no unique solution: ideal voltage sources (or ammeters) in a closed loop, or current sources in series with an open branch.') });
  if (result.error === 'noconverge') msgs.push({ tone: 'error', text: t('The Newton iteration did not converge.') });
  if (result.ok && result.groundAssumed) msgs.push({ tone: 'info', text: t('No ground placed: the minus terminal of the first source is taken as 0 V.') });
  if (result.ok && result.floating.length) msgs.push({ tone: 'warning', text: t('Some terminals are not connected to the rest of the circuit; they carry no current.') });
  for (const [id, r] of result.comps) {
    if (r.warn === 'overload') msgs.push({ tone: 'warning', text: t('{name} is overloaded.', { name: names.get(id) ?? id }) });
    if (r.warn === 'short') msgs.push({ tone: 'error', text: t('{name} is short-circuited (more than 100 A).', { name: names.get(id) ?? id }) });
    if (r.warn === 'reverse') msgs.push({ tone: 'warning', text: t('{name} is reverse biased beyond 5 V — real LEDs break down here.', { name: names.get(id) ?? id }) });
  }
  if (!msgs.length) return null;
  return (
    <div className="mb-2 space-y-1">
      {msgs.map((m, i) => (
        <Notice key={i} tone={m.tone}>
          {m.text}
        </Notice>
      ))}
    </div>
  );
}

function Table() {
  const { result, circuit } = useCircuitSolution();
  const rows = circuit.components.filter((c) => c.kind !== 'ground');
  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="border-b border-white/[0.06] text-plant-500">
          {['Component', 'Type', 'Value', 'Voltage U', 'Current I', 'R = U/I', 'Power P', ''].map((h) => (
            <th key={h} className="px-2 py-1 text-left font-normal">
              {t(h)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => {
          const r = result.comps.get(c.id)!;
          const Ropt = Math.abs(r.I) > 1e-12 ? si(r.V / r.I, 'Ω') : '∞';
          return (
            <tr key={c.id} className="border-b border-white/[0.03] font-mono">
              <td className="px-2 py-1 text-plant-100">{c.name}</td>
              <td className="px-2 py-1 font-sans text-plant-400">{t(KIND_LABEL[c.kind])}</td>
              <td className="px-2 py-1 text-plant-300">{valueLabel(c.kind, c.params)}</td>
              <td className="px-2 py-1 text-signal-vapor">{si(r.V, 'V', 4)}</td>
              <td className="px-2 py-1 text-signal-vapor">{si(r.I, 'A', 4)}</td>
              <td className="px-2 py-1 text-plant-300">{c.kind === 'vsource' || c.kind === 'isource' || c.kind === 'ammeter' ? '–' : Ropt}</td>
              <td className={cn('px-2 py-1', r.P < -1e-15 ? 'text-signal-ok' : 'text-plant-200')}>{si(r.P, 'W', 4)}</td>
              <td className="px-2 py-1 font-sans text-[10px] text-signal-alarm">{r.warn ? t(r.warn === 'overload' ? 'overload' : r.warn === 'short' ? 'short circuit' : 'reverse') : ''}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={8} className="px-2 pt-2 text-[10px] text-plant-500">
            {t('U and I use the passive sign convention from terminal a to b (+ terminal of sources); a negative power means the element delivers energy.')}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

function Nodes() {
  const { result, circuit } = useCircuitSolution();
  const byNet = new Map<number, string[]>();
  for (const c of circuit.components) {
    for (const p of c.kind === 'ground' ? ['a'] : ['a', 'b']) {
      const n = result.netOf.get(`${c.id}:${p}`);
      if (n === undefined) continue;
      if (!byNet.has(n)) byNet.set(n, []);
      byNet.get(n)!.push(c.kind === 'ground' ? c.name : `${c.name}.${p === 'a' ? (c.kind === 'vsource' ? '+' : '1') : c.kind === 'vsource' ? '−' : '2'}`);
    }
  }
  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="border-b border-white/[0.06] text-plant-500">
          <th className="px-2 py-1 text-left font-normal">{t('Node')}</th>
          <th className="px-2 py-1 text-left font-normal">{t('Potential φ')}</th>
          <th className="px-2 py-1 text-left font-normal">{t('Connected terminals')}</th>
        </tr>
      </thead>
      <tbody>
        {[...byNet.keys()].sort((a, b) => a - b).map((n) => (
          <tr key={n} className="border-b border-white/[0.03]">
            <td className="px-2 py-1 font-mono text-plant-100">
              {n === result.ground ? `${n} (${t('ground')})` : n}
            </td>
            <td className="px-2 py-1 font-mono text-signal-vapor">{result.floating.includes(n) ? t('floating') : si(result.potentials[n]!, 'V', 5)}</td>
            <td className="px-2 py-1 text-plant-400">{byNet.get(n)!.join(', ')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function System() {
  const { result, circuit } = useCircuitSolution();
  const sys = result.system;
  if (!sys || !sys.labels.length) return null;
  if (sys.labels.length > 14) return <Notice tone="info">{t('The system has {n} unknowns — too large to display.', { n: sys.labels.length })}</Notice>;
  const f = (v: number) => {
    if (Math.abs(v) < 1e-15) return '0';
    const s = Math.abs(v) >= 1e4 || Math.abs(v) < 1e-3 ? v.toExponential(3).replace(/e([+-]?\d+)/, '\\cdot10^{$1}') : String(Number(v.toPrecision(5)));
    return comma() ? s.replace('.', '{,}') : s;
  };
  const lab = (l: string) => (l.startsWith('φ') ? `\\varphi_{${l.slice(1)}}` : `I_{\\text{${l.slice(2).replace(/[\\{}$&#%_^~]/g, '')}}}`);
  const M = `\\begin{pmatrix}${sys.G.map((r) => r.map(f).join(' & ')).join('\\\\')}\\end{pmatrix}`;
  const X = `\\begin{pmatrix}${sys.labels.map(lab).join('\\\\')}\\end{pmatrix}`;
  const B = `\\begin{pmatrix}${sys.rhs.map(f).join('\\\\')}\\end{pmatrix}`;
  const nonlinear = circuit.components.some((c) => c.kind === 'diode' || c.kind === 'led');
  return (
    <div className="space-y-2 text-plant-100">
      <p className="text-[11px] text-plant-400">
        {t('Modified nodal analysis: one Kirchhoff current equation per node (conductances in S), one equation per voltage source or ammeter (its current is an extra unknown).')}
      </p>
      <Tex math={`${M}\\,${X} = ${B}`} block />
      {nonlinear && <p className="text-[10px] text-plant-500">{t('Diodes appear linearised at the operating point: conductance g_D = dI/dU plus an equivalent current source (last Newton step).')}</p>}
      <p className="font-mono text-[10px] text-plant-400">
        {t('Solution')}:{' '}
        {[
          ...[...Array(result.nets).keys()].filter((n) => n !== result.ground).map((n) => `φ${n} = ${si(result.potentials[n]!, 'V', 5)}`),
          ...circuit.components.filter((c) => c.kind === 'vsource' || c.kind === 'ammeter' || c.kind === 'inductor').map((c) => `I_${c.name} = ${si(result.comps.get(c.id)!.I, 'A', 5)}`),
        ].join(' · ')}
      </p>
    </div>
  );
}

function Power() {
  const { result, circuit } = useCircuitSolution();
  const items = circuit.components.filter((c) => c.kind !== 'ground').map((c) => ({ c, r: result.comps.get(c.id)! }));
  const delivered = items.filter((i) => i.r.P < -1e-15);
  const absorbed = items.filter((i) => i.r.P > 1e-15);
  const sum = (a: typeof items) => a.reduce((s, i) => s + Math.abs(i.r.P), 0);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {[
        { title: 'Delivered', list: delivered },
        { title: 'Absorbed', list: absorbed },
      ].map((g) => (
        <div key={g.title} className="rounded-md border border-white/[0.05] p-3">
          <p className="tag mb-2 text-plant-500">
            {t(g.title)} · {si(sum(g.list), 'W', 4)}
          </p>
          <ul className="space-y-0.5 font-mono text-[11px]">
            {g.list.map(({ c, r }) => (
              <li key={c.id} className="flex justify-between">
                <span className="text-plant-200">
                  {c.name} <span className="font-sans text-plant-500">{t(KIND_LABEL[c.kind])}</span>
                </span>
                <span className="text-plant-100">{si(Math.abs(r.P), 'W', 4)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="text-[11px] text-plant-400 md:col-span-2">
        {t('Check: delivered − absorbed = {d}; largest Kirchhoff current residual {k}.', { d: si(-result.powerBalance, 'W', 3), k: si(result.kclResidual, 'A', 2) })}
      </p>
      <p className="text-[10px] text-plant-500 md:col-span-2">
        {circuit.components.some((c) => c.kind === 'lamp') && t('Lamps: R = U²/P = {r} for the first lamp.', { r: si(lampR(circuit.components.find((c) => c.kind === 'lamp')!.params), 'Ω') })}{' '}
        {circuit.components.some((c) => c.kind === 'diode' || c.kind === 'led') &&
          t('Diode model: I = I_S·(e^(U/(n·U_T)) − 1), U_T = 25.85 mV; first diode I_S = {is}, n = {n}.', {
            is: si(diodeParams(circuit.components.find((c) => c.kind === 'diode' || c.kind === 'led')!).Is, 'A'),
            n: diodeParams(circuit.components.find((c) => c.kind === 'diode' || c.kind === 'led')!).n.toFixed(2),
          })}
      </p>
    </div>
  );
}
