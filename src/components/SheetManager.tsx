import { Download, FolderOpen, Save, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { t } from '@/i18n';
import { downloadSheet, parseSheet, useSheets, type SheetApp } from '@/store/sheetsStore';

/** "My sheets": save the current sheet under a name, reopen, delete, export and import as a file. */
export function SheetManager({ app, current, apply }: { app: SheetApp; current: () => unknown; apply: (payload: unknown) => void }) {
  const list = useSheets((s) => s.sheets[app]);
  const save = useSheets((s) => s.save);
  const remove = useSheets((s) => s.remove);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 2500);
  };
  const doSave = () => {
    const n = name.trim() || `${t('Sheet')} ${list.length + 1}`;
    save(app, n, current());
    setName('');
    flash(t('Saved as "{name}".', { name: n }));
  };
  const btn = 'grid h-6 w-6 shrink-0 place-items-center rounded text-plant-400 hover:bg-white/[0.05]';
  return (
    <div className="space-y-1.5">
      <p className="tag text-plant-400">{t('My sheets')}</p>
      <div className="flex gap-1">
        <input
          aria-label={t('Sheet name')}
          placeholder={t('Name…')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSave()}
          className="min-w-0 flex-1 rounded border border-white/[0.08] bg-plant-950/70 px-2 py-1 text-[11px] text-plant-100 outline-none focus:border-signal-vapor/50"
        />
        <button type="button" onClick={doSave} className="flex items-center gap-1 rounded border border-signal-vapor/40 px-2 text-[11px] text-signal-vapor hover:bg-signal-vapor/10">
          <Save className="h-3 w-3" /> {t('Save')}
        </button>
      </div>
      {msg && <p className="text-[10px] text-signal-ok">{msg}</p>}
      {list.length === 0 ? (
        <p className="text-[10px] text-plant-500">{t('No saved sheets yet. They are kept in this browser.')}</p>
      ) : (
        <ul className="space-y-0.5">
          {list.map((s) => (
            <li key={s.name} className="flex items-center gap-1 rounded border border-white/[0.06] px-1.5 py-0.5">
              <button type="button" onClick={() => (apply(s.payload), flash(t('Opened "{name}".', { name: s.name })))} className="min-w-0 flex-1 text-left" title={t('Open')}>
                <span className="block truncate text-[11px] text-plant-100">{s.name}</span>
                <span className="block font-mono text-[9px] text-plant-500">{new Date(s.savedAt).toLocaleString()}</span>
              </button>
              <button type="button" aria-label={`${t('Open')} ${s.name}`} onClick={() => (apply(s.payload), flash(t('Opened "{name}".', { name: s.name })))} className={btn}>
                <FolderOpen className="h-3 w-3" />
              </button>
              <button type="button" aria-label={`${t('Export')} ${s.name}`} onClick={() => downloadSheet(app, s.name, s.payload)} className={btn}>
                <Download className="h-3 w-3" />
              </button>
              <button type="button" aria-label={`${t('Delete')} ${s.name}`} onClick={() => remove(app, s.name)} className={`${btn} hover:text-signal-alarm`}>
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-1">
        <button type="button" onClick={() => downloadSheet(app, name.trim() || 'sheet', current())} className="flex flex-1 items-center justify-center gap-1 rounded border border-white/[0.08] px-2 py-1 text-[10px] text-plant-300 hover:text-signal-vapor">
          <Download className="h-3 w-3" /> {t('Export file')}
        </button>
        <button type="button" onClick={() => file.current?.click()} className="flex flex-1 items-center justify-center gap-1 rounded border border-white/[0.08] px-2 py-1 text-[10px] text-plant-300 hover:text-signal-vapor">
          <Upload className="h-3 w-3" /> {t('Import file')}
        </button>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-label={t('Import file')}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            const s = parseSheet(app, await f.text());
            if (!s) return flash(t('This file is not a sheet of this simulator.'));
            save(app, s.name, s.payload);
            apply(s.payload);
            flash(t('Opened "{name}".', { name: s.name }));
          }}
        />
      </div>
    </div>
  );
}
