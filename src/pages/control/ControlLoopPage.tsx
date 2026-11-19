import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { Tex } from '@/components/balance/Tex';
import { LineChartBox } from '@/components/heat/charts';
import { Card, fieldCls, newId, nf, Num, safeStorage } from '@/components/mechanics/common';
import { Kpi, Notice } from '@/components/workbench/controls';
import { BLOCK_INFO, blockTF, reduceLoop, type BlockKind, type BlockSpec, type LoopBlock, type LoopSpec } from '@/engine/control/loop';
import { bode, cTex, freq, margins, normalize, roots, routh, stepInfo, stepResponse, tfTex, type C } from '@/engine/control/poly';
import { t } from '@/i18n';
import { cn } from '@/lib/utils';

const EXAMPLES: Record<string, { label: string; loop: LoopSpec }> = {
  pipt1: {
    label: 'PI controller + PT1 plant',
    loop: { sign: -1, feedback: [], forward: [{ id: 'c', name: 'R', spec: { kind: 'PI', K: 2, Ti: 2 } }, { id: 'g', name: 'G', spec: { kind: 'PT1', K: 1, T: 2 } }] },
  },
  pidpt3: {
    label: 'PID controller + PT3 plant',
    loop: { sign: -1, feedback: [], forward: [{ id: 'c', name: 'R', spec: { kind: 'PID', K: 3, Ti: 2.5, Td: 0.6 } }, { id: 'g', name: 'G', spec: { kind: 'PTn', K: 1, T: 1, n: 3 } }] },
  },
  pit1: {
    label: 'P controller + IT1 plant (motor position)',
    loop: { sign: -1, feedback: [], forward: [{ id: 'c', name: 'R', spec: { kind: 'P', K: 2 } }, { id: 'g', name: 'G', spec: { kind: 'IT1', K: 1, T: 0.5 } }] },
  },
  deadtime: {
    label: 'PI + PT1 with dead time',
    loop: { sign: -1, feedback: [], forward: [{ id: 'c', name: 'R', spec: { kind: 'PI', K: 0.8, Ti: 3 } }, { id: 'g', name: 'G', spec: { kind: 'PTt', K: 1, T: 3, Tt: 1 } }] },
  },
  sensor: {
    label: 'Loop with sensor lag in the feedback path',
    loop: { sign: -1, feedback: [{ id: 'h', name: 'H', spec: { kind: 'PT1', K: 1, T: 0.2 } }], forward: [{ id: 'c', name: 'R', spec: { kind: 'PI', K: 1.5, Ti: 1.5 } }, { id: 'g', name: 'G', spec: { kind: 'PT2', K: 1, T: 1, zeta: 0.7 } }] },
  },
  cascade: {
    label: 'Inner loop (local feedback) and parallel feed-forward',
    loop: {
      sign: -1,
      feedback: [],
      forward: [
        { id: 'c', name: 'R', spec: { kind: 'P', K: 4 }, parallel: { kind: 'D', K: 0.5, T: 0.05 } },
        { id: 'g', name: 'G', spec: { kind: 'I', K: 1 }, local: { spec: { kind: 'P', K: 0.5 }, sign: -1 } },
        { id: 'g2', name: 'G2', spec: { kind: 'PT1', K: 1, T: 0.5 } },
      ],
    },
  },
};

const useLoop = create<{ loop: LoopSpec; set: (l: LoopSpec) => void }>()(
  persist((set) => ({ loop: EXAMPLES.pidpt3!.loop, set: (loop) => set({ loop }) }), { name: 'ts-control-loop', version: 1, storage: createJSONStorage(() => safeStorage), partialize: (s) => ({ loop: s.loop }) }),
);

const PARAM_LABEL: Record<string, string> = { K: 'K', T: 'T [s]', Ti: 'T_i [s]', Td: 'T_d [s]', zeta: 'D (ζ)', n: 'n', alpha: 'α', Tt: 'T_t [s]' };

function SpecEditor({ spec, onChange, kinds }: { spec: BlockSpec; onChange: (s: BlockSpec) => void; kinds: BlockKind[] }) {
  const info = BLOCK_INFO[spec.kind];
  const [numText, setNumText] = useState((spec.num ?? [1]).slice().reverse().join(' '));
  const [denText, setDenText] = useState((spec.den ?? [1, 1]).slice().reverse().join(' '));
  const parse = (s: string) =>
    s
      .trim()
      .split(/[\s;]+/)
      .map((x) => Number(x.replace(',', '.')))
      .filter((x) => Number.isFinite(x))
      .reverse();
  return (
    <div className="space-y-1.5">
      <select aria-label={t('Block type')} className={fieldCls} value={spec.kind} onChange={(e) => onChange({ ...defaultsFor(e.target.value as BlockKind) })}>
        {kinds.map((k) => (
          <option key={k} value={k}>
            {t(BLOCK_INFO[k].label)}
          </option>
        ))}
      </select>
      <div className="text-[12px] text-plant-200">
        <Tex math={info.tex} />
      </div>
      {spec.kind === 'custom' ? (
        <div className="space-y-1 text-[10px] text-plant-400">
          <label className="block">
            {t('Numerator (highest power first)')}
            <input className={fieldCls} value={numText} onChange={(e) => (setNumText(e.target.value), onChange({ ...spec, num: parse(e.target.value) }))} />
          </label>
          <label className="block">
            {t('Denominator (highest power first)')}
            <input className={fieldCls} value={denText} onChange={(e) => (setDenText(e.target.value), onChange({ ...spec, den: parse(e.target.value) }))} />
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1">
          {info.params.map((p) => (
            <label key={p} className="text-[9px] uppercase tracking-wider text-plant-500">
              {PARAM_LABEL[p] ?? p}
              <Num ariaLabel={p} value={(spec[p] as number) ?? 0} onChange={(v) => onChange({ ...spec, [p]: v })} />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const ALL: BlockKind[] = ['P', 'I', 'PI', 'PD', 'PID', 'lead', 'PT1', 'PT2', 'PTn', 'IT1', 'PTt', 'D', 'custom'];
function defaultsFor(kind: BlockKind): BlockSpec {
  const d: Record<BlockKind, BlockSpec> = {
    P: { kind, K: 1 },
    I: { kind, K: 1 },
    PI: { kind, K: 1, Ti: 1 },
    PD: { kind, K: 1, Td: 0.2 },
    PID: { kind, K: 1, Ti: 1, Td: 0.2 },
    lead: { kind, K: 1, T: 1, alpha: 0.1 },
    PT1: { kind, K: 1, T: 1 },
    PT2: { kind, K: 1, T: 1, zeta: 0.5 },
    PTn: { kind, K: 1, T: 1, n: 3 },
    IT1: { kind, K: 1, T: 1 },
    PTt: { kind, K: 1, T: 1, Tt: 0.5 },
    D: { kind, K: 1, T: 0.1 },
    custom: { kind, num: [1], den: [1, 1] },
  };
  return d[kind];
}

function BlockCard({ b, onChange, onRemove }: { b: LoopBlock; onChange: (b: LoopBlock) => void; onRemove: () => void }) {
  return (
    <div className="space-y-1.5 rounded-md border border-white/[0.06] p-2">
      <div className="flex items-center gap-1">
        <input aria-label={t('Name')} className={cn(fieldCls, 'w-20 font-sans')} value={b.name} onChange={(e) => onChange({ ...b, name: e.target.value })} />
        <span className="flex-1" />
        <button type="button" aria-label={t('Delete')} onClick={onRemove} className="grid h-6 w-6 place-items-center rounded text-plant-500 hover:text-signal-alarm">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <SpecEditor spec={b.spec} kinds={ALL} onChange={(spec) => onChange({ ...b, spec })} />
      <label className="flex items-center gap-1.5 text-[10px] text-plant-400">
        <input type="checkbox" checked={!!b.parallel} onChange={(e) => onChange({ ...b, parallel: e.target.checked ? { kind: 'P', K: 1 } : null })} />
        {t('Parallel branch (outputs added)')}
      </label>
      {b.parallel && (
        <div className="ml-3 border-l border-white/[0.06] pl-2">
          <SpecEditor spec={b.parallel} kinds={ALL} onChange={(parallel) => onChange({ ...b, parallel })} />
        </div>
      )}
      <label className="flex items-center gap-1.5 text-[10px] text-plant-400">
        <input type="checkbox" checked={!!b.local} onChange={(e) => onChange({ ...b, local: e.target.checked ? { spec: { kind: 'P', K: 1 }, sign: -1 } : null })} />
        {t('Local feedback around this block')}
      </label>
      {b.local && (
        <div className="ml-3 space-y-1 border-l border-white/[0.06] pl-2">
          <SpecEditor spec={b.local.spec} kinds={ALL} onChange={(spec) => onChange({ ...b, local: { ...b.local!, spec } })} />
          <select className={fieldCls} value={b.local.sign} onChange={(e) => onChange({ ...b, local: { ...b.local!, sign: Number(e.target.value) as 1 | -1 } })}>
            <option value={-1}>{t('negative feedback')}</option>
            <option value={1}>{t('positive feedback')}</option>
          </select>
        </div>
      )}
    </div>
  );
}

export default function ControlLoopPage() {
  const { loop, set } = useLoop();
  const r = useMemo(() => reduceLoop(loop), [loop]);
  const T = normalize(r.T);
  const L = r.L;
  const hasDelay = [...loop.forward, ...loop.feedback].some((b) => b.spec.kind === 'PTt' || b.parallel?.kind === 'PTt' || b.local?.spec.kind === 'PTt');
  const polesT = useMemo(() => roots(T.den), [T]);
  const zerosT = useMemo(() => roots(T.num), [T]);
  const stable = polesT.every((p) => p.re < -1e-9);
  const T0 = freq(T, 1e-9).mag * Math.sign(freq(T, 1e-9).re || 1);
  const slowest = Math.max(1e-3, ...polesT.filter((p) => p.re < 0).map((p) => 1 / Math.max(-p.re, 1e-6)));
  const tEnd = Math.min(1e4, Math.max(5, 8 * slowest + (T.delay ?? 0) * 3));
  const step = useMemo(() => stepResponse(r.T, tEnd, 1200), [r.T, tEnd]);
  const info = stable ? stepInfo(step.t, step.y, T0) : null;
  const mg = useMemo(() => margins(L), [L]);
  const allW = [...roots(L.den), ...roots(L.num)].map((p) => Math.hypot(p.re, p.im)).filter((v) => v > 1e-9);
  const wMin = Math.max(1e-4, Math.min(1, ...allW) / 100);
  const wMax = Math.min(1e5, Math.max(1, ...allW) * 100);
  const bd = useMemo(() => bode(L, wMin, wMax, 400), [L, wMin, wMax]);
  const rt = useMemo(() => routh(T.den), [T]);
  const nyq = bd.filter((p) => Math.hypot(p.re, p.im) < 50).map((p) => ({ x: p.re, y: p.im }));
  const n = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '–' : nf(v, d));
  const upd = (path: 'forward' | 'feedback', i: number, b: LoopBlock | null) => {
    const arr = [...loop[path]];
    if (b) arr[i] = b;
    else arr.splice(i, 1);
    set({ ...loop, [path]: arr });
  };

  return (
    <div className="grid gap-2 xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="space-y-2 xl:sticky xl:top-0 xl:self-start">
        <Card title="Control loop">
          <select aria-label={t('Examples')} className={fieldCls} value="" onChange={(e) => e.target.value && set(EXAMPLES[e.target.value]!.loop)}>
            <option value="">{t('Load an example…')}</option>
            {Object.entries(EXAMPLES).map(([k, ex]) => (
              <option key={k} value={k}>
                {t(ex.label)}
              </option>
            ))}
          </select>
          <label className="mt-2 flex items-center gap-2 text-[11px] text-plant-300">
            {t('Main feedback')}
            <select className={fieldCls} value={loop.sign} onChange={(e) => set({ ...loop, sign: Number(e.target.value) as 1 | -1 })}>
              <option value={-1}>{t('negative')}</option>
              <option value={1}>{t('positive')}</option>
            </select>
          </label>
        </Card>
        <Card title="Forward path (controller, plant …)">
          <div className="space-y-2">
            {loop.forward.map((b, i) => (
              <BlockCard key={b.id} b={b} onChange={(nb) => upd('forward', i, nb)} onRemove={() => upd('forward', i, null)} />
            ))}
            <button type="button" onClick={() => set({ ...loop, forward: [...loop.forward, { id: newId('b'), name: `G${loop.forward.length + 1}`, spec: { kind: 'PT1', K: 1, T: 1 } }] })} className="flex items-center gap-1 text-[11px] text-signal-heat hover:underline">
              <Plus className="h-3 w-3" /> {t('Add block')}
            </button>
          </div>
        </Card>
        <Card title="Feedback path (sensor …)">
          <div className="space-y-2">
            {!loop.feedback.length && <p className="text-[10px] text-plant-500">{t('Empty = unity feedback (H = 1).')}</p>}
            {loop.feedback.map((b, i) => (
              <BlockCard key={b.id} b={b} onChange={(nb) => upd('feedback', i, nb)} onRemove={() => upd('feedback', i, null)} />
            ))}
            <button type="button" onClick={() => set({ ...loop, feedback: [...loop.feedback, { id: newId('h'), name: `H${loop.feedback.length + 1}`, spec: { kind: 'PT1', K: 1, T: 0.1 } }] })} className="flex items-center gap-1 text-[11px] text-signal-heat hover:underline">
              <Plus className="h-3 w-3" /> {t('Add block')}
            </button>
          </div>
        </Card>
      </aside>

      <div className="min-w-0 space-y-2">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 2xl:grid-cols-8">
          <Kpi label={t('Stability')} value={stable ? t('stable') : t('unstable')} sub={`${polesT.length} ${t('poles')}`} small tone={stable ? 'default' : 'muted'} />
          <Kpi label="T(0)" value={n(T0, 4)} sub={t('final value of the step')} />
          <Kpi label="e_∞" value={stable ? n(1 - T0, 4) : '–'} sub={t('steady-state error')} />
          <Kpi label={t('Overshoot')} value={info ? n(info.overshoot, 1) : '–'} unit={info ? '%' : undefined} />
          <Kpi label={t('Rise time')} value={info?.rise ? n(info.rise, 3) : '–'} unit="s" sub="10–90 %" />
          <Kpi label={t('Settling time')} value={info ? n(info.settling, 2) : '–'} unit="s" sub="± 2 %" />
          <Kpi label={t('Phase margin')} value={n(mg.pm, 1)} unit="°" sub={mg.wc ? `ω_c = ${n(mg.wc, 3)} 1/s` : ''} />
          <Kpi label={t('Gain margin')} value={n(mg.gm, 1)} unit="dB" sub={mg.w180 ? `ω₁₈₀ = ${n(mg.w180, 3)} 1/s` : ''} />
        </div>
        {!stable && <Notice tone="error">{t('The closed loop is unstable: at least one pole lies in the right half plane (or on the imaginary axis).')}</Notice>}
        {hasDelay && <Notice tone="info">{t('Dead time: exact in the Bode and Nyquist plots of L; the closed loop (step response, poles) uses a 3rd-order Padé approximation.')}</Notice>}
        <Card title="Block diagram">
          <LoopDiagram loop={loop} />
        </Card>
        <Card title="Block diagram reduction (solution path)">
          <ol className="space-y-1.5 text-[13px] text-plant-100">
            {r.steps.map((s, i) => (
              <li key={i} className="rounded border border-white/[0.04] px-2 py-1">
                <p className="text-[10px] text-plant-500">
                  {i + 1}. {stepTitle(s.title)}
                  {s.rule === 'parallel' || s.rule === 'feedback' || s.rule === 'series' ? ` · ${t({ parallel: 'rule: G₁ + G₂', feedback: 'rule: G / (1 ± G·H)', series: 'rule: G₁ · G₂' }[s.rule])}` : ''}
                </p>
                <Tex math={s.formula} block />
              </li>
            ))}
          </ol>
        </Card>
        <div className="grid gap-2 lg:grid-cols-2">
          <Card title="Step response">
            <LineChartBox
              series={[
                { name: t('output y(t)'), data: step.t.map((tt, i) => ({ x: tt, y: step.y[i]! })) },
                { name: t('reference w = 1'), data: [{ x: 0, y: 1 }, { x: tEnd, y: 1 }], dashed: true, color: 'rgb(var(--plant-400))' },
              ]}
              xLabel="t [s]"
              yLabel="y"
              digits={2}
            />
          </Card>
          <Card title="Bode diagram of the open loop L(jω)">
            <LineChartBox series={[{ name: '|L| [dB]', data: bd.map((p) => ({ x: p.w, y: p.db })) }]} xLabel="ω [1/s]" yLabel="dB" logX height={150} refX={mg.wc ? [{ x: mg.wc, label: 'ω_c' }] : undefined} digits={0} />
            <LineChartBox series={[{ name: 'φ [°]', data: bd.map((p) => ({ x: p.w, y: p.deg })), color: 'rgb(var(--sig-vapor))' }]} xLabel="ω [1/s]" yLabel="°" logX height={150} refX={mg.w180 ? [{ x: mg.w180, label: 'ω₁₈₀' }] : undefined} digits={0} />
          </Card>
          <Card title="Nyquist plot of L(jω)">
            <LineChartBox series={[{ name: 'L(jω)', data: nyq }, { name: t('critical point −1'), data: [{ x: -1, y: -0.05 }, { x: -1, y: 0.05 }], color: 'rgb(var(--sig-alarm))' }]} xLabel="Re" yLabel="Im" digits={2} />
          </Card>
          <Card title="Poles and zeros of the closed loop">
            <PZMap poles={polesT} zeros={zerosT} />
            <p className="mt-1 font-mono text-[10px] text-plant-400">
              {t('poles')}: {polesT.map((p) => `${nf(p.re, 3)}${p.im ? ` ${p.im > 0 ? '+' : '−'} ${nf(Math.abs(p.im), 3)}j` : ''}`).join(' · ')}
            </p>
          </Card>
        </div>
        <Card title="Routh–Hurwitz criterion">
          <div className="text-[13px] text-plant-100">
            <Tex block math={`\\text{${t('characteristic polynomial')}}:\\ ${tfTex({ num: T.den, den: [1] }).replace(/\\frac\{(.*)\}\{1\}/, '$1')} = 0`} />
          </div>
          <table className="mt-1 font-mono text-[11px]">
            <tbody>
              {rt.rows.map((row, i) => (
                <tr key={i}>
                  <td className="pr-3 text-plant-500">s^{rt.rows.length - 1 - i}</td>
                  {row.map((v, j) => (
                    <td key={j} className={cn('px-2 text-right', j === 0 ? (v < 0 ? 'text-signal-alarm' : 'text-signal-heat') : 'text-plant-300')}>
                      {nf(v, 4)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[10px] text-plant-500">
            {rt.changes === 0 ? t('No sign change in the first column: all roots in the left half plane.') : t('{n} sign changes in the first column = {n} roots in the right half plane.', { n: rt.changes })}
          </p>
        </Card>
        <Card title="Transfer functions">
          <div className="space-y-1 text-[13px] text-plant-100">
            {loop.forward.map((b) => (
              <Tex key={b.id} block math={`G_{${b.name}}(s) = ${tfTex(normalize(blockTF(b.spec)))}`} />
            ))}
            <Tex block math={`L(s) = ${tfTex(normalize(L))}`} />
            <Tex block math={`T(s) = ${tfTex(T)}`} />
            <p className="text-[10px] text-plant-500">
              {t('Closed-loop poles')}: {polesT.map((p) => cTex(p)).join(', ')}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

/** "R: parallel branch" → block name kept, rest translated. */
function stepTitle(s: string) {
  const m = /^(.*?): (.*)$/.exec(s);
  return m ? `${m[1]}: ${t(m[2]!)}` : t(s);
}

function PZMap({ poles, zeros }: { poles: C[]; zeros: C[] }) {
  const all = [...poles, ...zeros];
  const R = Math.max(1, ...all.map((p) => Math.max(Math.abs(p.re), Math.abs(p.im)))) * 1.2;
  const W = 400;
  const H = 260;
  const sx = (x: number) => W / 2 + (x / R) * (W / 2 - 20);
  const sy = (y: number) => H / 2 - (y / R) * (H / 2 - 20);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={t('Pole-zero map')}>
      <rect x={sx(0)} y={0} width={W - sx(0)} height={H} fill="rgb(var(--sig-alarm)/0.05)" />
      <line x1={0} y1={sy(0)} x2={W} y2={sy(0)} stroke="rgb(var(--plant-500))" />
      <line x1={sx(0)} y1={0} x2={sx(0)} y2={H} stroke="rgb(var(--plant-500))" />
      <text x={W - 6} y={sy(0) - 4} textAnchor="end" className="text-[10px]" style={{ fill: 'rgb(var(--plant-400))' }}>
        Re
      </text>
      <text x={sx(0) + 4} y={12} className="text-[10px]" style={{ fill: 'rgb(var(--plant-400))' }}>
        Im
      </text>
      <text x={W - 6} y={H - 6} textAnchor="end" className="text-[10px]" style={{ fill: 'rgb(var(--sig-alarm))' }}>
        {t('unstable')}
      </text>
      {zeros.map((z, i) => (
        <circle key={`z${i}`} cx={sx(z.re)} cy={sy(z.im)} r={5} fill="none" stroke="rgb(var(--sig-liquid))" strokeWidth={2} />
      ))}
      {poles.map((p, i) => (
        <path key={`p${i}`} d={`M${sx(p.re) - 5},${sy(p.im) - 5}l10,10m0,-10l-10,10`} stroke="rgb(var(--sig-vapor))" strokeWidth={2} />
      ))}
      <text x={6} y={H - 6} className="text-[10px]" style={{ fill: 'rgb(var(--plant-400))' }}>
        × {t('poles')} · ○ {t('zeros')} · {t('axis ±')}
        {nf(R, 2)}
      </text>
    </svg>
  );
}

function LoopDiagram({ loop }: { loop: LoopSpec }) {
  const bw = 120;
  const gap = 40;
  const x0 = 110;
  const y = 60;
  const items = loop.forward;
  const width = x0 + items.length * (bw + gap) + 120;
  const fbY = 170;
  const label = (s: BlockSpec) => BLOCK_INFO[s.kind].label.split(' (')[0] ?? '';
  return (
    <svg viewBox={`0 0 ${Math.max(width, 600)} 220`} className="mx-auto h-auto max-h-60 w-full" role="img" aria-label={t('Block diagram')}>
      <defs>
        <marker id="la" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="rgb(var(--plant-300))" />
        </marker>
      </defs>
      <g stroke="rgb(var(--plant-300))" fill="none" strokeWidth={1.4} className="text-[11px]">
        <text x={10} y={y + 4} style={{ fill: 'rgb(var(--plant-200))', stroke: 'none' }}>
          w
        </text>
        <line x1={24} y1={y} x2={62} y2={y} markerEnd="url(#la)" />
        <circle cx={74} cy={y} r={12} />
        <text x={74} y={y + 4} textAnchor="middle" style={{ fill: 'rgb(var(--plant-200))', stroke: 'none' }}>
          Σ
        </text>
        <text x={66} y={y + 28} style={{ fill: 'rgb(var(--plant-300))', stroke: 'none' }}>
          {loop.sign < 0 ? '−' : '+'}
        </text>
        <line x1={86} y1={y} x2={x0 - 2} y2={y} markerEnd="url(#la)" />
        <text x={92} y={y - 6} style={{ fill: 'rgb(var(--plant-400))', stroke: 'none' }}>
          e
        </text>
        {items.map((b, i) => {
          const x = x0 + i * (bw + gap);
          return (
            <g key={b.id}>
              <rect x={x} y={y - 22} width={bw} height={44} rx={4} fill="rgb(var(--plant-900))" />
              <text x={x + bw / 2} y={y - 4} textAnchor="middle" style={{ fill: 'rgb(var(--plant-100))', stroke: 'none' }}>
                {b.name}
              </text>
              <text x={x + bw / 2} y={y + 12} textAnchor="middle" style={{ fill: 'rgb(var(--plant-400))', stroke: 'none' }} className="text-[9px]">
                {t(label(b.spec))}
              </text>
              {b.parallel && (
                <>
                  <rect x={x + 10} y={y - 58} width={bw - 20} height={22} rx={3} fill="rgb(var(--plant-900))" strokeDasharray="3 2" />
                  <text x={x + bw / 2} y={y - 43} textAnchor="middle" style={{ fill: 'rgb(var(--plant-400))', stroke: 'none' }} className="text-[9px]">
                    ∥ {t(label(b.parallel))}
                  </text>
                </>
              )}
              {b.local && (
                <>
                  <path d={`M${x + bw - 10},${y + 22}V${y + 40}H${x + 10}V${y + 22}`} strokeDasharray="3 2" markerEnd="url(#la)" />
                  <text x={x + bw / 2} y={y + 52} textAnchor="middle" style={{ fill: 'rgb(var(--plant-400))', stroke: 'none' }} className="text-[9px]">
                    ↺ {t(label(b.local.spec))}
                  </text>
                </>
              )}
              <line x1={x + bw} y1={y} x2={x + bw + gap - 2} y2={y} markerEnd="url(#la)" />
            </g>
          );
        })}
        <text x={x0 + items.length * (bw + gap) + 6} y={y + 4} style={{ fill: 'rgb(var(--plant-200))', stroke: 'none' }}>
          y
        </text>
        {/* feedback path */}
        <path d={`M${x0 + items.length * (bw + gap) - gap / 2},${y}V${fbY}H${74}V${y + 12}`} markerEnd="url(#la)" />
        {loop.feedback.length > 0 && (
          <>
            <rect x={x0 + 40} y={fbY - 18} width={Math.max(120, loop.feedback.length * 90)} height={36} rx={4} fill="rgb(var(--plant-900))" />
            <text x={x0 + 40 + Math.max(120, loop.feedback.length * 90) / 2} y={fbY + 4} textAnchor="middle" style={{ fill: 'rgb(var(--plant-100))', stroke: 'none' }}>
              {loop.feedback.map((b) => b.name).join(' · ')}
            </text>
          </>
        )}
      </g>
    </svg>
  );
}
