/** Named sheets the user saved (block diagrams, circuits), kept in the browser's local storage. */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '@/components/mechanics/common';

export type SheetApp = 'control-sim' | 'circuit';
export interface SavedSheet {
  name: string;
  savedAt: number;
  payload: unknown;
}

interface State {
  sheets: Record<SheetApp, SavedSheet[]>;
  save: (app: SheetApp, name: string, payload: unknown) => void;
  remove: (app: SheetApp, name: string) => void;
}

export const useSheets = create<State>()(
  persist(
    (set, get) => ({
      sheets: { 'control-sim': [], circuit: [] },
      save: (app, name, payload) => {
        const list = get().sheets[app].filter((s) => s.name !== name);
        set({ sheets: { ...get().sheets, [app]: [{ name, savedAt: Date.now(), payload: structuredClone(payload) }, ...list] } });
      },
      remove: (app, name) => set({ sheets: { ...get().sheets, [app]: get().sheets[app].filter((s) => s.name !== name) } }),
    }),
    { name: 'pe-saved-sheets', version: 1, storage: createJSONStorage(() => safeStorage) },
  ),
);

/** Offer a sheet as a .json file download. */
export function downloadSheet(app: SheetApp, name: string, payload: unknown) {
  const blob = new Blob([JSON.stringify({ format: 'practical-engineering-sheet', app, name, payload }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name.replace(/[^\w\- ]+/g, '_') || 'sheet'}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Parse an imported file; returns null when it is not a sheet of this app. */
export function parseSheet(app: SheetApp, text: string): { name: string; payload: unknown } | null {
  try {
    const j = JSON.parse(text) as { format?: string; app?: string; name?: string; payload?: unknown };
    if (j.format !== 'practical-engineering-sheet' || j.app !== app || !j.payload) return null;
    return { name: String(j.name ?? 'Imported'), payload: j.payload };
  } catch {
    return null;
  }
}
