/**
 * DC operating point of a circuit by modified nodal analysis (MNA).
 *
 * Unknowns: the potential of every net except ground, plus the current through
 * every element that fixes a voltage (voltage source, ammeter, inductor at DC).
 * Diodes and LEDs follow the Shockley equation and are linearised by
 * Newton–Raphson with junction-voltage limiting. Capacitors are open and
 * inductors short at DC.
 */

export type CKind =
  | 'resistor'
  | 'vsource'
  | 'isource'
  | 'diode'
  | 'led'
  | 'lamp'
  | 'switch'
  | 'capacitor'
  | 'inductor'
  | 'ammeter'
  | 'voltmeter'
  | 'ground';

export interface CParams {
  /** resistance [Ω] */
  R?: number;
  /** source voltage [V] (pin a = +) */
  V?: number;
  /** source current [A], flows out of pin a through the external circuit */
  I?: number;
  /** diode saturation current [A] and emission coefficient */
  Is?: number;
  n?: number;
  /** LED: forward voltage at nominal current */
  Vf?: number;
  Inom?: number;
  color?: 'red' | 'green' | 'blue' | 'yellow' | 'white';
  /** lamp: nominal voltage and power */
  Vnom?: number;
  Pnom?: number;
  /** resistor power rating [W] (optional) */
  Pmax?: number;
  closed?: boolean;
  C?: number;
  L?: number;
}

export interface CComponent {
  id: string;
  kind: CKind;
  name: string;
  params: CParams;
}

export interface CWire {
  id: string;
  a: string; // "<component>:<pin>"
  b: string;
}

export interface CCircuit {
  components: CComponent[];
  wires: CWire[];
}

export const PINS: Record<CKind, string[]> = {
  resistor: ['a', 'b'],
  vsource: ['a', 'b'],
  isource: ['a', 'b'],
  diode: ['a', 'b'],
  led: ['a', 'b'],
  lamp: ['a', 'b'],
  switch: ['a', 'b'],
  capacitor: ['a', 'b'],
  inductor: ['a', 'b'],
  ammeter: ['a', 'b'],
  voltmeter: ['a', 'b'],
  ground: ['a'],
};

export const VT = 0.025852; // thermal voltage at 300 K
const GMIN = 1e-12;
const R_ON = 1e-6;

export interface CompResult {
  id: string;
  /** voltage V(a) − V(b) */
  V: number;
  /** current entering pin a and leaving pin b through the element */
  I: number;
  /** power absorbed (negative = delivered) */
  P: number;
  /** lamp / LED: relative brightness 0…∞ (1 = nominal) */
  level?: number;
  warn?: 'overload' | 'reverse' | 'short';
}

export interface CircuitResult {
  ok: boolean;
  error?: 'empty' | 'singular' | 'noconverge';
  /** net id per pin key */
  netOf: Map<string, number>;
  nets: number;
  ground: number;
  groundAssumed: boolean;
  /** potential per net [V] */
  potentials: number[];
  comps: Map<string, CompResult>;
  floating: number[];
  iterations: number;
  /** Σ absorbed power — zero up to round-off */
  powerBalance: number;
  /** largest KCL residual [A] */
  kclResidual: number;
  /** linear system at the solution (for display) */
  system?: { labels: string[]; G: number[][]; rhs: number[] };
}

export const ledParams = (p: CParams) => {
  const n = 2;
  const Vf = p.Vf ?? 2;
  const Inom = p.Inom ?? 0.02;
  return { Is: Inom / (Math.exp(Vf / (n * VT)) - 1), n };
};
export const diodeParams = (c: CComponent) => (c.kind === 'led' ? ledParams(c.params) : { Is: c.params.Is ?? 2.52e-9, n: c.params.n ?? 1.752 });
export const lampR = (p: CParams) => ((p.Vnom ?? 12) ** 2) / (p.Pnom ?? 5);

function nets(c: CCircuit) {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let x = k;
    while (parent.get(x) !== r) {
      const nx = parent.get(x)!;
      parent.set(x, r);
      x = nx;
    }
    return r;
  };
  for (const comp of c.components) for (const p of PINS[comp.kind]) parent.set(`${comp.id}:${p}`, `${comp.id}:${p}`);
  for (const w of c.wires) {
    if (!parent.has(w.a) || !parent.has(w.b)) continue;
    const ra = find(w.a);
    const rb = find(w.b);
    if (ra !== rb) parent.set(ra, rb);
  }
  const idx = new Map<string, number>();
  const netOf = new Map<string, number>();
  for (const k of parent.keys()) {
    const r = find(k);
    if (!idx.has(r)) idx.set(r, idx.size);
    netOf.set(k, idx.get(r)!);
  }
  return { netOf, count: idx.size };
}

function solveDense(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]!]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r;
    if (Math.abs(M[piv]![col]!) < 1e-18) return null;
    [M[col], M[piv]] = [M[piv]!, M[col]!];
    const p = M[col]![col]!;
    for (let r = col + 1; r < n; r++) {
      const f = M[r]![col]! / p;
      if (f === 0) continue;
      for (let k = col; k <= n; k++) M[r]![k]! -= f * M[col]![k]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i]![n]!;
    for (let k = i + 1; k < n; k++) s -= M[i]![k]! * x[k]!;
    x[i] = s / M[i]![i]!;
  }
  return x;
}

/** Limit the change of a junction voltage per Newton step (SPICE pnjlim). */
function pnjlim(vNew: number, vOld: number, nVt: number, vcrit: number) {
  if (vNew > vcrit && Math.abs(vNew - vOld) > 2 * nVt) {
    if (vOld > 0) {
      const arg = 1 + (vNew - vOld) / nVt;
      return arg > 0 ? vOld + nVt * Math.log(arg) : vcrit;
    }
    return nVt * Math.log(vNew / nVt);
  }
  return vNew;
}

export function solveCircuit(c: CCircuit): CircuitResult {
  const { netOf, count } = nets(c);
  const empty: CircuitResult = {
    ok: false,
    netOf,
    nets: count,
    ground: 0,
    groundAssumed: false,
    potentials: [],
    comps: new Map(),
    floating: [],
    iterations: 0,
    powerBalance: 0,
    kclResidual: 0,
  };
  const active = c.components.filter((x) => x.kind !== 'ground');
  if (!active.length) return { ...empty, error: 'empty' };

  const pin = (comp: CComponent, p: string) => netOf.get(`${comp.id}:${p}`)!;
  const gnd = c.components.find((x) => x.kind === 'ground');
  let ground = gnd ? pin(gnd, 'a') : -1;
  const groundAssumed = !gnd;
  if (ground < 0) {
    const vs = c.components.find((x) => x.kind === 'vsource' || x.kind === 'isource');
    ground = vs ? pin(vs, 'b') : 0;
  }

  // node index for MNA (ground excluded)
  const node = new Map<number, number>();
  for (let n = 0; n < count; n++) if (n !== ground) node.set(n, node.size);
  const branch = new Map<string, number>();
  for (const comp of active) {
    if (comp.kind === 'vsource' || comp.kind === 'ammeter' || comp.kind === 'inductor') branch.set(comp.id, node.size + branch.size);
  }
  const N = node.size + branch.size;

  // floating nets: no conductive path to ground
  const adj = new Map<number, Set<number>>();
  const link = (a: number, b: number) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };
  for (const comp of active) {
    if (comp.kind === 'capacitor' || comp.kind === 'voltmeter' || comp.kind === 'isource' || (comp.kind === 'switch' && !comp.params.closed)) continue;
    link(pin(comp, 'a'), pin(comp, 'b'));
  }
  const reach = new Set([ground]);
  const stack = [ground];
  while (stack.length) for (const nb of adj.get(stack.pop()!) ?? []) if (!reach.has(nb)) (reach.add(nb), stack.push(nb));
  const floating = [...Array(count).keys()].filter((n) => !reach.has(n));

  const nonlinear = active.filter((x) => x.kind === 'diode' || x.kind === 'led');
  const vd = new Map(nonlinear.map((d) => [d.id, 0.6]));
  let x: number[] = new Array(N).fill(0);
  let iterations = 0;
  let last: { G: number[][]; rhs: number[] } | null = null;

  for (let it = 0; it < 300; it++) {
    iterations = it + 1;
    const G = Array.from({ length: N }, () => new Array<number>(N).fill(0));
    const rhs = new Array<number>(N).fill(0);
    const ni = (net: number) => (net === ground ? -1 : node.get(net)!);
    const stampG = (a: number, b: number, g: number) => {
      const i = ni(a);
      const j = ni(b);
      if (i >= 0) G[i]![i]! += g;
      if (j >= 0) G[j]![j]! += g;
      if (i >= 0 && j >= 0) {
        G[i]![j]! -= g;
        G[j]![i]! -= g;
      }
    };
    /** current J flowing from a to b through the element */
    const stampI = (a: number, b: number, J: number) => {
      const i = ni(a);
      const j = ni(b);
      if (i >= 0) rhs[i]! -= J;
      if (j >= 0) rhs[j]! += J;
    };
    const stampV = (a: number, b: number, k: number, V: number) => {
      const i = ni(a);
      const j = ni(b);
      if (i >= 0) {
        G[i]![k]! += 1;
        G[k]![i]! += 1;
      }
      if (j >= 0) {
        G[j]![k]! -= 1;
        G[k]![j]! -= 1;
      }
      rhs[k] = V;
    };
    // tie floating nets to ground so the matrix stays regular (they read 0 V and are flagged)
    for (const n of floating) if (n !== ground) G[node.get(n)!]![node.get(n)!]! += GMIN;
    for (const comp of active) {
      const a = pin(comp, 'a');
      const b = pin(comp, 'b');
      const p = comp.params;
      switch (comp.kind) {
        case 'resistor':
          stampG(a, b, 1 / Math.max(p.R ?? 1000, 1e-9));
          break;
        case 'lamp':
          stampG(a, b, 1 / Math.max(lampR(p), 1e-9));
          break;
        case 'switch':
          if (p.closed) stampG(a, b, 1 / R_ON);
          break;
        case 'isource':
          stampI(b, a, p.I ?? 0.01); // pushes I out of pin a into the circuit
          break;
        case 'vsource':
          stampV(a, b, branch.get(comp.id)!, p.V ?? 0);
          break;
        case 'ammeter':
        case 'inductor':
          stampV(a, b, branch.get(comp.id)!, 0);
          break;
        case 'diode':
        case 'led': {
          const { Is, n } = diodeParams(comp);
          const v = vd.get(comp.id)!;
          const e = Math.exp(Math.min(v / (n * VT), 200));
          const id = Is * (e - 1);
          const gd = (Is * e) / (n * VT) + GMIN;
          stampG(a, b, gd);
          stampI(a, b, id - gd * v);
          break;
        }
        default:
          break; // capacitor, voltmeter: open at DC
      }
    }
    const sol = solveDense(G, rhs);
    if (!sol) return { ...empty, ground, groundAssumed, floating, error: 'singular' };
    x = sol;
    last = { G, rhs };
    if (!nonlinear.length) break;
    let maxDv = 0;
    for (const d of nonlinear) {
      const va = pin(d, 'a') === ground ? 0 : x[node.get(pin(d, 'a'))!]!;
      const vb = pin(d, 'b') === ground ? 0 : x[node.get(pin(d, 'b'))!]!;
      const { Is, n } = diodeParams(d);
      const nVt = n * VT;
      const vcrit = nVt * Math.log(nVt / (Math.SQRT2 * Is));
      const old = vd.get(d.id)!;
      const lim = pnjlim(va - vb, old, nVt, vcrit);
      maxDv = Math.max(maxDv, Math.abs(lim - old));
      vd.set(d.id, lim);
    }
    if (maxDv < 1e-9 && it > 0) break;
    if (it === 299) return { ...empty, ground, groundAssumed, floating, iterations, error: 'noconverge' };
  }

  const potentials = Array.from({ length: count }, (_, n) => (n === ground ? 0 : x[node.get(n)!]!));
  const comps = new Map<string, CompResult>();
  let powerBalance = 0;
  const kcl = new Array<number>(count).fill(0);
  for (const comp of active) {
    const a = pin(comp, 'a');
    const b = pin(comp, 'b');
    const V = potentials[a]! - potentials[b]!;
    const p = comp.params;
    let I = 0;
    let level: number | undefined;
    let warn: CompResult['warn'];
    switch (comp.kind) {
      case 'resistor':
        I = V / Math.max(p.R ?? 1000, 1e-9);
        if (p.Pmax && V * I > p.Pmax) warn = 'overload';
        break;
      case 'lamp':
        I = V / Math.max(lampR(p), 1e-9);
        level = (V * I) / (p.Pnom ?? 5);
        if (level > 1.2) warn = 'overload';
        break;
      case 'switch':
        I = p.closed ? V / R_ON : 0;
        break;
      case 'isource':
        I = -(p.I ?? 0.01);
        break;
      case 'vsource':
      case 'ammeter':
      case 'inductor':
        I = x[branch.get(comp.id)!]!;
        if (comp.kind === 'vsource' && Math.abs(I) > 100) warn = 'short';
        break;
      case 'diode':
      case 'led': {
        const { Is, n } = diodeParams(comp);
        I = Is * (Math.exp(Math.min(V / (n * VT), 200)) - 1);
        if (comp.kind === 'led') {
          level = Math.max(0, I) / (p.Inom ?? 0.02);
          if (level > 1.5) warn = 'overload';
          if (V < -5) warn = 'reverse';
        }
        break;
      }
      default:
        I = 0;
    }
    if (Math.abs(I) < 1e-15) I = 0;
    const P = V * I;
    powerBalance += P;
    kcl[a]! += I; // leaves net a into the element
    kcl[b]! -= I;
    comps.set(comp.id, { id: comp.id, V, I, P, level, warn });
  }
  const kclResidual = Math.max(0, ...kcl.map((v, n) => (n === ground || floating.includes(n) ? 0 : Math.abs(v))));

  const labels = [
    ...[...node.keys()].map((n) => `φ${n}`),
    ...[...branch.keys()].map((id) => `I_${c.components.find((k) => k.id === id)!.name}`),
  ];
  return {
    ok: true,
    netOf,
    nets: count,
    ground,
    groundAssumed,
    potentials,
    comps,
    floating,
    iterations,
    powerBalance,
    kclResidual,
    system: last ? { labels, G: last.G, rhs: last.rhs } : undefined,
  };
}
