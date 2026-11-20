import { ArrowRight } from 'lucide-react';
import { t } from '@/i18n';
import { navigate, type Route } from '@/lib/route';

interface Area {
  title: string;
  lead: string;
  icon: JSX.Element;
  accent: string;
  modules: { route: Route; label: string; desc: string }[];
}

const AREAS: Area[] = [
  {
    title: 'Thermal Separation',
    lead: 'Distillation, extraction, absorption, evaporation, crystallization and drying with real phase equilibria, flowsheets and balance tasks.',
    accent: 'var(--sig-liquid)',
    icon: (
      <>
        <rect x="8" y="2" width="8" height="20" rx="4" />
        <path d="M8 8h5M16 12h-5M8 16h5" />
      </>
    ),
    modules: [
      { route: 'flowsheet', label: 'Flowsheet', desc: 'Simulate a plant or solve a balance task step by step' },
      { route: 'mccabe-thiele', label: 'McCabe–Thiele', desc: 'Stage construction, shortcuts, efficiencies' },
      { route: 'extraction', label: 'Extraction', desc: 'Cross-, counter-current and Hunter–Nash' },
      { route: 'absorption', label: 'Absorption', desc: 'Loading diagram, Kremser, packed height' },
    ],
  },
  {
    title: 'Heat & Mass Transfer',
    lead: 'Conduction through walls, pipes and fins, transient heating, convection, radiation, heat exchangers and diffusion, with temperature and concentration profiles.',
    accent: 'var(--sig-alarm)',
    icon: (
      <>
        <path d="M4 20V8M9 20V4M14 20V10M19 20V6" />
        <path d="M2 20h20" />
      </>
    ),
    modules: [
      { route: 'conduction', label: 'Conduction', desc: 'Layered wall, pipe, sphere: T(x), U-value, critical radius' },
      { route: 'fin', label: 'Fin / rod', desc: 'T(x) along the fin, efficiency, effectiveness' },
      { route: 'transient', label: 'Transient', desc: 'Biot, Fourier, plate/cylinder/sphere, semi-infinite body' },
      { route: 'convection', label: 'Convection', desc: 'Re, Pr, Nu correlations, boundary layer' },
      { route: 'radiation', label: 'Radiation', desc: 'Planck, gray exchange, shields, view factors' },
      { route: 'exchanger', label: 'Heat exchanger', desc: 'ε–NTU, LMTD, temperature profiles' },
      { route: 'diffusion', label: 'Mass transfer', desc: 'Fick, Stefan diffusion, c(x) profiles' },
    ],
  },
  {
    title: 'Electrical Circuits',
    lead: 'Build DC circuits from sources, resistors, diodes, LEDs, lamps and switches; every node voltage, branch current and power is computed.',
    accent: 'var(--sig-vapor)',
    icon: <path d="M2 12h4l2-5 3 10 3-10 3 10 2-5h3" />,
    modules: [{ route: 'circuits', label: 'Circuit simulator', desc: 'DC, transient and AC/Bode analysis; step-by-step network simplification' }],
  },
  {
    title: 'Mechanics',
    lead: 'Statics and strength of materials as taught in Engineering Mechanics 1 and 2: support reactions, internal forces, deflection, trusses and torsion.',
    accent: 'var(--sig-heat)',
    icon: (
      <>
        <path d="M2 9h20" />
        <path d="M4 9l-2 5h4zM20 9l-2 5h4z" />
        <path d="M12 3v5m-2-2 2 2 2-2" />
      </>
    ),
    modules: [
      { route: 'beam', label: 'Beam', desc: 'Reactions, N/Q/M diagrams, bending stress, deflection curve' },
      { route: 'truss', label: 'Truss', desc: 'Member forces, tension and compression, determinacy' },
      { route: 'torsion', label: 'Shaft & torsion', desc: 'Torque diagram, shear stress, angle of twist' },
    ],
  },
  {
    title: 'Control Engineering',
    lead: 'Controllers and plants as blocks: block diagram reduction step by step, step response, Bode and Nyquist, stability, filter design and Fourier analysis.',
    accent: 'var(--sig-liquid)',
    icon: (
      <>
        <rect x="8" y="5" width="8" height="6" rx="1" />
        <path d="M2 8h6M16 8h6M19 8v9H5V8" />
      </>
    ),
    modules: [
      { route: 'control-sim', label: 'Simulator', desc: 'Block diagram editor: wire sources, controllers, plants and scopes; simulate and get the transfer function' },
      { route: 'control', label: 'Control loop', desc: 'P/PI/PID + plant, reduction, step response, margins, Routh' },
      { route: 'bode', label: 'Bode diagram', desc: 'Factor by factor: exact curve and straight-line approximation' },
      { route: 'filters', label: 'Filters', desc: 'Butterworth, Chebyshev, Bessel; Sallen–Key component values' },
      { route: 'fourier', label: 'Fourier / FFT', desc: 'Fourier series, Gibbs, FFT spectrum, windows, aliasing' },
    ],
  },
  {
    title: 'Thermodynamics',
    lead: 'Thermodynamics I and II: cycles in T,s and p,v diagrams with draggable state points, water and steam, real gases, mixtures and humid air.',
    accent: 'var(--sig-alarm)',
    icon: (
      <>
        <path d="M4 20V4M4 20h16" />
        <path d="M7 16c3-9 7-9 10 0" />
        <path d="M9 9h6v7H9z" />
      </>
    ),
    modules: [
      { route: 'cycles', label: 'Cycles (T,s / p,v)', desc: 'Carnot, Clausius–Rankine, Joule, Otto, Diesel: efficiency and exergy loss live' },
      { route: 'steam', label: 'Steam table', desc: 'Water and steam from p, T, x, h or s; saturation table' },
      { route: 'realgas', label: 'Real gases', desc: 'van der Waals, Redlich–Kwong, Peng–Robinson, Maxwell construction, Z chart' },
      { route: 'mixtures', label: 'Mixtures', desc: 'Miscibility gap (binodal, spinodal, lever rule), ideal gas mixtures' },
      { route: 'humidair', label: 'Humid air (h,x)', desc: 'Mollier diagram: heating, cooling, mixing, humidification' },
    ],
  },
  {
    title: 'Fluid Mechanics',
    lead: 'Pipe flow and Bernoulli lab: diameter, roughness and flow rate adjustable, Reynolds number and the switch between laminar and turbulent profile live, pressure loss and cavitation at constrictions.',
    accent: 'var(--sig-liquid)',
    icon: (
      <>
        <path d="M2 8h7l3 3h10M2 16h7l3-3h10" />
        <path d="M4 12h3M15 12h5" />
      </>
    ),
    modules: [{ route: 'pipe', label: 'Pipe flow & Bernoulli', desc: 'Re, λ (Colebrook), losses, energy line, cavitation, Moody diagram' }],
  },
  {
    title: 'Tools',
    lead: 'The formulas behind the simulators in one searchable collection, and a unit converter for the quantities of the engineering lectures.',
    accent: 'var(--plant-300)',
    icon: (
      <>
        <path d="M4 4h16v16H4z" />
        <path d="M8 9h8M8 13h5M8 17h3" />
      </>
    ),
    modules: [
      { route: 'formulas', label: 'Formula collection', desc: 'About 65 formulas with symbols, each linked to its simulator' },
      { route: 'units', label: 'Unit converter', desc: 'Pressure, energy, flows, viscosity, λ, α and more' },
    ],
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-2 py-8">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-plant-100">Practical Engineering</h1>
        <p className="mx-auto max-w-2xl text-sm leading-relaxed text-plant-400">
          {t('Interactive simulators for the core engineering lectures. Build the system, enter your values, and see every result with the way it was calculated.')}
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {AREAS.map((a) => (
          <section key={a.title} className="glass flex flex-col p-5">
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-lg border border-white/[0.08] bg-plant-950/60">
                <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-[1.5]" style={{ stroke: `rgb(${a.accent})` }} aria-hidden>
                  {a.icon}
                </svg>
              </span>
              <h2 className="text-lg font-semibold text-plant-100">{t(a.title)}</h2>
            </div>
            <p className="mb-4 text-[12px] leading-relaxed text-plant-400">{t(a.lead)}</p>
            <ul className="mt-auto space-y-1">
              {a.modules.map((m) => (
                <li key={m.route}>
                  <button
                    type="button"
                    onClick={() => navigate(m.route)}
                    className="group flex w-full items-center gap-3 rounded-md border border-white/[0.05] px-3 py-2 text-left transition-colors hover:border-white/[0.12] hover:bg-white/[0.03]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-medium text-plant-100">{t(m.label)}</span>
                      <span className="block text-[10px] text-plant-500">{t(m.desc)}</span>
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-plant-500 transition-colors group-hover:text-signal-liquid" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2 text-[11px] text-plant-500">
        <span>© 2026 momo-senpai1 · Practical Engineering</span>
        <a href="https://github.com/momo-senpai1/Practical-Engineering/blob/main/LICENSE" target="_blank" rel="noreferrer" className="text-plant-400 underline-offset-2 hover:text-signal-liquid hover:underline">
          {t('Apache License 2.0')}
        </a>
        <a href={`${import.meta.env.BASE_URL}third-party-licenses.txt`} target="_blank" rel="noreferrer" className="text-plant-400 underline-offset-2 hover:text-signal-liquid hover:underline">
          {t('Third-party licenses')}
        </a>
        <span>{t('No tracking · your work stays in your browser')}</span>
        <button type="button" onClick={() => navigate('privacy')} className="text-plant-400 underline-offset-2 hover:text-signal-liquid hover:underline">
          {t('Privacy')}
        </button>
      </footer>
    </div>
  );
}
