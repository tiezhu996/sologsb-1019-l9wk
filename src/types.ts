export type CoderId = 'A' | 'B';

/** 裁决采纳的判断来源：A 方 / B 方 / 研究者另立主题 */
export type AdjudicationDecision = 'adoptA' | 'adoptB' | 'custom';

export interface Theme {
  id: string;
  name: string;
  parentId: string | null;
  color: string;
  definition: string;
  memo: string;
  examples: string[];
}

export interface Segment {
  id: string;
  transcriptId: string;
  order: number;
  speaker: string;
  time: string;
  text: string;
  assignments: Record<CoderId, string[]>;
  note: string;
}

export interface Transcript {
  id: string;
  title: string;
  participant: string;
  importedAt: string;
  sourceName: string;
}

/**
 * 一条分歧裁决记录。
 * status:
 *  - active  裁决有效，结论随编码结果导出
 *  - stale   裁决后判断被改动，或主题合并/拆分后双方趋于一致，结论已失效并回到待办
 *  - closed 双方判断已趋同，研究者在待办队列里确认无需裁决
 */
export interface Adjudication {
  id: string;
  segmentId: string;
  decision: AdjudicationDecision;
  /** 裁决最终采纳的主题集合；custom 时可能包含裁决时新建的主题 */
  resolvedThemeIds: string[];
  /** 裁决时研究者写下的依据 */
  rationale: string;
  adjudicator: string;
  decidedAt: string;
  status: 'active' | 'stale' | 'closed';
  /** 失效或关闭时填写 */
  staleReason?: string;
  closedAt?: string;
  /** 失效瞬间双方的判断快照，用于界面展示“裁决后什么变了” */
  snapshotA?: string[];
  snapshotB?: string[];
  /** 裁决当时双方的判断快照 */
  originalA?: string[];
  originalB?: string[];
  /** 被新裁决取代（同一片段再次裁决）时指向新记录 */
  supersededById?: string;
}

export interface CodingState {
  revision: number;
  updatedAt: string;
  activeTranscriptId: string;
  activeSegmentId: string;
  activeThemeId: string;
  coderA: string;
  coderB: string;
  transcripts: Transcript[];
  segments: Segment[];
  themes: Theme[];
  adjudications: Adjudication[];
  audit: Array<{ id: string; at: string; action: string; detail: string }>;
}

export interface PersistedEnvelope {
  revision: number;
  updatedAt: string;
  writerId: string;
  state: CodingState;
}
