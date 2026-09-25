import { For, Show, createEffect, createMemo, createSignal } from 'solid-js';
import { Button, Chip, Divider, Paper, Typography } from '@suid/material';
import type { AdjudicationDecision, Theme } from '../types';
import type { useCodingStore } from '../store/coding-store';
import { decisionLabel, themePathList } from '../utils/adjudication';

type Store = ReturnType<typeof useCodingStore>;

export default function Inspector(props: { store: Store }) {
  const [definition, setDefinition] = createSignal('');
  const [memo, setMemo] = createSignal('');
  const [example, setExample] = createSignal('');
  const [segmentNote, setSegmentNote] = createSignal('');

  // 裁决表单
  const [decision, setDecision] = createSignal<AdjudicationDecision>('adoptA');
  const [customThemeIds, setCustomThemeIds] = createSignal<string[]>([]);
  const [newThemeName, setNewThemeName] = createSignal('');
  const [rationale, setRationale] = createSignal('');
  const [adjudicator, setAdjudicator] = createSignal('');

  const theme = createMemo(() => props.store.state.themes.find((item) => item.id === props.store.state.activeThemeId));
  const segment = createMemo(() => props.store.state.segments.find((item) => item.id === props.store.state.activeSegmentId));
  const themeMap = createMemo(() => new Map(props.store.state.themes.map((item) => [item.id, item])));
  const queueEntry = createMemo(() => props.store.adjudicationQueue().find((entry) => entry.segment.id === segment()?.id));
  /** 已有裁决记录（有效/失效/已趋同），用于展示裁决卡片；纯待办不显示 */
  const rulingEntry = createMemo(() => {
    const entry = queueEntry();
    return entry && entry.adjudication && entry.queueKind !== 'pending' ? entry : null;
  });
  const citations = createMemo(() => {
    const current = theme();
    if (!current) return [];
    return props.store.state.segments.filter((item) => item.assignments.A.includes(current.id) || item.assignments.B.includes(current.id));
  });

  createEffect(() => {
    const current = theme();
    setDefinition(current?.definition ?? '');
    setMemo(current?.memo ?? '');
    setExample('');
  });

  // 切换片段时重置裁决表单
  createEffect(() => {
    const current = segment();
    setSegmentNote(current?.note ?? '');
    setDecision('adoptA');
    setCustomThemeIds([]);
    setNewThemeName('');
    setRationale('');
    if (!adjudicator()) setAdjudicator(props.store.state.coderA);
  });

  const saveThemeField = (field: 'definition' | 'memo', value: string) => {
    const current = theme();
    if (!current || current[field] === value) return;
    props.store.updateTheme(current.id, { [field]: value } as Partial<Theme>, field === 'definition' ? '主题定义' : '研究备忘录');
  };

  const saveNote = () => {
    const current = segment();
    if (!current || current.note === segmentNote()) return;
    props.store.updateSegment(current.id, { speaker: current.speaker, time: current.time, text: current.text, note: segmentNote() });
  };

  const disagreement = () => {
    const current = segment();
    return !!current && current.assignments.A.join('|') !== current.assignments.B.join('|');
  };

  const toggleCustomTheme = (id: string, checked: boolean) => {
    setCustomThemeIds((items) => checked ? [...items, id] : items.filter((item) => item !== id));
  };

  const submitAdjudication = () => {
    const current = segment();
    if (!current || !rationale().trim()) return;
    if (decision() === 'custom' && !customThemeIds().length && !newThemeName().trim()) return;
    props.store.adjudicate({
      segmentId: current.id,
      decision: decision(),
      customThemeIds: customThemeIds(),
      newThemeName: newThemeName(),
      rationale: rationale(),
      adjudicator: adjudicator() || props.store.state.coderA
    });
  };

  const coderName = (coder: 'A' | 'B') => (coder === 'A' ? props.store.state.coderA : props.store.state.coderB);

  return (
    <Paper class="panel inspector-panel" elevation={0}>
      <div class="panel-heading">
        <div>
          <Typography variant="overline">03 / 研究记录</Typography>
          <Typography variant="h6">主题与判断</Typography>
        </div>
      </div>
      <div class="inspector-tabs">
        <button classList={{ active: props.store.inspectorTab() === 'theme' }} onClick={() => props.store.setInspectorTab('theme')}>主题记事</button>
        <button classList={{ active: props.store.inspectorTab() === 'compare' }} onClick={() => props.store.setInspectorTab('compare')}>
          双人比较<Show when={props.store.pendingCount()}><span class="tab-badge">{props.store.pendingCount()}</span></Show>
        </button>
        <button classList={{ active: props.store.inspectorTab() === 'audit' }} onClick={() => props.store.setInspectorTab('audit')}>操作记录</button>
      </div>
      <Divider />

      <Show when={props.store.inspectorTab() === 'theme'}>
        <Show when={theme()} fallback={<div class="empty-state">从中间主题树选择一个主题，添加定义、备忘录和示例。</div>}>
          {(current) => <>
            <div class="selected-theme-title"><span style={{ background: current().color }} /> <strong>{current().name}</strong></div>
            <Show when={segment()}>
              {(activeSegment) => <div class="quote-card">
                <div class="quote-meta">{activeSegment().time} · {activeSegment().speaker}</div>
                <blockquote>“{activeSegment().text}”</blockquote>
                <button class="link-button" onClick={() => document.querySelector('.segment-card.active')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>↗ 回到原文位置</button>
              </div>}
            </Show>
            <label class="field-label">操作定义
              <textarea class="native-textarea" value={definition()} onInput={(event) => setDefinition(event.currentTarget.value)} onBlur={() => saveThemeField('definition', definition())} placeholder="说明什么内容应/不应归入该主题" />
            </label>
            <label class="field-label">研究备忘录
              <textarea class="native-textarea" value={memo()} onInput={(event) => setMemo(event.currentTarget.value)} onBlur={() => saveThemeField('memo', memo())} placeholder="记录判断边界、疑问或编码规则" />
            </label>
            <label class="field-label">添加典型示例
              <div class="inline-input">
                <input class="native-input" value={example()} onInput={(event) => setExample(event.currentTarget.value)} placeholder="输入示例文本" />
                <Button size="small" variant="contained" disabled={!example().trim()} onClick={() => { props.store.addExample(current().id, example()); setExample(''); }}>添加</Button>
              </div>
            </label>
            <Show when={current().examples.length} fallback={<div class="muted">暂无示例</div>}>
              <ul class="example-list"><For each={current().examples}>{(item) => <li>{item}</li>}</For></ul>
            </Show>
            <Show when={citations().length}>
              <div class="citation-heading">回原文引用 <span>{citations().length} 条</span></div>
              <div class="citation-list">
                <For each={citations()}>{(item) => (
                  <button class="citation-link" onClick={() => { props.store.selectSegment(item.id); window.setTimeout(() => document.querySelector('.segment-card.active')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0); }}>
                    <span>{item.time} · {item.speaker}</span>
                    <p>{item.text}</p>
                  </button>
                )}</For>
              </div>
            </Show>
          </>}
        </Show>
      </Show>

      <Show when={props.store.inspectorTab() === 'compare'}>
        <Show when={segment()} fallback={<div class="empty-state">请先从左侧正文选择片段。</div>}>
          {(activeSegment) => <>
            <div class="compare-intro">比较两位编码者对同一片段的主题判断。出现分歧时在此裁决，裁决结论随编码结果导出。</div>
            <div class="compare-grid">
              <div class="coder-column">
                <div class="coder-header"><span class="avatar">A</span><strong>{coderName('A')}</strong></div>
                <For each={activeSegment().assignments.A} fallback={<div class="muted">未编码</div>}>{(id) => <div class="compare-chip"><Chip size="small" label={props.store.state.themes.find((item) => item.id === id)?.name ?? '未知主题'} /><button class="icon-text" onClick={() => props.store.toggleAssignment(activeSegment().id, 'A', id, false)}>×</button></div>}</For>
                <select class="native-select full" value="" onChange={(event) => event.currentTarget.value && props.store.toggleAssignment(activeSegment().id, 'A', event.currentTarget.value, true)}>
                  <option value="">＋ 给编码者 A 添加主题</option>
                  <For each={props.store.orderedThemes()}>{(item) => <option value={item.id}>{item.name}</option>}</For>
                </select>
              </div>
              <div class="coder-column">
                <div class="coder-header"><span class="avatar b">B</span><strong>{coderName('B')}</strong></div>
                <For each={activeSegment().assignments.B} fallback={<div class="muted">未编码</div>}>{(id) => <div class="compare-chip"><Chip size="small" label={props.store.state.themes.find((item) => item.id === id)?.name ?? '未知主题'} /><button class="icon-text" onClick={() => props.store.toggleAssignment(activeSegment().id, 'B', id, false)}>×</button></div>}</For>
                <select class="native-select full" value="" onChange={(event) => event.currentTarget.value && props.store.toggleAssignment(activeSegment().id, 'B', event.currentTarget.value, true)}>
                  <option value="">＋ 给编码者 B 添加主题</option>
                  <For each={props.store.orderedThemes()}>{(item) => <option value={item.id}>{item.name}</option>}</For>
                </select>
              </div>
            </div>

            {/* 已有裁决：展示结论或失效状态 */}
            <Show when={rulingEntry()}>
              {(entryAccessor) => {
                const adjudication = () => entryAccessor().adjudication!;
                return (
                  <div class="ruling-card" data-kind={entryAccessor().queueKind}>
                    <div class="ruling-head">
                      <span class="queue-status" data-kind={entryAccessor().queueKind}>
                        {entryAccessor().queueKind === 'resolved' ? '裁决有效' : entryAccessor().queueKind === 'stale' ? '裁决已失效' : '已确认趋同'}
                      </span>
                      <span>{adjudication().adjudicator} · {new Date(adjudication().decidedAt).toLocaleString('zh-CN')}</span>
                    </div>
                    <div class="ruling-decision">{decisionLabel(adjudication().decision)} · {themePathList(adjudication().resolvedThemeIds, themeMap())}</div>
                    <blockquote>“{adjudication().rationale}”</blockquote>
                    <Show when={entryAccessor().queueKind === 'stale'}>
                      <div class="ruling-stale">{entryAccessor().staleReason}。原结论不会出现在导出结果中，请在下方重新裁决。</div>
                    </Show>
                  </div>
                );
              }}
            </Show>

            <Show when={disagreement()} fallback={<div class="agreement">✓ 当前判断完全一致{queueEntry()?.queueKind === 'stale' ? '，此前的裁决已自动失效' : ''}，不占用裁决队列。</div>}>
              <div class="adjudicate-box">
                <div class="adjudicate-title">作出裁决</div>
                <label class="field-label">采纳哪一方判断 / 另立主题</label>
                <div class="decision-options">
                  <label classList={{ chosen: decision() === 'adoptA' }}>
                    <input type="radio" name="decision" checked={decision() === 'adoptA'} onChange={() => setDecision('adoptA')} />
                    <span>采纳 A · {coderName('A')}</span>
                    <em>{themePathList(activeSegment().assignments.A, themeMap())}</em>
                  </label>
                  <label classList={{ chosen: decision() === 'adoptB' }}>
                    <input type="radio" name="decision" checked={decision() === 'adoptB'} onChange={() => setDecision('adoptB')} />
                    <span>采纳 B · {coderName('B')}</span>
                    <em>{themePathList(activeSegment().assignments.B, themeMap())}</em>
                  </label>
                  <label classList={{ chosen: decision() === 'custom' }}>
                    <input type="radio" name="decision" checked={decision() === 'custom'} onChange={() => setDecision('custom')} />
                    <span>另立主题（研究者重新判定）</span>
                  </label>
                </div>
                <Show when={decision() === 'custom'}>
                  <div class="custom-themes">
                    <For each={props.store.orderedThemes()}>{(item) => (
                      <label class="custom-theme-chip">
                        <input type="checkbox" checked={customThemeIds().includes(item.id)} onChange={(event) => toggleCustomTheme(item.id, event.currentTarget.checked)} />
                        <span>{item.name}</span>
                      </label>
                    )}</For>
                    <input class="native-input full" value={newThemeName()} onInput={(event) => setNewThemeName(event.currentTarget.value)} placeholder="或新建一个主题（可选）" />
                  </div>
                </Show>
                <label class="field-label">裁决依据（必填，随结果导出）
                  <textarea class="native-textarea" value={rationale()} onInput={(event) => setRationale(event.currentTarget.value)} placeholder="说明为什么采纳这一方，或为什么另立主题" />
                </label>
                <label class="field-label">裁决人
                  <input class="native-input full" value={adjudicator()} onInput={(event) => setAdjudicator(event.currentTarget.value)} placeholder="签署裁决研究者" />
                </label>
                <div class="adjudicate-actions">
                  <Button size="small" variant="contained" disabled={!rationale().trim() || (decision() === 'custom' && !customThemeIds().length && !newThemeName().trim())} onClick={submitAdjudication}>
                    {queueEntry()?.queueKind === 'stale' ? '提交重新裁决' : '提交裁决'}
                  </Button>
                </div>
              </div>
            </Show>
            <label class="field-label">片段编码备忘
              <textarea class="native-textarea" value={segmentNote()} onInput={(event) => setSegmentNote(event.currentTarget.value)} onBlur={saveNote} placeholder="记录此片段的分歧处理或引文提示" />
            </label>
          </>}
        </Show>
      </Show>

      <Show when={props.store.inspectorTab() === 'audit'}>
        <div class="audit-summary">
          <div><strong>{props.store.state.audit.length}</strong><span>次最近操作</span></div>
          <div><strong>{citations().length}</strong><span>条当前主题引用</span></div>
        </div>
        <div class="audit-list">
          <For each={props.store.state.themes.filter((item) => item.definition || item.memo)}>{(item) => (
            <div class="citation" onClick={() => { props.store.setInspectorTab('theme'); props.store.selectTheme(item.id); }}>
              <strong>{item.name}</strong>
              <span>{item.definition ? '含操作定义' : ''}{item.definition && item.memo ? ' · ' : ''}{item.memo ? '含备忘录' : ''}</span>
            </div>
          )}</For>
        </div>
        <Divider />
        <div class="audit-list">
          <For each={props.store.state.audit.slice(0, 14)}>{(entry) => (
            <div class="audit-item"><span>{new Date(entry.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span><div><strong>{entry.action}</strong><p>{entry.detail}</p></div></div>
          )}</For>
        </div>
      </Show>
    </Paper>
  );
}
