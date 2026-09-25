export type CoderId = 'A' | 'B';

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

export type AdjudicationResolution = 'A' | 'B' | 'custom';

export interface Adjudication {
  id: string;
  segmentId: string;
  /** 裁决落笔时双方判断的快照（排序后的主题 id），用于检测结论是否过期 */
  basisA: string[];
  basisB: string[];
  /** 采纳 A 方 / 采纳 B 方 / 另立主题 */
  resolution: AdjudicationResolution;
  /** 最终采纳的主题 id 集合；空数组表示结论是“不编码” */
  themes: string[];
  rationale: string;
  decidedBy: string;
  decidedAt: string;
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
