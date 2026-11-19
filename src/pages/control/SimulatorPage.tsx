import { FlipHorizontal2, Trash2 } from 'lucide-react';
import { useMemo, useState, type DragEvent } from 'react';
import { Tex } from '@/components/balance/Tex';
import { SimCanvas, useSimulation } from '@/components/control/SimCanvas';
import { ALL, SpecEditor } from '@/components/control/SpecEditor';
import { LineChartBox } from '@/components/heat/charts';
import { fieldCls, nf, Num } from '@/components/mechanics/common';
import { Kpi, Notice } from '@/components/workbench/controls';
import { hasOutput, linearTF, type SimBlockData, type SrcWave } from '@/engine/control/blocksim';
import { bode, cTex, roots, stepInfo, stepResponse, tfTex } from '@/engine/control/poly';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';
import { PRESETS, SIM_DND, SIM_EXAMPLES, useControlSim, type SNode } from '@/store/controlSimStore';

function Palette() {
  const load = useControlSim((s) => s.load);
  const clear = useControlSim((s) => s.clear);
  const onDragStart = (e: DragEvent, id: string) => {
    e.dataTransfer.setData(SIM_DND, id);
    e.dataTransfer.effectAllowed = 'move';
  };
  return (
    <aside className="glass flex w-56 shrink-0 flex-col overflow-y-auto">
      <div className="border-b border-white/[0.05] px-3 py-2.5">
        <p className="tag text-plant-400">{t('Blocks')}</p>
        <p className="mt-0.5 text-[10px] text-plant-500">{t('Drag in, then wire output → input')}</p>
      </div>
      <div className="space-y-2 p-2">
        {PRESETS.map((g) => (
          <div key={g.title}>
            <p className="tag px-2 pb-1 pt-1 text-plant-500">{t(g.title)}</p>
            <ul className="space-y-0.5">
              {g.items.map((p) => (
                <li
                  key={p.id}
                  draggable
                  onDragStart={(e) => onDragStart(e, p.id)}
                  className="cursor-grab rounded-md border border-transparent px-2 py-1 text-xs text-plant-200 transition-colors hover:border-white/[0.06] hover:bg-white/[0.03] hover:text-signal-vapor active:cursor-grabbing"
                >
                  {t(p.label)}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-auto space-y-1 border-t border-white/[0.05] p-3">
        <p className="tag mb-1 text-plant-400">{t('Examples')}</p>
        {Object.entries(SIM_EXAMPLES).map(([id, ex]) => (
          <button key={id} type="button" onClick={() => load(id)} className="block w-full rounded border border-white/[0.08] px-2 py-1 text-left text-[11px] text-plant-200 hover:border-signal-vapor/40 hover:text-signal-vapor">
            {t(ex.label)}
          </button>
        ))}
        <button type="button" onClick={clear} className="block w-full rounded border border-white/[0.08] px-2 py-1 text-left text-[11px] text-plant-300 hover:border-signal-alarm/40 hover:text-signal-alarm">
          {t('Empty sheet')}
        </button>
      </div>
    </aside>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-2 text-[11px] text-plant-300">
      <span>{label}</span>
      {children}
    </label>
  );
}

const WAVES: { id: SrcWave; label: string }[] = [
  { id: 'step', label: 'Step' },
  { id: 'ramp', label: 'Ramp' },
  { id: 'sine', label: 'Sine' },
  { id: 'square', label: 'Square wave' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'const', label: 'Constant' },
  { id: 'noise', label: 'Noise' },
];

function BlockPanel({ n }: { n: SNode }) {
  const update = useControlSim((s) => s.update);
  const remove = useControlSim((s) => s.remove);
  const d = n.data;
  const set = (p: Partial<SimBlockData>) => update(n.id, p);
  return (
    <div className="space-y-3 px-4 py-3">
      <input aria-label={t('Name')} className={cn(fieldCls, 'font-sans')} value={d.name} onChange={(e) => set({ name: e.target.value })} />
      <div className="flex gap-2">
        {d.kind !== 'scope' && d.kind !== 'source' && (
          <button type="button" onClick={() => set({ flip: !d.flip })} className="flex items-center gap-1 rounded border border-white/[0.08] px-2 py-1 text-[11px] text-plant-300 hover:text-signal-vapor">
            <FlipHorizontal2 className="h-3 w-3" /> {t('Mirror')}
          </button>
        )}
        <button type="button" onClick={() => remove(n.id)} className="flex items-center gap-1 rounded border border-white/[0.08] px-2 py-1 text-[11px] text-plant-300 hover:text-signal-alarm">
          <Trash2 className="h-3 w-3" /> {t('Delete')}
        </button>
      </div>
      {d.kind === 'source' && (
        <div className="space-y-1.5">
          <Row label={t('Signal')}>
            <select className={fieldCls} value={d.wave ?? 'step'} onChange={(e) => set({ wave: e.target.value as SrcWave })}>
              {WAVES.map((w) => (
                <option key={w.id} value={w.id}>
                  {t(w.label)}
                </option>
              ))}
            </select>
          </Row>
          <Row label={d.wave === 'ramp' ? t('Slope') : t('Amplitude')}>
            <Num ariaLabel="amp" value={d.amp ?? 1} onChange={(v) => set({ amp: v })} />
          </Row>
          {d.wave !== 'const' && (
            <Row label={t('Start time t₀ [s]')}>
              <Num ariaLabel="t0" value={d.t0 ?? 0} onChange={(v) => set({ t0: v })} />
            </Row>
          )}
          {(d.wave === 'sine' || d.wave === 'square') && (
            <Row label={t('Frequency f [Hz]')}>
              <Num ariaLabel="f" value={d.f ?? 1} onChange={(v) => set({ f: v })} />
            </Row>
          )}
          {d.wave === 'pulse' && (
            <Row label={t('Pulse width [s]')}>
              <Num ariaLabel="width" value={d.width ?? 1} onChange={(v) => set({ width: v })} />
            </Row>
          )}
        </div>
      )}
      {d.kind === 'sum' && (
        <Row label={t('Signs of the inputs')}>
          <input
            aria-label={t('Signs of the inputs')}
            className={fieldCls}
            value={d.signs ?? '+-'}
            onChange={(e) => {
              const v = e.target.value.replace(/[^+-]/g, '').slice(0, 4);
              if (v.length) set({ signs: v });
            }}
          />
        </Row>
      )}
      {d.kind === 'sum' && <p className="text-[10px] text-plant-500">{t('1st input left, 2nd bottom, 3rd top, 4th lower left. Example: "+-" = w − y.')}</p>}
      {d.kind === 'gain' && (
        <Row label="K">
          <Num ariaLabel="K" value={d.K ?? 1} onChange={(v) => set({ K: v })} />
        </Row>
      )}
      {d.kind === 'sat' && (
        <div className="space-y-1.5">
          <Row label={t('Lower limit')}>
            <Num ariaLabel="lo" value={d.lo ?? -1} onChange={(v) => set({ lo: v })} />
          </Row>
          <Row label={t('Upper limit')}>
            <Num ariaLabel="hi" value={d.hi ?? 1} onChange={(v) => set({ hi: v })} />
          </Row>
        </div>
      )}
      {d.kind === 'scope' && (
        <Row label={t('Number of inputs')}>
          <Num ariaLabel="inputs" value={d.inputs ?? 1} onChange={(v) => set({ inputs: Math.min(4, Math.max(1, Math.round(v))) })} />
        </Row>
      )}
      {d.kind === 'tf' && <SpecEditor key={n.id + (d.spec?.kind ?? '')} spec={d.spec ?? { kind: 'PT1', K: 1, T: 1 }} kinds={ALL} onChange={(spec) => set({ spec })} />}
    </div>
  );
}

function Inspector() {
  const node = useControlSim((s) => s.nodes.find((n) => n.selected));
  return (
    <aside className="glass flex w-72 shrink-0 flex-col overflow-y-auto">
      <div className="border-b border-white/[0.05] px-4 py-3">
        <p className="tag text-plant-400">{t('Inspector')}</p>
        <p className="mt-0.5 text-xs text-plant-200">{node ? node.data.name : t('Select a block')}</p>
      </div>
      {node ? (
        <BlockPanel key={node.id} n={node} />
      ) : (
        <div className="space-y-2 px-4 py-4 text-[11px] leading-relaxed text-plant-400">
          <p>{t('1. Drag sources, summing points, controllers and plants onto the sheet.')}</p>
          <p>{t('2. Drag from a block output (filled dot, right) to an input (hollow dot). One output may feed several inputs.')}</p>
          <p>{t('3. Close the loop: plant output back to the − input of the summing point. Blocks in the feedback path can be mirrored.')}</p>
          <p>{t('4. Put a scope on the signals you want to see. The simulation runs on every change; the transfer function tab solves the diagram symbolically.')}</p>
        </div>
      )}
    </aside>
  );
}

const COLORS = ['rgb(var(--sig-liquid))', 'rgb(var(--plant-400))', 'rgb(var(--sig-vapor))', 'rgb(var(--sig-heat))'];

function ScopeTab() {
  const { r } = useSimulation();
  if (!r.ok) return null;
  if (!r.scopes.length) return <Notice tone="info">{t('Place a scope and wire the signals you want to see into it.')}</Notice>;
  const step = Math.max(1, Math.floor(r.t.length / 800));
  return (
    <div className={cn('grid gap-3', r.scopes.length > 1 && 'xl:grid-cols-2')}>
      {r.scopes.map((sc) => {
        const main = sc.traces[0];
        const fin = main?.data.at(-1) ?? 0;
        const info = main ? stepInfo(r.t, main.data, fin) : null;
        return (
          <div key={sc.id} className="space-y-1">
            <p className="text-[11px] font-semibold text-plant-200">{sc.name}</p>
            {sc.traces.length ? (
              <>
                <LineChartBox
                  series={sc.traces.map((tr, k) => ({ name: tr.name, data: r.t.filter((_, i) => i % step === 0).map((tt, i) => ({ x: tt, y: tr.data[i * step]! })), color: COLORS[k % 4], dashed: k === 1 }))}
                  xLabel="t [s]"
                  yLabel=""
                  height={220}
                  digits={2}
                />
                {main && (
                  <p className="font-mono text-[10px] text-plant-400">
                    {main.name}: {t('end value')} {nf(fin, 4)} · max {nf(Math.max(...main.data), 4)}
                    {info && info.overshoot > 0.05 ? ` · ${t('Overshoot')} ${nf(info.overshoot, 1)} %` : ''}
                    {info?.rise ? ` · ${t('Rise time')} ${nf(info.rise, 3)} s` : ''}
                    {info ? ` · ${t('Settling time')} (2 %) ${nf(info.settling, 3)} s` : ''}
                  </p>
                )}
              </>
            ) : (
              <p className="text-[10px] text-plant-500">{t('No signal connected.')}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TFTab() {
  const { blocks, wires } = useSimulation();
  const settings = useControlSim((s) => s.settings);
  const setSettings = useControlSim((s) => s.setSettings);
  const sources = blocks.filter((b) => b.data.kind === 'source');
  const outs = blocks.filter((b) => hasOutput(b.data) && b.data.kind !== 'source');
  const src = sources.find((b) => b.id === settings.src) ?? sources[0];
  const out = outs.find((b) => b.id === settings.out) ?? outs.find((b) => b.data.kind === 'tf' && !b.data.flip && wires.some((w) => w.source === b.id && blocks.find((x) => x.id === w.target)?.data.kind === 'sum')) ?? outs.at(-1);
  const lin = useMemo(() => (src && out ? linearTF(blocks, wires, src.id, out.id) : null), [blocks, wires, src, out]);
  const T = lin?.T ?? null;
  const poles = useMemo(() => (T ? roots(T.den) : []), [T]);
  const stable = poles.every((p) => p.re < -1e-9);
  const allW = poles.map((p) => Math.hypot(p.re, p.im)).filter((v) => v > 1e-9);
  const bd = useMemo(() => (T && T.num.some((v) => v !== 0) ? bode(T, Math.max(1e-4, Math.min(1, ...allW) / 100), Math.min(1e5, Math.max(1, ...allW) * 100), 300) : []), [T]); // eslint-disable-line react-hooks/exhaustive-deps
  const sr = useMemo(() => (T ? stepResponse(T, Math.max(settings.tEnd, 1), 800) : null), [T, settings.tEnd]);
  if (!src || !out) return <Notice tone="info">{t('Add a source and at least one block.')}</Notice>;
  const sel = 'rounded border border-white/[0.08] bg-plant-950/70 px-2 py-1 text-[11px] text-plant-100';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-plant-300">
        {t('from')}
        <select aria-label={t('Input signal')} className={sel} value={src.id} onChange={(e) => setSettings({ src: e.target.value })}>
          {sources.map((b) => (
            <option key={b.id} value={b.id}>
              {b.data.name}
            </option>
          ))}
        </select>
        {t('to')}
        <select aria-label={t('Output signal')} className={sel} value={out.id} onChange={(e) => setSettings({ out: e.target.value })}>
          {outs.map((b) => (
            <option key={b.id} value={b.id}>
              {b.data.name}
            </option>
          ))}
        </select>
        <span className="text-plant-500">{t('(all other sources set to zero)')}</span>
      </div>
      {lin?.linearised.length ? <Notice tone="info">{t('Linearised: {list} (saturation as gain 1, dead time as 3rd-order Padé approximation).', { list: lin.linearised.join(', ') })}</Notice> : null}
      {lin && !lin.ok && <Notice tone="error">{t('The diagram has no unique solution (check the wiring: every loop needs a block with dynamics).')}</Notice>}
      <div className="grid gap-3 xl:grid-cols-2">
        <div className="space-y-2">
          <p className="tag text-plant-500">{t('1. Signal equations (one per block)')}</p>
          <div className="space-y-0.5 text-[12px] text-plant-100">
            {lin?.eqs.map((e, i) => (
              <Tex key={i} block math={e} />
            ))}
          </div>
          <p className="tag pt-1 text-plant-500">{t('2. Solved for the output (other sources = 0)')}</p>
          {T && (
            <div className="text-[13px] text-plant-100">
              <Tex block math={`G_{${src.data.name.replace(/\W/g, '')}\\to ${out.data.name.replace(/\W/g, '')}}(s) = \\frac{Y_{${out.data.name.replace(/\W/g, '')}}(s)}{U(s)} = ${tfTex(T)}`} />
            </div>
          )}
          {T && (
            <p className="font-mono text-[10px] text-plant-400">
              {t('poles')}: {poles.length ? poles.map((p) => cTex(p).replace(/\\,/g, ' ')).join(', ') : '–'}
            </p>
          )}
        </div>
        {T && (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <Kpi label={t('Stability')} value={stable ? t('stable') : t('unstable')} small />
              <Kpi label={t('Gain at s = 0')} value={T.den[0] ? nf(T.num[0]! / T.den[0]!, 4) : '∞'} small />
              <Kpi label={t('Order')} value={String(T.den.length - 1)} small />
            </div>
            {sr && sr.t.length > 0 && (
              <LineChartBox series={[{ name: t('step response of G(s)'), data: sr.t.map((tt, i) => ({ x: tt, y: sr.y[i]! })) }]} xLabel="t [s]" yLabel="" height={150} digits={2} />
            )}
            {bd.length > 0 && (
              <>
                <LineChartBox series={[{ name: '|G| [dB]', data: bd.map((p) => ({ x: p.w, y: p.db })) }]} xLabel="ω [1/s]" yLabel="dB" logX height={130} digits={0} />
                <LineChartBox series={[{ name: 'φ [°]', data: bd.map((p) => ({ x: p.w, y: p.deg })), color: 'rgb(var(--sig-vapor))' }]} xLabel="ω [1/s]" yLabel="°" logX height={130} digits={0} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Results() {
  const [tab, setTab] = useState<'scope' | 'tf'>('scope');
  const { r } = useSimulation();
  const settings = useControlSim((s) => s.settings);
  const setSettings = useControlSim((s) => s.setSettings);
  return (
    <section className="glass flex h-[48%] min-h-[260px] shrink-0 flex-col overflow-hidden">
      <div role="tablist" className="flex flex-wrap items-center gap-1 border-b border-white/[0.05] px-2 py-1.5">
        {(
          [
            ['scope', 'Scope'],
            ['tf', 'Transfer function'],
          ] as const
        ).map(([id, l]) => (
          <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)} className={cn('rounded px-2.5 py-1 text-[11px] transition-colors', tab === id ? 'bg-signal-vapor/15 text-signal-vapor' : 'text-plant-300 hover:bg-white/[0.04]')}>
            {t(l)}
          </button>
        ))}
        <label className="ml-4 flex items-center gap-1 text-[11px] text-plant-300">
          {t('Simulation time')}
          <Num ariaLabel={t('Simulation time')} className="w-16" value={settings.tEnd} onChange={(v) => setSettings({ tEnd: Math.max(0.01, v) })} />s
        </label>
        <label className="flex items-center gap-1 text-[11px] text-plant-300">
          {t('steps')}
          <Num ariaLabel={t('steps')} className="w-16" value={settings.steps} onChange={(v) => setSettings({ steps: v })} />
        </label>
        <span className="ml-auto pr-2 font-mono text-[10px]">
          {r.ok ? <span className="text-signal-ok">{t('simulated')} · Δt = {nf(settings.tEnd / Math.max(100, settings.steps), 3)} s</span> : <span className="text-signal-alarm">{t('not simulated')}</span>}
        </span>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {r.warnings.map((w, i) => (
          <Notice key={i} tone={/unstable|improper/.test(w.key) ? 'error' : 'warning'}>
            {t(w.key, w.vars)}
          </Notice>
        ))}
        {tab === 'scope' ? <ScopeTab /> : <TFTab />}
      </div>
    </section>
  );
}

export default function SimulatorPage() {
  return (
    <div className="flex h-full min-h-0 gap-2">
      <Palette />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <SimCanvas />
        <Results />
      </div>
      <Inspector />
    </div>
  );
}
