import { For, Show, createEffect, createMemo, createSignal } from 'solid-js';
import { Button, Chip, Divider, Paper, Typography } from '@suid/material';
import type { AdjudicationResolution, Segment, Theme } from '../types';
import type { useCodingStore } from '../store/coding-store';

type Store = ReturnType<typeof useCodingStore>;

export default function Inspector(props: { store: Store }) {
  const [definition, setDefinition] = createSignal('');
  const [memo, setMemo] = createSignal('');
  const [example, setExample] = createSignal('');
  const [segmentNote, setSegmentNote] = createSignal('');
  const [section, setSection] = createSignal<'theme' | 'compare' | 'adjudicate' | 'audit'>('theme');

  const theme = createMemo(() => props.store.state.themes.find((item) => item.id === props.store.state.activeThemeId));
  const segment = createMemo(() => props.store.state.segments.find((item) => item.id === props.store.state.activeSegmentId));
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

  createEffect(() => setSegmentNote(segment()?.note ?? ''));

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

  const [resolution, setResolution] = createSignal<AdjudicationResolution>('A');
  const [customThemes, setCustomThemes] = createSignal<string[]>([]);
  const [rationale, setRationale] = createSignal('');
  const [decidedBy, setDecidedBy] = createSignal('');
  const [editing, setEditing] = createSignal(false);

  createEffect(() => {
    void segment()?.id;
    setResolution('A');
    setCustomThemes([]);
    setRationale('');
    setDecidedBy('');
    setEditing(false);
  });

  const themeName = (id: string) => props.store.state.themes.find((item) => item.id === id)?.name ?? '未知主题';
  const codesLabel = (ids: string[]) => ids.length ? ids.map(themeName).join('、') : '未编码';
  const resolutionLabel = (value: AdjudicationResolution) => value === 'A' ? `采纳 ${props.store.state.coderA}` : value === 'B' ? `采纳 ${props.store.state.coderB}` : '另立主题';
  const formatTime = (iso: string) => new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

  const currentAdj = () => {
    const current = segment();
    return current ? props.store.currentAdjudicationFor(current.id) : null;
  };
  const staleAdj = () => {
    const current = segment();
    if (!current) return null;
    const adjudication = props.store.adjudicationFor(current.id);
    return adjudication && !props.store.isAdjudicationCurrent(adjudication) ? adjudication : null;
  };

  const chooseResolution = (value: AdjudicationResolution) => {
    setResolution(value);
    if (value === 'custom' && !customThemes().length) {
      const current = segment();
      if (current) setCustomThemes([...new Set([...current.assignments.A, ...current.assignments.B])]);
    }
  };

  const canSubmitAdjudication = () => {
    const current = segment();
    if (!current || !props.store.hasDisagreement(current)) return false;
    if (!rationale().trim() || !decidedBy().trim()) return false;
    return resolution() !== 'custom' || customThemes().length > 0;
  };

  const submitAdjudication = () => {
    const current = segment();
    if (!current) return;
    props.store.adjudicateSegment(current.id, resolution(), customThemes(), rationale(), decidedBy());
    setEditing(false);
  };

  const startEditAdjudication = () => {
    const adjudication = currentAdj();
    if (adjudication) {
      setResolution(adjudication.resolution);
      setCustomThemes(adjudication.resolution === 'custom' ? [...adjudication.themes] : []);
      setRationale(adjudication.rationale);
      setDecidedBy(adjudication.decidedBy);
    }
    setEditing(true);
  };

  const jumpToSegment = (item: Segment) => {
    if (item.transcriptId !== props.store.state.activeTranscriptId) props.store.selectTranscript(item.transcriptId);
    props.store.selectSegment(item.id);
    window.setTimeout(() => document.querySelector('.segment-card.active')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  };

  return (
    <Paper class="panel inspector-panel" elevation={0}>
      <div class="panel-heading">
        <div>
          <Typography variant="overline">03 / 研究记录</Typography>
          <Typography variant="h6">主题与判断</Typography>
        </div>
      </div>
      <div class="inspector-tabs">
        <button classList={{ active: section() === 'theme' }} onClick={() => setSection('theme')}>主题记事</button>
        <button classList={{ active: section() === 'compare' }} onClick={() => setSection('compare')}>双人比较</button>
        <button classList={{ active: section() === 'adjudicate' }} onClick={() => setSection('adjudicate')}>裁决{props.store.pendingAdjudications().length ? ` · ${props.store.pendingAdjudications().length}` : ''}</button>
        <button classList={{ active: section() === 'audit' }} onClick={() => setSection('audit')}>操作记录</button>
      </div>
      <Divider />

      <Show when={section() === 'theme'}>
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

      <Show when={section() === 'compare'}>
        <Show when={segment()} fallback={<div class="empty-state">请先从左侧正文选择片段。</div>}>
          {(activeSegment) => <>
            <div class="compare-intro">比较同一位受访者在同一片段上的主题判断。任何不一致都会保留，直到研究者明确调整。</div>
            <div class="compare-grid">
              <div class="coder-column">
                <div class="coder-header"><span class="avatar">A</span><strong>{props.store.state.coderA}</strong></div>
                <For each={activeSegment().assignments.A} fallback={<div class="muted">未编码</div>}>{(id) => <div class="compare-chip"><Chip size="small" label={props.store.state.themes.find((item) => item.id === id)?.name ?? '未知主题'} /><button class="icon-text" onClick={() => props.store.toggleAssignment(activeSegment().id, 'A', id, false)}>×</button></div>}</For>
                <select class="native-select full" value="" onChange={(event) => event.currentTarget.value && props.store.toggleAssignment(activeSegment().id, 'A', event.currentTarget.value, true)}>
                  <option value="">＋ 给编码者 A 添加主题</option>
                  <For each={props.store.orderedThemes()}>{(item) => <option value={item.id}>{item.name}</option>}</For>
                </select>
              </div>
              <div class="coder-column">
                <div class="coder-header"><span class="avatar b">B</span><strong>{props.store.state.coderB}</strong></div>
                <For each={activeSegment().assignments.B} fallback={<div class="muted">未编码</div>}>{(id) => <div class="compare-chip"><Chip size="small" label={props.store.state.themes.find((item) => item.id === id)?.name ?? '未知主题'} /><button class="icon-text" onClick={() => props.store.toggleAssignment(activeSegment().id, 'B', id, false)}>×</button></div>}</For>
                <select class="native-select full" value="" onChange={(event) => event.currentTarget.value && props.store.toggleAssignment(activeSegment().id, 'B', event.currentTarget.value, true)}>
                  <option value="">＋ 给编码者 B 添加主题</option>
                  <For each={props.store.orderedThemes()}>{(item) => <option value={item.id}>{item.name}</option>}</For>
                </select>
              </div>
            </div>
            <Show when={props.store.hasDisagreement(activeSegment())} fallback={<div class="agreement">✓ 当前判断完全一致</div>}>
              <div class="disagreement">⚠ 当前判断存在分歧，两位编码者的记录都会保留。<button class="link-button" onClick={() => setSection('adjudicate')}>前往裁决 →</button></div>
            </Show>
            <label class="field-label">片段编码备忘
              <textarea class="native-textarea" value={segmentNote()} onInput={(event) => setSegmentNote(event.currentTarget.value)} onBlur={saveNote} placeholder="记录此片段的分歧处理或引文提示" />
            </label>
          </>}
        </Show>
      </Show>

      <Show when={section() === 'adjudicate'}>
        <div class="adj-summary">
          <div><strong>{props.store.pendingAdjudications().length}</strong><span>待裁决分歧</span></div>
          <div><strong>{props.store.settledAdjudications().length}</strong><span>生效中的裁决</span></div>
        </div>
        <div class="citation-heading">裁决待办 <span>{props.store.pendingAdjudications().length} 条</span></div>
        <div class="adj-queue">
          <For each={props.store.pendingAdjudications()} fallback={<div class="muted">没有待裁决的分歧。双方判断一致的片段不会进入队列。</div>}>
            {(item) => {
              const stale = () => {
                const adjudication = props.store.adjudicationFor(item.id);
                return adjudication && !props.store.isAdjudicationCurrent(adjudication);
              };
              return (
                <button class="adj-item" onClick={() => jumpToSegment(item)}>
                  <span>{item.time} · {item.speaker}</span>
                  <p>{item.text}</p>
                  <div class="adj-item-codes">
                    <span>{props.store.state.coderA}：{codesLabel(item.assignments.A)}</span>
                    <span>{props.store.state.coderB}：{codesLabel(item.assignments.B)}</span>
                  </div>
                  <Show when={stale()}><span class="adj-item-stale">此前裁决已失效，需重新裁决</span></Show>
                </button>
              );
            }}
          </For>
        </div>
        <Divider />
        <Show when={segment()} fallback={<div class="empty-state">从上方队列或正文中选择一个分歧片段进行裁决。</div>}>
          {(activeSegment) => (
            <Show
              when={props.store.hasDisagreement(activeSegment())}
              fallback={<div class="agreement">✓ 当前片段双方判断一致，无需裁决，也不占用待办队列。</div>}
            >
              <div class="compare-intro">采纳其中一方判断，或另立主题作为结论。结论与依据随编码结果一起导出；若判断再次变更，或主题合并拆分使双方趋于一致，该裁决会自动失效并回到待办。</div>
              <div class="adj-codes-review">
                <div><span class="avatar">A</span><div><strong>{props.store.state.coderA}</strong><span>{codesLabel(activeSegment().assignments.A)}</span></div></div>
                <div><span class="avatar b">B</span><div><strong>{props.store.state.coderB}</strong><span>{codesLabel(activeSegment().assignments.B)}</span></div></div>
              </div>

              <Show when={editing() ? null : currentAdj()}>
                {(adjudication) => (
                  <div class="adj-conclusion">
                    <div class="adj-conclusion-head">
                      <strong>裁决结论 · {resolutionLabel(adjudication().resolution)}</strong>
                      <span>{adjudication().decidedBy} · {formatTime(adjudication().decidedAt)}</span>
                    </div>
                    <div class="chip-line">
                      <For each={adjudication().themes} fallback={<span class="adj-no-code">结论：该片段不编码</span>}>{(id) => <Chip size="small" label={themeName(id)} />}</For>
                    </div>
                    <p class="adj-rationale">依据：{adjudication().rationale}</p>
                    <Button size="small" variant="outlined" onClick={startEditAdjudication}>重新裁决</Button>
                  </div>
                )}
              </Show>

              <Show when={editing() || !currentAdj()}>
                <div class="adj-form">
                  <Show when={staleAdj()}>
                    {(old) => (
                      <div class="adj-stale-note">
                        此前裁决（{old().decidedBy} · {formatTime(old().decidedAt)} · {resolutionLabel(old().resolution)}）已因判断或主题结构变更而失效。旧依据：{old().rationale}
                      </div>
                    )}
                  </Show>
                  <div class="adj-options">
                    <label><input type="radio" name="adj-resolution" checked={resolution() === 'A'} onChange={() => chooseResolution('A')} /><span>采纳 {props.store.state.coderA} 的判断（{codesLabel(activeSegment().assignments.A)}）</span></label>
                    <label><input type="radio" name="adj-resolution" checked={resolution() === 'B'} onChange={() => chooseResolution('B')} /><span>采纳 {props.store.state.coderB} 的判断（{codesLabel(activeSegment().assignments.B)}）</span></label>
                    <label><input type="radio" name="adj-resolution" checked={resolution() === 'custom'} onChange={() => chooseResolution('custom')} /><span>另立主题作为结论</span></label>
                  </div>
                  <Show when={resolution() === 'custom'}>
                    <div class="adj-theme-picker">
                      <For each={props.store.orderedThemes()}>{(theme) => (
                        <label><input type="checkbox" checked={customThemes().includes(theme.id)} onChange={(event) => setCustomThemes((items) => event.currentTarget.checked ? [...items, theme.id] : items.filter((id) => id !== theme.id))} /><span>{theme.name}</span></label>
                      )}</For>
                    </div>
                  </Show>
                  <label class="field-label">裁决依据（必填，随导出存档）
                    <textarea class="native-textarea" value={rationale()} onInput={(event) => setRationale(event.currentTarget.value)} placeholder="说明为何这样裁决：引文依据、编码册条目或讨论结论" />
                  </label>
                  <label class="field-label">裁决人
                    <div class="inline-input">
                      <input class="native-input" value={decidedBy()} onInput={(event) => setDecidedBy(event.currentTarget.value)} placeholder="签名" />
                      <Button size="small" onClick={() => setDecidedBy(props.store.state.coderA)}>{props.store.state.coderA}</Button>
                      <Button size="small" onClick={() => setDecidedBy(props.store.state.coderB)}>{props.store.state.coderB}</Button>
                    </div>
                  </label>
                  <div class="adj-submit">
                    <Button variant="contained" size="small" disabled={!canSubmitAdjudication()} onClick={submitAdjudication}>记录裁决结论</Button>
                    <Show when={editing()}><Button size="small" onClick={() => setEditing(false)}>取消</Button></Show>
                  </div>
                </div>
              </Show>
            </Show>
          )}
        </Show>
      </Show>

      <Show when={section() === 'audit'}>
        <div class="audit-summary">
          <div><strong>{props.store.state.audit.length}</strong><span>次最近操作</span></div>
          <div><strong>{citations().length}</strong><span>条当前主题引用</span></div>
        </div>
        <div class="audit-list">
          <For each={props.store.state.themes.filter((item) => item.definition || item.memo)}>{(item) => (
            <div class="citation" onClick={() => props.store.selectTheme(item.id)}>
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
