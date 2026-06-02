// D-06: History response types — exported for Phase 4 type-sharing
export type HistoryResultItem = {
  platform: string;
  payload: unknown;
};

export type HistoryItem = {
  id: string;
  prompt: string;
  createdAt: string;
  results: HistoryResultItem[];
};

export type HistoryResponse = {
  data: HistoryItem[];
  total: number;
  page: number;
  limit: number;
};
