import type { Adjudication, CoderId, Segment, Theme } from '../types';

/** 同一编码者的两组主题判断是否一致（顺序无关） */
export const sameAssignment = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

/** 两位编码者对同一片段的判断是否存在分歧 */
export const hasDisagreement = (segment: Segment) =>
  !sameAssignment(segment.assignments.A, segment.assignments.B);

export const sortIds = (ids: string[]) => [...ids].sort((a, b) => a.localeCompare(b));

export type AdjudicationEvaluation =
  | { kind: 'valid' }
  | { kind: 'converged' }
  | { kind: 'changed'; changedCoder: CoderId | 'both' };

/**
 * 判断一条 active 裁决在当前编码状态下是否仍然有效。
 * - 双方看法已趋于一致 → converged（主题合并/拆分后最常见）
 * - 任一方在裁决后改动了判断 → changed
 * 两者同时发生时优先报 converged。
 */
export const evaluateAdjudication = (
  adjudication: Adjudication,
  segment: Segment | undefined
): AdjudicationEvaluation => {
  if (!segment) return { kind: 'converged' };
  if (!hasDisagreement(segment)) return { kind: 'converged' };
  const changedA = !sameAssignment(adjudication.snapshotA ?? adjudication.originalA ?? segment.assignments.A, segment.assignments.A);
  const changedB = !sameAssignment(adjudication.snapshotB ?? adjudication.originalB ?? segment.assignments.B, segment.assignments.B);
  if (changedA && changedB) return { kind: 'changed', changedCoder: 'both' };
  if (changedA) return { kind: 'changed', changedCoder: 'A' };
  if (changedB) return { kind: 'changed', changedCoder: 'B' };
  return { kind: 'valid' };
};

export const staleReasonText = (adjudication: Adjudication, coderA: string, coderB: string): string => {
  if (adjudication.staleReason) return adjudication.staleReason;
  return '';
};

/** 当前有效（active 且未失效）的裁决 */
export const isAdjudicationActive = (adjudication: Adjudication, segment: Segment | undefined) =>
  adjudication.status === 'active' && evaluateAdjudication(adjudication, segment).kind === 'valid';

/** 每个片段的最新一条裁决记录 */
export const latestAdjudicationBySegment = (adjudications: Adjudication[]) => {
  const map = new Map<string, Adjudication>();
  adjudications.forEach((item) => {
    const existing = map.get(item.segmentId);
    if (!existing || item.decidedAt > existing.decidedAt) map.set(item.segmentId, item);
  });
  return map;
};

export interface QueueEntry {
  segment: Segment;
  /** pending：从未裁决或裁决已失效；resolved：当前裁决有效；closed：双方已趋同并确认 */
  queueKind: 'pending' | 'stale' | 'resolved' | 'closed';
  adjudication: Adjudication | null;
  staleReason?: string;
}

/**
 * 裁决待办队列。
 * 双方原本一致、且从未产生过裁决的片段不占用队列。
 */
export const buildAdjudicationQueue = (
  segments: Segment[],
  adjudications: Adjudication[]
): QueueEntry[] => {
  const latest = latestAdjudicationBySegment(adjudications);
  const entries: QueueEntry[] = [];
  segments.forEach((segment) => {
    const adjudication = latest.get(segment.id) ?? null;
    const disagreement = hasDisagreement(segment);
    if (!adjudication) {
      if (disagreement) entries.push({ segment, queueKind: 'pending', adjudication: null });
      return;
    }
    if (adjudication.status === 'closed') {
      // 关闭后又重新出现分歧，重新进入待办
      if (disagreement) entries.push({ segment, queueKind: 'pending', adjudication });
      else entries.push({ segment, queueKind: 'closed', adjudication });
      return;
    }
    const evaluation = evaluateAdjudication(adjudication, segment);
    if (evaluation.kind === 'valid') entries.push({ segment, queueKind: 'resolved', adjudication });
    else if (evaluation.kind === 'converged') entries.push({
      segment,
      queueKind: 'stale',
      adjudication,
      staleReason: '主题合并或拆分后双方判断已趋同，裁决自动失效'
    });
    else entries.push({
      segment,
      queueKind: 'stale',
      adjudication,
      staleReason: evaluation.kind === 'changed'
        ? `裁决后${evaluation.changedCoder === 'both' ? '两位编码者' : `编码者 ${evaluation.changedCoder}`}的判断被改动，裁决自动失效`
        : '裁决已失效'
    });
  });
  const weight = { pending: 0, stale: 1, resolved: 2, closed: 3 } as const;
  return entries
    .sort((a, b) => a.segment.order - b.segment.order)
    .sort((a, b) => weight[a.queueKind] - weight[b.queueKind]);
};

export const themePath = (themeId: string, themeMap: Map<string, Theme>): string => {
  const names: string[] = [];
  let current = themeMap.get(themeId);
  let guard = 0;
  while (current && guard < 20) {
    names.unshift(current.name);
    current = current.parentId ? themeMap.get(current.parentId) : undefined;
    guard += 1;
  }
  return names.length ? names.join(' / ') : '已删除主题';
};

export const themePathList = (themeIds: string[], themeMap: Map<string, Theme>) =>
  themeIds.length ? themeIds.map((id) => themePath(id, themeMap)).join(' | ') : '未编码';

export const decisionLabel = (decision: Adjudication['decision']) =>
  decision === 'adoptA' ? '采纳编码者 A 的判断' : decision === 'adoptB' ? '采纳编码者 B 的判断' : '研究者另立主题';

/** 导出用：只保留当前有效的裁决结论，过期/已关闭结论一律剔除 */
export const activeAdjudicationsForExport = (
  segments: Segment[],
  adjudications: Adjudication[]
): Adjudication[] => {
  const segmentMap = new Map(segments.map((segment) => [segment.id, segment]));
  return adjudications
    .filter((item) => item.status === 'active')
    .filter((item) => evaluateAdjudication(item, segmentMap.get(item.segmentId)).kind === 'valid')
    .map((item) => ({
      id: item.id,
      segmentId: item.segmentId,
      decision: item.decision,
      resolvedThemeIds: item.resolvedThemeIds,
      rationale: item.rationale,
      adjudicator: item.adjudicator,
      decidedAt: item.decidedAt
    })) as Adjudication[];
};
