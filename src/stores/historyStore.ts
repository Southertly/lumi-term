import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface HistoryEntry {
  command: string;
  useCount: number;
  lastUsedAt: number; // Unix ms
}

const STORAGE_KEY = 'lumiterm_history_v2';
const MAX_ENTRIES = 1000;
const CLEANUP_SCORE_THRESHOLD = 0.05;

function frecencyScore(entry: HistoryEntry): number {
  const daysSince = (Date.now() - entry.lastUsedAt) / 86_400_000;
  return entry.useCount / Math.log(daysSince + 2);
}

function load(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function persist(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch { /* storage full */ }
}

export const useHistoryStore = defineStore('history', () => {
  const entries = ref<HistoryEntry[]>(load());

  function add(command: string) {
    const cmd = command.trim();
    if (!cmd) return;

    const existing = entries.value.find((e) => e.command === cmd);
    if (existing) {
      existing.useCount++;
      existing.lastUsedAt = Date.now();
    } else {
      entries.value.push({ command: cmd, useCount: 1, lastUsedAt: Date.now() });
    }

    if (entries.value.length > MAX_ENTRIES) cleanup();
    else persist(entries.value);
  }

  function search(query: string): HistoryEntry[] {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? entries.value.filter((e) => e.command.toLowerCase().includes(q))
      : entries.value;
    return [...filtered]
      .sort((a, b) => frecencyScore(b) - frecencyScore(a))
      .slice(0, 50);
  }

  function list(): HistoryEntry[] {
    return [...entries.value].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  }

  function cleanup() {
    entries.value = entries.value
      .filter((e) => frecencyScore(e) >= CLEANUP_SCORE_THRESHOLD)
      .sort((a, b) => frecencyScore(b) - frecencyScore(a))
      .slice(0, MAX_ENTRIES);
    persist(entries.value);
  }

  return { entries, add, search, list, cleanup };
});
