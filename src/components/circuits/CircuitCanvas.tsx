/** Circuit symbols (IEC style), component node and canvas. */

import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  Handle,
  Position,
  ReactFlow,
  SmoothStepEdge,
  useReactFlow,
  type EdgeProps,
  type NodeProps,
} from '@xyflow/react';
import { useCallback, type DragEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { CKind, CParams } from '@/engine/circuits/solver';
import { formatSI } from '@/engine/circuits/units';
import { t, useLang } from '@/i18n';
import { cn } from '@/lib/utils';
import { useCircuit, useCircuitSolution, type CNode, type Rot } from '@/store/circuitStore';

export const CIRCUIT_DND = 'application/x-circuit-part';

const LED_COLOR: Record<NonNullable<CParams['color']>, string> = {
  red: '#ef4444',
  green: '#22c55e',
  blue: '#3b82f6',
  yellow: '#facc15',
  white: '#f8fafc',
};

/** Symbol in a 96×40 box, terminals at (0,20) = pin a and (96,20) = pin b. */
export function Symbol({ kind, params, level = 0, rot = 0 }: { kind: CKind; params?: CParams; level?: number; rot?: number }) {
  const lead = (x1: number, x2: number) => <path d={`M${x1} 20H${x2}`} />;
  const glow = Math.max(0, Math.min(1, level));
  switch (kind) {
    case 'resistor':
      return (
        <>
          {lead(0, 24)}
          <rect x="24" y="12" width="48" height="16" rx="1" />
          {lead(72, 96)}
        </>
      );
    case 'vsource':
      return (
        <>
          {lead(0, 34)}
          <circle cx="48" cy="20" r="14" />
          <path d="M34 20H62" />
          {lead(62, 96)}
          <text x="26" y="10" className="fill-current stroke-none text-[10px]">+</text>
          <text x="66" y="10" className="fill-current stroke-none text-[10px]">−</text>
        </>
      );
    case 'isource':
      return (
        <>
          {lead(0, 34)}
          <circle cx="48" cy="20" r="14" />
          <path d="M48 6V34" />
          {lead(62, 96)}
          <path d="M40 20H22m5-4-5 4 5 4" />
        </>
      );
    case 'diode':
    case 'led': {
      const c = kind === 'led' ? LED_COLOR[params?.color ?? 'red'] : undefined;
      return (
        <>
          {lead(0, 36)}
          <path d="M36 8L60 20 36 32z" style={c ? { fill: c, fillOpacity: 0.12 + 0.8 * glow } : undefined} />
          <path d="M60 8V32" />
          {lead(60, 96)}
          {kind === 'led' && (
            <g style={{ stroke: c }}>
              <path d="M52 6l8-6m-4 0h4v4M60 10l8-6m-4 0h4v4" />
            </g>
          )}
        </>
      );
    }
    case 'lamp':
      return (
        <>
          {lead(0, 34)}
          <circle cx="48" cy="20" r="14" style={{ fill: '#facc15', fillOpacity: 0.85 * glow }} />
          <path d="M38 10l20 20M58 10L38 30" />
          {lead(62, 96)}
        </>
      );
    case 'switch':
      return (
        <>
          {lead(0, 30)}
          <circle cx="32" cy="20" r="2" />
          {params?.closed ? <path d="M32 20L64 18" /> : <path d="M32 20L60 4" />}
          <circle cx="64" cy="20" r="2" />
          {lead(66, 96)}
        </>
      );
    case 'capacitor':
      return (
        <>
          {lead(0, 44)}
          <path d="M44 6V34M52 6V34" />
          {lead(52, 96)}
        </>
      );
    case 'inductor':
      return (
        <>
          {lead(0, 24)}
          <rect x="24" y="13" width="48" height="14" className="fill-current" />
          {lead(72, 96)}
        </>
      );
    case 'ammeter':
    case 'voltmeter':
      return (
        <>
          {lead(0, 34)}
          <circle cx="48" cy="20" r="14" />
          <text x="48" y="25" textAnchor="middle" transform={`rotate(${-rot} 48 20)`} className="fill-current stroke-none text-[14px] font-semibold">
            {kind === 'ammeter' ? 'A' : 'V'}
          </text>
          {lead(62, 96)}
        </>
      );
    case 'ground':
      return (
        <>
          <path d="M48 0V20M32 20H64M38 27H58M44 34H52" />
        </>
      );
  }
}

const POS: Record<Rot, [Position, Position]> = {
  0: [Position.Left, Position.Right],
  90: [Position.Top, Position.Bottom],
  180: [Position.Right, Position.Left],
  270: [Position.Bottom, Position.Top],
};

export function valueLabel(kind: CKind, p: CParams): string {
  const comma = useLang.getState().lang !== 'en';
  switch (kind) {
    case 'resistor':
      return formatSI(p.R ?? 0, 'Ω', 3, comma);
    case 'vsource':
      return formatSI(p.V ?? 0, 'V', 3, comma);
    case 'isource':
      return formatSI(p.I ?? 0, 'A', 3, comma);
    case 'led':
      return `${formatSI(p.Vf ?? 2, 'V', 3, comma)} · ${formatSI(p.Inom ?? 0.02, 'A', 3, comma)}`;
    case 'lamp':
      return `${formatSI(p.Vnom ?? 12, 'V', 3, comma)} / ${formatSI(p.Pnom ?? 5, 'W', 3, comma)}`;
    case 'capacitor':
      return formatSI(p.C ?? 0, 'F', 3, comma);
    case 'inductor':
      return formatSI(p.L ?? 0, 'H', 3, comma);
    case 'switch':
      return t(p.closed ? 'closed' : 'open');
    default:
      return '';
  }
}

function CompNode({ id, data, selected }: NodeProps<CNode>) {
  const { result } = useCircuitSolution();
  const toggle = useCircuit((s) => s.setParam);
  const r = result.comps.get(id);
  const comma = useLang.getState().lang !== 'en';
  const vertical = data.rot === 90 || data.rot === 270;
  const isGround = data.kind === 'ground';
  const [pa, pb] = POS[data.rot];
  const w = isGround ? 60 : vertical ? 40 : 96;
  const h = isGround ? 40 : vertical ? 96 : 40;
  const reading =
    r && result.ok && !isGround
      ? data.kind === 'voltmeter'
        ? formatSI(r.V, 'V', 4, comma)
        : data.kind === 'ammeter'
          ? formatSI(r.I, 'A', 4, comma)
          : `${formatSI(Math.abs(r.I), 'A', 3, comma)} · ${formatSI(Math.abs(r.V), 'V', 3, comma)}`
      : '';
  return (
    <div className={cn('relative rounded-md', selected && 'ring-1 ring-signal-liquid/60')} style={{ width: w, height: h }} onDoubleClick={() => data.kind === 'switch' && toggle(id, 'closed', !data.params.closed)}>
      <svg
        viewBox={isGround ? '18 0 60 40' : '0 0 96 40'}
        className={cn('absolute left-1/2 top-1/2 fill-none stroke-[1.6] text-plant-200', r?.warn ? 'stroke-signal-alarm' : 'stroke-plant-200')}
        style={{ width: isGround ? 60 : 96, height: 40, transform: `translate(-50%,-50%) rotate(${isGround ? 0 : data.rot}deg)` }}
        aria-hidden
      >
        <Symbol kind={data.kind} params={data.params} level={r?.level} rot={data.rot} />
      </svg>
      {isGround ? (
        <Handle type="source" position={Position.Top} id="a" />
      ) : (
        <>
          <Handle type="source" position={pa} id="a" />
          <Handle type="source" position={pb} id="b" />
        </>
      )}
      {!isGround && (
        <div className={cn('pointer-events-none absolute whitespace-nowrap font-mono text-[9px] leading-[12px]', vertical ? 'left-full top-1/2 ml-2 -translate-y-1/2' : 'left-1/2 top-full -translate-x-1/2 text-center')}>
          <div className="font-semibold text-plant-100">
            {data.name} <span className="font-normal text-plant-400">{valueLabel(data.kind, data.params)}</span>
          </div>
          {reading && <div className={r?.warn ? 'text-signal-alarm' : 'text-signal-vapor'}>{reading}</div>}
        </div>
      )}
    </div>
  );
}

function WireEdge(props: EdgeProps) {
  return <SmoothStepEdge {...props} pathOptions={{ borderRadius: 2, offset: 12 }} style={{ stroke: props.selected ? 'rgb(var(--sig-liquid))' : 'rgb(var(--plant-300))', strokeWidth: 1.6 }} />;
}

const nodeTypes = { ccomp: CompNode };
const edgeTypes = { wire: WireEdge };
const KINDS: readonly string[] = ['resistor', 'vsource', 'isource', 'diode', 'led', 'lamp', 'switch', 'capacitor', 'inductor', 'ammeter', 'voltmeter', 'ground'];

export function CircuitCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addComponent } = useCircuit(
    useShallow((s) => ({ nodes: s.nodes, edges: s.edges, onNodesChange: s.onNodesChange, onEdgesChange: s.onEdgesChange, onConnect: s.onConnect, addComponent: s.addComponent })),
  );
  const { screenToFlowPosition } = useReactFlow();
  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);
  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const kind = e.dataTransfer.getData(CIRCUIT_DND);
      if (!KINDS.includes(kind)) return;
      addComponent(kind as CKind, screenToFlowPosition({ x: e.clientX - 48, y: e.clientY - 20 }));
    },
    [addComponent, screenToFlowPosition],
  );
  return (
    <div className="glass relative min-h-0 flex-1 overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        connectionMode={ConnectionMode.Loose}
        onDrop={onDrop}
        onDragOver={onDragOver}
        defaultEdgeOptions={{ type: 'wire' }}
        connectionLineStyle={{ stroke: 'rgb(var(--sig-vapor))', strokeWidth: 1.5 }}
        deleteKeyCode={['Backspace', 'Delete']}
        snapToGrid
        snapGrid={[10, 10]}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.3}
        maxZoom={3}
        proOptions={{ hideAttribution: true }}
      >
        <Background id="dots" variant={BackgroundVariant.Dots} gap={20} size={1.2} color="rgba(148,163,184,0.18)" />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
      <div className="pointer-events-none absolute left-3 top-3 font-mono text-[9px] tracking-[0.2em] text-plant-500">{t('CIRCUIT · DC OPERATING POINT')}</div>
    </div>
  );
}
