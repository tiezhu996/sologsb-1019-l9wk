import { createEffect, createSignal } from 'solid-js';
import { createStore, reconcile, unwrap } from 'solid-js/store';
import { seedState } from '../data/seed';
import type { Adjudication, AdjudicationResolution, CoderId, CodingState, PersistedEnvelope, Segment, Theme } from '../types';
import { readEnvelope, writeEnvelope } from '../utils/db';

const STORAGE_KEY = 'sologsb-1019-state-v1';
const TAB_ID = crypto.randomUUID();

const sortCodes = (codes: string[]) => [...codes].sort();

const sameCodes = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false;
  const sortedA = sortCodes(a);
  const sortedB = sortCodes(b);
  return sortedA.every((code, index) => code === sortedB[index]);
};

const normalizeState = (state: CodingState): CodingState => {
  if (!Array.isArray(state.adjudications)) state.adjudications = [];
  return state;
};

const loadLocal = (): CodingState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeState(JSON.parse(raw) as CodingState);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return seedState();
};

const cloneState = (state: CodingState): CodingState => structuredClone(unwrap(state));

const [state, setState] = createStore<CodingState>(loadLocal());
const [undoStack, setUndoStack] = createSignal<CodingState[]>([]);
const [redoStack, setRedoStack] = createSignal<CodingState[]>([]);
const [remoteEnvelope, setRemoteEnvelope] = createSignal<PersistedEnvelope | null>(null);
const [storageReady, setStorageReady] = createSignal(false);
const [lastSavedAt, setLastSavedAt] = createSignal<Date | null>(null);
let channel: BroadcastChannel | null = null;
let hydrating = false;
let saveTimer: number | undefined;

const persist = (snapshot: CodingState) => {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    const envelope: PersistedEnvelope = {
      revision: snapshot.revision,
      updatedAt: snapshot.updatedAt,
      writerId: TAB_ID,
      state: snapshot
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    await writeEnvelope(envelope);
    setLastSavedAt(new Date());
    channel?.postMessage(envelope);
  }, 180);
};

createEffect(() => {
  const snapshot = cloneState(state);
  if (!storageReady()) return;
  persist(snapshot);
});

const transaction = (action: string, detail: string, mutator: (draft: CodingState) => void) => {
  setUndoStack((items) => [...items.slice(-49), cloneState(state)]);
  setRedoStack([]);
  const next = cloneState(state);
  mutator(next);
  next.revision = state.revision + 1;
  next.updatedAt = new Date().toISOString();
  next.audit.unshift({ id: crypto.randomUUID(), at: next.updatedAt, action, detail });
  next.audit = next.audit.slice(0, 250);
  setState(reconcile(next, { merge: false }));
  persist(next);
};

const buildTreeOrder = (themes: Theme[]) => {
  const children = new Map<string | null, Theme[]>();
  themes.forEach((theme) => children.set(theme.parentId, [...(children.get(theme.parentId) ?? []), theme]));
  const result: Theme[] = [];
  const visit = (parentId: string | null, depth: number) => {
    [...(children.get(parentId) ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')).forEach((theme) => {
      result.push({ ...theme, name: `${'　'.repeat(depth)}${theme.name}` });
      visit(theme.id, depth + 1);
    });
  };
  visit(null, 0);
  return result;
};

const parseTranscript = (raw: string, speakerFallback: string): Array<Pick<Segment, 'time' | 'speaker' | 'text'>> => {
  const rows = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return rows.map((line, index) => {
    const timed = line.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*(?:[-—])?\s*([^:：]{1,24})[:：]\s*(.+)$/);
    if (timed) return { time: timed[1], speaker: timed[2].trim(), text: timed[3].trim() };
    return { time: `${String(Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`, speaker: index % 2 === 0 ? speakerFallback : '访谈者', text: line };
  });
};

export function useCodingStore() {
  const initialize = async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    try {
      const stored = await readEnvelope();
      const local = cloneState(state);
      if (stored && (stored.revision > local.revision || stored.updatedAt > local.updatedAt)) {
        setRemoteEnvelope(stored);
      }
    } finally {
      setStorageReady(true);
    }

    if ('BroadcastChannel' in window) {
      channel = new BroadcastChannel('sologsb-1019-coding');
      channel.onmessage = (event: MessageEvent<PersistedEnvelope>) => {
        const incoming = event.data;
        if (!incoming || incoming.writerId === TAB_ID) return;
        if (incoming.revision === state.revision && incoming.updatedAt === state.updatedAt) return;
        setRemoteEnvelope(incoming);
      };
    }
  };

  const undo = () => {
    const items = undoStack();
    if (!items.length) return;
    const previous = items[items.length - 1];
    setUndoStack(items.slice(0, -1));
    setRedoStack((redo) => [...redo, cloneState(state)]);
    setState(reconcile(previous, { merge: false }));
    persist(previous);
  };

  const redo = () => {
    const items = redoStack();
    if (!items.length) return;
    const next = items[items.length - 1];
    setRedoStack(items.slice(0, -1));
    setUndoStack((undoItems) => [...undoItems, cloneState(state)]);
    setState(reconcile(next, { merge: false }));
    persist(next);
  };

  const selectSegment = (id: string) => setState('activeSegmentId', id);
  const selectTranscript = (id: string) => setState('activeTranscriptId', id);
  const selectTheme = (id: string) => setState('activeThemeId', id);
  const setCoder = (coder: CoderId, name: string) => {
    if (coder === 'A') setState('coderA', name);
    else setState('coderB', name);
  };

  const toggleAssignment = (segmentId: string, coder: CoderId, themeId: string, enabled: boolean) => {
    transaction('调整编码', `${coder === 'A' ? state.coderA : state.coderB} ${enabled ? '添加' : '移除'}主题`, (draft) => {
      const segment = draft.segments.find((item) => item.id === segmentId);
      if (!segment) return;
      const codes = new Set(segment.assignments[coder]);
      if (enabled) codes.add(themeId);
      else codes.delete(themeId);
      segment.assignments[coder] = [...codes];
    });
  };

  const batchAssign = (segmentIds: string[], coder: CoderId, themeId: string) => {
    if (!segmentIds.length) return;
    transaction('批量重编码', `将 ${segmentIds.length} 个片段分配给主题`, (draft) => {
      draft.segments.forEach((segment) => {
        if (segmentIds.includes(segment.id) && !segment.assignments[coder].includes(themeId)) segment.assignments[coder].push(themeId);
      });
    });
  };

  const addTheme = (name: string, parentId: string | null) => {
    const id = `t-${crypto.randomUUID()}`;
    transaction('新建主题', name, (draft) => {
      draft.themes.push({ id, name, parentId, color: parentId ? '#57978c' : '#267365', definition: '', memo: '', examples: [] });
      draft.activeThemeId = id;
    });
    return id;
  };

  const updateTheme = (themeId: string, patch: Partial<Theme>, fieldLabel: string) => {
    transaction('编辑主题', fieldLabel, (draft) => {
      const theme = draft.themes.find((item) => item.id === themeId);
      if (theme) Object.assign(theme, patch);
    });
  };

  const deleteTheme = (themeId: string) => {
    const theme = state.themes.find((item) => item.id === themeId);
    if (!theme) return;
    transaction('删除主题', theme.name, (draft) => {
      draft.themes = draft.themes.filter((item) => item.id !== themeId);
      draft.themes.forEach((item) => { if (item.parentId === themeId) item.parentId = null; });
      draft.segments.forEach((segment) => {
        segment.assignments.A = segment.assignments.A.filter((id) => id !== themeId);
        segment.assignments.B = segment.assignments.B.filter((id) => id !== themeId);
      });
      if (draft.activeThemeId === themeId) draft.activeThemeId = draft.themes[0]?.id ?? '';
    });
  };

  const mergeThemes = (sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    transaction('合并主题', `${state.themes.find((item) => item.id === sourceId)?.name ?? sourceId} → ${state.themes.find((item) => item.id === targetId)?.name ?? targetId}`, (draft) => {
      draft.segments.forEach((segment) => {
        (['A', 'B'] as CoderId[]).forEach((coder) => {
          const codes = new Set(segment.assignments[coder].filter((id) => id !== sourceId));
          if (segment.assignments[coder].includes(sourceId)) codes.add(targetId);
          segment.assignments[coder] = [...codes];
        });
      });
      draft.themes.forEach((theme) => { if (theme.parentId === sourceId) theme.parentId = targetId; });
      draft.themes = draft.themes.filter((theme) => theme.id !== sourceId);
      draft.activeThemeId = targetId;
    });
  };

  const splitTheme = (sourceId: string, newName: string, segmentIds: string[]) => {
    const newId = `t-${crypto.randomUUID()}`;
    transaction('拆分主题', newName, (draft) => {
      const source = draft.themes.find((theme) => theme.id === sourceId);
      if (!source) return;
      draft.themes.push({ ...source, id: newId, name: newName, examples: [] });
      draft.segments.forEach((segment) => {
        if (!segmentIds.includes(segment.id)) return;
        (['A', 'B'] as CoderId[]).forEach((coder) => {
          if (segment.assignments[coder].includes(sourceId)) {
            segment.assignments[coder] = segment.assignments[coder].map((id) => id === sourceId ? newId : id);
          }
        });
      });
      draft.activeThemeId = newId;
    });
    return newId;
  };

  const updateSegment = (segmentId: string, patch: Pick<Segment, 'speaker' | 'time' | 'text' | 'note'>) => {
    transaction('编辑片段', `片段 ${segmentId}`, (draft) => {
      const segment = draft.segments.find((item) => item.id === segmentId);
      if (segment) Object.assign(segment, patch);
    });
  };

  const importTranscript = (raw: string, title: string, participant: string, sourceName: string) => {
    const transcriptId = `tr-${crypto.randomUUID()}`;
    const rows = parseTranscript(raw, participant);
    transaction('导入转写', `${title}（${rows.length} 个片段）`, (draft) => {
      draft.transcripts.push({ id: transcriptId, title, participant, importedAt: new Date().toISOString(), sourceName });
      const start = draft.segments.length;
      const segments: Segment[] = rows.map((row, index) => ({
        id: `s-${crypto.randomUUID()}`,
        transcriptId,
        order: start + index,
        speaker: row.speaker,
        time: row.time,
        text: row.text,
        assignments: { A: [], B: [] },
        note: ''
      }));
      draft.segments.push(...segments);
      draft.activeTranscriptId = transcriptId;
      draft.activeSegmentId = segments[0]?.id ?? draft.activeSegmentId;
    });
  };

  const addExample = (themeId: string, example: string) => {
    const trimmed = example.trim();
    if (!trimmed) return;
    transaction('添加主题示例', trimmed, (draft) => {
      const theme = draft.themes.find((item) => item.id === themeId);
      if (theme && !theme.examples.includes(trimmed)) theme.examples.push(trimmed);
    });
  };

  /** 双方判断是否一致（集合语义，与顺序无关） */
  const hasDisagreement = (segment: Segment) => !sameCodes(segment.assignments.A, segment.assignments.B);

  const adjudicationFor = (segmentId: string) => state.adjudications.find((item) => item.segmentId === segmentId) ?? null;

  /**
   * 裁决是否仍然生效：落笔后双方判断未再改动，且结论引用的主题仍然存在。
   * 编码调整、批量重编码、主题合并/拆分/删除都会使过期结论自动失效。
   */
  const isAdjudicationCurrent = (adjudication: Adjudication) => {
    const segment = state.segments.find((item) => item.id === adjudication.segmentId);
    if (!segment) return false;
    if (!sameCodes(adjudication.basisA, segment.assignments.A) || !sameCodes(adjudication.basisB, segment.assignments.B)) return false;
    return adjudication.themes.every((id) => state.themes.some((theme) => theme.id === id));
  };

  const currentAdjudicationFor = (segmentId: string) => {
    const adjudication = adjudicationFor(segmentId);
    return adjudication && isAdjudicationCurrent(adjudication) ? adjudication : null;
  };

  /** 裁决待办：当前仍有分歧且没有生效裁决的片段；双方一致的片段不占用队列 */
  const pendingAdjudications = () => state.segments
    .filter((segment) => hasDisagreement(segment) && !currentAdjudicationFor(segment.id))
    .sort((a, b) => a.order - b.order);

  const settledAdjudications = () => state.adjudications.filter((item) => isAdjudicationCurrent(item));

  const adjudicateSegment = (segmentId: string, resolution: AdjudicationResolution, themes: string[], rationale: string, decidedBy: string) => {
    const segment = state.segments.find((item) => item.id === segmentId);
    if (!segment || !hasDisagreement(segment)) return;
    if (!rationale.trim() || !decidedBy.trim()) return;
    // 采纳某一方时结论主题直接取自该方当前判断，另立主题时使用勾选集合
    const conclusion = resolution === 'A' ? [...segment.assignments.A] : resolution === 'B' ? [...segment.assignments.B] : [...themes];
    if (resolution === 'custom' && !conclusion.length) return;
    const label = resolution === 'A' ? `采纳 ${state.coderA}` : resolution === 'B' ? `采纳 ${state.coderB}` : '另立主题';
    transaction('裁决分歧', `${label} · ${segment.time} ${segment.speaker}`, (draft) => {
      const target = draft.segments.find((item) => item.id === segmentId);
      if (!target) return;
      draft.adjudications = draft.adjudications.filter((item) => item.segmentId !== segmentId);
      draft.adjudications.push({
        id: `adj-${crypto.randomUUID()}`,
        segmentId,
        basisA: sortCodes(target.assignments.A),
        basisB: sortCodes(target.assignments.B),
        resolution,
        themes: conclusion,
        rationale: rationale.trim(),
        decidedBy: decidedBy.trim(),
        decidedAt: new Date().toISOString()
      });
    });
  };

  const exportCoding = (format: 'json' | 'csv') => {
    const themeMap = new Map(state.themes.map((theme) => [theme.id, theme]));
    const themePath = (id: string) => {
      const names: string[] = [];
      let current = themeMap.get(id);
      while (current) {
        names.unshift(current.name);
        current = current.parentId ? themeMap.get(current.parentId) : undefined;
      }
      return names.length ? names.join(' / ') : '未知主题';
    };
    if (format === 'json') {
      const snapshot = cloneState(state);
      // 只导出生效中的裁决结论，过期结论（判断已变更或结论主题已不存在）不随结果发出
      snapshot.adjudications = snapshot.adjudications.filter((adjudication) => {
        const segment = snapshot.segments.find((item) => item.id === adjudication.segmentId);
        return !!segment
          && sameCodes(adjudication.basisA, segment.assignments.A)
          && sameCodes(adjudication.basisB, segment.assignments.B)
          && adjudication.themes.every((id) => themeMap.has(id));
      });
      return JSON.stringify({ exportedAt: new Date().toISOString(), ...snapshot }, null, 2);
    }
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const rows = [['片段编号', '时间', '发言人', '原文', '编码者', '主题路径', '备忘录', '裁决结论', '裁决依据', '裁决人', '裁决时间'].map(escape).join(',')];
    state.segments.forEach((segment) => {
      const adjudication = currentAdjudicationFor(segment.id);
      const verdict = adjudication
        ? (adjudication.themes.length ? adjudication.themes.map(themePath).join(' | ') : '（不编码）')
        : hasDisagreement(segment) ? '待裁决' : '';
      const verdictWhy = adjudication?.rationale ?? '';
      const verdictBy = adjudication?.decidedBy ?? '';
      const verdictAt = adjudication?.decidedAt ?? '';
      (['A', 'B'] as CoderId[]).forEach((coder) => {
        const name = coder === 'A' ? state.coderA : state.coderB;
        const themeIds = segment.assignments[coder];
        const paths = themeIds.length ? themeIds.map(themePath) : ['未编码'];
        rows.push([segment.id, segment.time, segment.speaker, segment.text, name, paths.join(' | '), segment.note, verdict, verdictWhy, verdictBy, verdictAt].map(escape).join(','));
      });
    });
    return `\uFEFF${rows.join('\n')}`;
  };

  const downloadExport = (format: 'json' | 'csv') => {
    const content = exportCoding(format);
    const blob = new Blob([content], { type: format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `访谈编码结果-${new Date().toISOString().slice(0, 10)}.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const keepLocalVersion = () => {
    setRemoteEnvelope(null);
    transaction('处理多标签冲突', '保留当前标签页版本并生成新修订', () => undefined);
  };

  const applyRemoteVersion = () => {
    const remote = remoteEnvelope();
    if (!remote) return;
    setUndoStack((items) => [...items, cloneState(state)]);
    setRedoStack([]);
    setState(reconcile(normalizeState(remote.state), { merge: false }));
    setRemoteEnvelope(null);
  };

  const orderedThemes = () => buildTreeOrder(state.themes);

  return {
    state,
    initialize,
    undo,
    redo,
    canUndo: () => undoStack().length > 0,
    canRedo: () => redoStack().length > 0,
    selectSegment,
    selectTranscript,
    selectTheme,
    setCoder,
    toggleAssignment,
    batchAssign,
    addTheme,
    updateTheme,
    deleteTheme,
    mergeThemes,
    splitTheme,
    updateSegment,
    importTranscript,
    addExample,
    hasDisagreement,
    adjudicationFor,
    isAdjudicationCurrent,
    currentAdjudicationFor,
    pendingAdjudications,
    settledAdjudications,
    adjudicateSegment,
    exportCoding,
    downloadExport,
    orderedThemes,
    remoteEnvelope,
    keepLocalVersion,
    applyRemoteVersion,
    storageReady,
    lastSavedAt
  };
}
