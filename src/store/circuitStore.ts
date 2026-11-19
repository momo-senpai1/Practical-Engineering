/** Circuit editor state (React Flow nodes = components, edges = wires), persisted. */

import { addEdge, applyEdgeChanges, applyNodeChanges, type Connection, type Edge, type EdgeChange, type Node, type NodeChange } from '@xyflow/react';
import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { solveCircuit, type CCircuit, type CircuitResult, type CKind, type CParams } from '@/engine/circuits/solver';

export type Rot = 0 | 90 | 180 | 270;
export type CNodeData = { kind: CKind; name: string; params: CParams; rot: Rot };
export type CNode = Node<CNodeData, 'ccomp'>;
export type CEdge = Edge<Record<string, never>, 'wire'>;

export const DEFAULTS: Record<CKind, CParams> = {
  resistor: { R: 1000 },
  vsource: { V: 12 },
  isource: { I: 0.01 },
  diode: { Is: 2.52e-9, n: 1.752 },
  led: { Vf: 2, Inom: 0.02, color: 'red' },
  lamp: { Vnom: 12, Pnom: 5 },
  switch: { closed: true },
  capacitor: { C: 1e-6 },
  inductor: { L: 1e-3 },
  ammeter: {},
  voltmeter: {},
  ground: {},
};
const PREFIX: Record<CKind, string> = {
  resistor: 'R',
  vsource: 'U',
  isource: 'I',
  diode: 'D',
  led: 'LED',
  lamp: 'H',
  switch: 'S',
  capacitor: 'C',
  inductor: 'L',
  ammeter: 'A',
  voltmeter: 'V',
  ground: 'GND',
};

interface CircuitState {
  nodes: CNode[];
  edges: CEdge[];
  onNodesChange: (c: NodeChange<CNode>[]) => void;
  onEdgesChange: (c: EdgeChange<CEdge>[]) => void;
  onConnect: (c: Connection) => void;
  addComponent: (kind: CKind, position: { x: number; y: number }) => void;
  update: (id: string, patch: Partial<CNodeData>) => void;
  setParam: (id: string, key: keyof CParams, value: CParams[keyof CParams]) => void;
  rotate: (id: string) => void;
  remove: (id: string) => void;
  load: (name: ExampleId) => void;
  clear: () => void;
}

const safe: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

let seq = 0;
const uid = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;
const nextName = (nodes: CNode[], kind: CKind) => {
  const taken = new Set(nodes.map((n) => n.data.name));
  for (let i = 1; ; i++) if (!taken.has(`${PREFIX[kind]}${i}`)) return `${PREFIX[kind]}${i}`;
};

type Ex = { comps: [string, CKind, CParams, number, number, Rot?][]; wires: [string, string][] };
export type ExampleId = 'divider' | 'led' | 'bridge' | 'lamps' | 'diodes';
export const EXAMPLES: Record<ExampleId, { label: string; ex: Ex }> = {
  divider: {
    label: 'Voltage divider',
    ex: {
      comps: [
        ['U1', 'vsource', { V: 12 }, 0, 120, 90],
        ['R1', 'resistor', { R: 1000 }, 160, 20],
        ['R2', 'resistor', { R: 2000 }, 330, 120, 90],
        ['V1', 'voltmeter', {}, 470, 120, 90],
        ['GND', 'ground', {}, 30, 280],
      ],
      wires: [['U1:a', 'R1:a'], ['R1:b', 'R2:a'], ['R2:a', 'V1:a'], ['R2:b', 'U1:b'], ['V1:b', 'R2:b'], ['U1:b', 'GND:a']],
    },
  },
  led: {
    label: 'LED with series resistor',
    ex: {
      comps: [
        ['U1', 'vsource', { V: 9 }, 0, 120, 90],
        ['S1', 'switch', { closed: true }, 140, 20],
        ['R1', 'resistor', { R: 330 }, 300, 20],
        ['LED1', 'led', { Vf: 2, Inom: 0.02, color: 'red' }, 460, 120, 90],
        ['A1', 'ammeter', {}, 300, 220, 180],
        ['GND', 'ground', {}, 30, 300],
      ],
      wires: [['U1:a', 'S1:a'], ['S1:b', 'R1:a'], ['R1:b', 'LED1:a'], ['LED1:b', 'A1:a'], ['A1:b', 'U1:b'], ['U1:b', 'GND:a']],
    },
  },
  bridge: {
    label: 'Wheatstone bridge',
    ex: {
      comps: [
        ['U1', 'vsource', { V: 10 }, 0, 160, 90],
        ['R1', 'resistor', { R: 100 }, 170, 60],
        ['R2', 'resistor', { R: 200 }, 380, 60],
        ['R3', 'resistor', { R: 150 }, 170, 260],
        ['R4', 'resistor', { R: 330 }, 380, 260],
        ['A1', 'ammeter', {}, 290, 160, 90],
        ['GND', 'ground', {}, 30, 360],
      ],
      wires: [['U1:a', 'R1:a'], ['U1:a', 'R3:a'], ['R1:b', 'R2:a'], ['R3:b', 'R4:a'], ['R2:b', 'R4:b'], ['R4:b', 'U1:b'], ['R1:b', 'A1:a'], ['A1:b', 'R3:b'], ['U1:b', 'GND:a']],
    },
  },
  lamps: {
    label: 'Lamps in parallel with switches',
    ex: {
      comps: [
        ['U1', 'vsource', { V: 12 }, 0, 150, 90],
        ['S1', 'switch', { closed: true }, 160, 40],
        ['S2', 'switch', { closed: false }, 160, 200],
        ['H1', 'lamp', { Vnom: 12, Pnom: 5 }, 340, 40],
        ['H2', 'lamp', { Vnom: 12, Pnom: 10 }, 340, 200],
        ['GND', 'ground', {}, 30, 320],
      ],
      wires: [['U1:a', 'S1:a'], ['U1:a', 'S2:a'], ['S1:b', 'H1:a'], ['S2:b', 'H2:a'], ['H1:b', 'H2:b'], ['H2:b', 'U1:b'], ['U1:b', 'GND:a']],
    },
  },
  diodes: {
    label: 'Diode logic (OR gate)',
    ex: {
      comps: [
        ['U1', 'vsource', { V: 5 }, 0, 40, 90],
        ['U2', 'vsource', { V: 0 }, 0, 230, 90],
        ['D1', 'diode', { Is: 2.52e-9, n: 1.752 }, 160, 20],
        ['D2', 'diode', { Is: 2.52e-9, n: 1.752 }, 160, 210],
        ['R1', 'resistor', { R: 10000 }, 360, 120, 90],
        ['GND', 'ground', {}, 200, 360],
      ],
      wires: [['U1:a', 'D1:a'], ['U2:a', 'D2:a'], ['D1:b', 'R1:a'], ['D2:b', 'R1:a'], ['R1:b', 'GND:a'], ['U1:b', 'GND:a'], ['U2:b', 'GND:a']],
    },
  },
};

function build(id: ExampleId): Pick<CircuitState, 'nodes' | 'edges'> {
  const { ex } = EXAMPLES[id];
  const ids = new Map(ex.comps.map(([name]) => [name, uid('c')]));
  return {
    nodes: ex.comps.map(([name, kind, params, x, y, rot]) => ({
      id: ids.get(name)!,
      type: 'ccomp',
      position: { x, y },
      data: { kind, name, params: { ...DEFAULTS[kind], ...params }, rot: rot ?? 0 },
    })),
    edges: ex.wires.map(([a, b], i) => {
      const [na, pa] = a.split(':') as [string, string];
      const [nb, pb] = b.split(':') as [string, string];
      return { id: `w${i}${uid('')}`, type: 'wire', source: ids.get(na)!, sourceHandle: pa, target: ids.get(nb)!, targetHandle: pb };
    }),
  };
}

export const useCircuit = create<CircuitState>()(
  persist(
    (set, get) => ({
      ...build('led'),
      onNodesChange: (c) => set({ nodes: applyNodeChanges(c, get().nodes) }),
      onEdgesChange: (c) => set({ edges: applyEdgeChanges(c, get().edges) }),
      onConnect: (c) => {
        if (!c.source || !c.target || (c.source === c.target && c.sourceHandle === c.targetHandle)) return;
        set({ edges: addEdge({ ...c, id: uid('w'), type: 'wire' }, get().edges) as CEdge[] });
      },
      addComponent: (kind, position) => {
        const node: CNode = {
          id: uid('c'),
          type: 'ccomp',
          position,
          data: { kind, name: nextName(get().nodes, kind), params: { ...DEFAULTS[kind] }, rot: 0 },
          selected: true,
        };
        set({ nodes: [...get().nodes.map((n) => ({ ...n, selected: false })), node] });
      },
      update: (id, patch) => set({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)) }),
      setParam: (id, key, value) => set({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, params: { ...n.data.params, [key]: value } } } : n)) }),
      rotate: (id) => set({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, rot: (((n.data.rot + 90) % 360) as Rot) } } : n)) }),
      remove: (id) => set({ nodes: get().nodes.filter((n) => n.id !== id), edges: get().edges.filter((e) => e.source !== id && e.target !== id) }),
      load: (id) => set(build(id)),
      clear: () => set({ nodes: [], edges: [] }),
    }),
    {
      name: 'ts-circuit',
      version: 1,
      storage: createJSONStorage(() => safe),
      partialize: (s) => ({
        nodes: s.nodes.map(({ id, type, position, data }) => ({ id, type, position, data })),
        edges: s.edges.map(({ id, type, source, sourceHandle, target, targetHandle }) => ({ id, type, source, sourceHandle, target, targetHandle })),
      }),
    },
  ),
);

export function toCircuit(nodes: CNode[], edges: CEdge[]): CCircuit {
  return {
    components: nodes.map((n) => ({ id: n.id, kind: n.data.kind, name: n.data.name, params: n.data.params })),
    wires: edges.map((e) => ({ id: e.id, a: `${e.source}:${e.sourceHandle ?? 'a'}`, b: `${e.target}:${e.targetHandle ?? 'a'}` })),
  };
}

let memo: { key: string; r: { circuit: CCircuit; result: CircuitResult } } | null = null;
export function useCircuitSolution() {
  const nodes = useCircuit((s) => s.nodes);
  const edges = useCircuit((s) => s.edges);
  return useMemo(() => {
    const circuit = toCircuit(nodes, edges);
    const key = JSON.stringify(circuit);
    if (memo?.key === key) return memo.r;
    const r = { circuit, result: solveCircuit(circuit) };
    memo = { key, r };
    return r;
  }, [nodes, edges]);
}
