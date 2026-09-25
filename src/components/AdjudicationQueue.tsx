import { For, Show, createMemo } from 'solid-js';
import { Button, Chip, Paper, Typography } from '@suid/material';
import type { useCodingStore } from '../store/coding-store';
import { decisionLabel, themePathList } from '../utils/adjudication';

type Store = ReturnType<typeof useCodingStore>;

export default function AdjudicationQueue(props: { store: Store }) {
  const themeMap = createMemo(() => new Map(props.store.state.themes.map((theme) => [theme.id, theme])));
  const transcriptTitle = (id: string) => props.store.state.transcripts.find((item) => item.id === id)?.title ?? '';
  const queue = createMemo(() => props.store.adjudicationQueue());
  const pending = createMemo(() => queue().filter((entry) => entry.queueKind === 'pending').length);
  const stale = createMemo(() => queue().filter((entry) => entry.queueKind === 'stale').length);
  const resolved = createMemo(() => queue().filter((entry) => entry.queueKind === 'resolved').length);

  const coderName = (coder: 'A' | 'B') => (coder === 'A' ? props.store.state.coderA : props.store.state.coderB);

  return (
    <Paper class="panel adjudication-panel" elevation={0}>
      <div class="panel-heading">
        <div>
          <Typography variant="overline">DISAGREEMENT QUEUE</Typography>
          <Typography variant="h6">分歧裁决待办</Typography>
        </div>
        <div class="queue-badges">
          <Chip size="small" color="error" label={`待裁决 ${pending()}`} />
          <Chip size="small" color="warning" label={`已失效 ${stale()}`} />
          <Chip size="small" color="success" label={`已裁决 ${resolved()}`} />
        </div>
      </div>
      <div class="queue-help">两位编码者判断不一致的片段进入队列；原本一致的片段不占用队列。裁决后若判断被改动，或主题合并/拆分使双方趋同，结论自动失效并回到这里。</div>
      <Show when={queue().length} fallback={<div class="queue-empty">当前没有编码分歧，双编码判断完全一致。</div>}>
        <div class="queue-list">
          <For each={queue()}>{(entry) => (
            <article class="queue-item" classList={{ pending: entry.queueKind === 'pending', stale: entry.queueKind === 'stale', resolved: entry.queueKind === 'resolved', closed: entry.queueKind === 'closed' }}>
              <div class="queue-item-main">
                <div class="queue-item-meta">
                  <span class="queue-status" data-kind={entry.queueKind}>
                    {entry.queueKind === 'pending' ? '待裁决' : entry.queueKind === 'stale' ? '已失效' : entry.queueKind === 'resolved' ? '已裁决' : '已趋同'}
                  </span>
                  <span class="segment-time">{entry.segment.time}</span>
                  <strong>{entry.segment.speaker}</strong>
                  <span class="queue-transcript">{transcriptTitle(entry.segment.transcriptId)}</span>
                </div>
                <p class="queue-text">{entry.segment.text}</p>
                <div class="queue-coders">
                  <div><span class="avatar">A</span><span class="coder-name">{coderName('A')}</span><em>{themePathList(entry.segment.assignments.A, themeMap())}</em></div>
                  <div><span class="avatar b">B</span><span class="coder-name">{coderName('B')}</span><em>{themePathList(entry.segment.assignments.B, themeMap())}</em></div>
                </div>
                <Show when={entry.queueKind === 'stale'}>
                  <div class="queue-stale-reason">↻ {entry.staleReason}。原结论已停止导出，需要重新裁决。</div>
                </Show>
                <Show when={entry.queueKind === 'resolved' && entry.adjudication}>
                  {(adjudication) => (
                    <div class="queue-ruling">
                      <div><strong>{decisionLabel(adjudication().decision)}</strong><span>{adjudication().adjudicator} · {new Date(adjudication().decidedAt).toLocaleString('zh-CN')}</span></div>
                      <div class="queue-ruling-themes">采纳主题：{themePathList(adjudication().resolvedThemeIds, themeMap())}</div>
                      <blockquote>依据：{adjudication().rationale}</blockquote>
                    </div>
                  )}
                </Show>
              </div>
              <div class="queue-item-actions">
                <Show when={entry.queueKind === 'pending' || entry.queueKind === 'stale'}>
                  <Button size="small" variant="contained" onClick={() => props.store.openSegmentInCompare(entry.segment.id, entry.segment.transcriptId)}>
                    {entry.queueKind === 'stale' ? '重新裁决' : '去裁决'}
                  </Button>
                </Show>
                <Show when={entry.queueKind === 'stale' && entry.segment.assignments.A.join('|') === entry.segment.assignments.B.join('|')}>
                  <Button size="small" variant="outlined" onClick={() => props.store.dismissAdjudication(entry.segment.id, '双方判断已趋同，确认无需裁决')}>确认已趋同</Button>
                </Show>
                <Show when={entry.queueKind === 'resolved'}>
                  <Button size="small" onClick={() => props.store.openSegmentInCompare(entry.segment.id, entry.segment.transcriptId)}>查看</Button>
                </Show>
                <Show when={entry.queueKind === 'closed'}>
                  <span class="queue-closed-note">{entry.adjudication?.staleReason ?? '双方判断已趋同'}</span>
                </Show>
              </div>
            </article>
          )}</For>
        </div>
      </Show>
    </Paper>
  );
}
