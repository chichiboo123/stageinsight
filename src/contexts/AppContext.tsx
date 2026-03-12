import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  type ReactNode,
} from 'react';
import type { School, Venue, Performance, InsightBoard, InsightItem, InsightMemo } from '../types';

// ---------- State ----------
interface AppState {
  selectedSchool: School | null;
  selectedVenue: Venue | null;
  selectedPerformance: Performance | null;
  insightBoard: InsightBoard;
}

// ---------- Actions ----------
type AppAction =
  | { type: 'SELECT_SCHOOL'; payload: School | null }
  | { type: 'SELECT_VENUE';  payload: Venue | null }
  | { type: 'SELECT_PERFORMANCE'; payload: Performance | null }
  | { type: 'ADD_INSIGHT_ITEM'; payload: InsightItem }
  | { type: 'REMOVE_INSIGHT_ITEM'; payload: string }
  | { type: 'ADD_INSIGHT_MEMO'; payload: InsightMemo }
  | { type: 'UPDATE_INSIGHT_MEMO'; payload: InsightMemo }
  | { type: 'DELETE_INSIGHT_MEMO'; payload: string }
  | { type: 'LOAD_INSIGHT_BOARD'; payload: InsightBoard };

// ---------- 초기 상태 ----------
const INSIGHT_STORAGE_KEY = 'stageinsight-board';
const SCHOOL_STORAGE_KEY  = 'stageinsight-school';
const VENUE_STORAGE_KEY   = 'stageinsight-venue';

function loadFromStorage(): InsightBoard {
  try {
    const raw = localStorage.getItem(INSIGHT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as InsightBoard;
      return {
        items: Array.isArray(parsed.items) ? parsed.items : [],
        memos: Array.isArray(parsed.memos)
          ? parsed.memos.map(m => ({
            ...m,
            performanceId: m.performanceId ?? null,
            performanceTitle: m.performanceTitle ?? null,
          }))
          : [],
      };
    }
  } catch { /* ignore */ }
  return { items: [], memos: [] };
}

function loadSchool(): School | null {
  try {
    const raw = localStorage.getItem(SCHOOL_STORAGE_KEY);
    return raw ? JSON.parse(raw) as School : null;
  } catch { return null; }
}

function loadVenue(): Venue | null {
  try {
    const raw = localStorage.getItem(VENUE_STORAGE_KEY);
    return raw ? JSON.parse(raw) as Venue : null;
  } catch { return null; }
}

const initialState: AppState = {
  selectedSchool: loadSchool(),
  selectedVenue: loadVenue(),
  selectedPerformance: null,
  insightBoard: loadFromStorage(),
};

// ---------- Reducer ----------
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SELECT_SCHOOL':
      saveSchool(action.payload); saveVenue(null);
      return { ...state, selectedSchool: action.payload, selectedVenue: null, selectedPerformance: null };
    case 'SELECT_VENUE':
      saveVenue(action.payload);
      return { ...state, selectedVenue: action.payload, selectedPerformance: null };
    case 'SELECT_PERFORMANCE':
      return { ...state, selectedPerformance: action.payload };

    case 'ADD_INSIGHT_ITEM': {
      const already = state.insightBoard.items.some(
        i => i.id === action.payload.id && i.type === action.payload.type
      );
      if (already) return state;
      const updated = { ...state.insightBoard, items: [...state.insightBoard.items, action.payload] };
      saveBoard(updated);
      return { ...state, insightBoard: updated };
    }
    case 'REMOVE_INSIGHT_ITEM': {
      const updated = { ...state.insightBoard, items: state.insightBoard.items.filter(i => i.id !== action.payload) };
      saveBoard(updated);
      return { ...state, insightBoard: updated };
    }
    case 'ADD_INSIGHT_MEMO': {
      const updated = { ...state.insightBoard, memos: [...state.insightBoard.memos, action.payload] };
      saveBoard(updated);
      return { ...state, insightBoard: updated };
    }
    case 'UPDATE_INSIGHT_MEMO': {
      const updated = {
        ...state.insightBoard,
        memos: state.insightBoard.memos.map(m => m.id === action.payload.id ? action.payload : m),
      };
      saveBoard(updated);
      return { ...state, insightBoard: updated };
    }
    case 'DELETE_INSIGHT_MEMO': {
      const updated = { ...state.insightBoard, memos: state.insightBoard.memos.filter(m => m.id !== action.payload) };
      saveBoard(updated);
      return { ...state, insightBoard: updated };
    }
    case 'LOAD_INSIGHT_BOARD':
      saveBoard(action.payload);
      return { ...state, insightBoard: action.payload };

    default:
      return state;
  }
}

function saveBoard(board: InsightBoard) {
  try { localStorage.setItem(INSIGHT_STORAGE_KEY, JSON.stringify(board)); } catch { /* ignore */ }
}
function saveSchool(school: School | null) {
  try {
    if (school) localStorage.setItem(SCHOOL_STORAGE_KEY, JSON.stringify(school));
    else localStorage.removeItem(SCHOOL_STORAGE_KEY);
  } catch { /* ignore */ }
}
function saveVenue(venue: Venue | null) {
  try {
    if (venue) localStorage.setItem(VENUE_STORAGE_KEY, JSON.stringify(venue));
    else localStorage.removeItem(VENUE_STORAGE_KEY);
  } catch { /* ignore */ }
}

// ---------- Context ----------
interface AppContextValue {
  state: AppState;
  selectSchool: (school: School | null) => void;
  selectVenue: (venue: Venue | null) => void;
  selectPerformance: (performance: Performance | null) => void;
  addInsightItem: (item: InsightItem) => void;
  removeInsightItem: (id: string) => void;
  addInsightMemo: (content: string, performanceId?: string | null, performanceTitle?: string | null) => void;
  updateInsightMemo: (id: string, content: string) => void;
  deleteInsightMemo: (id: string) => void;
  loadInsightBoard: (board: InsightBoard) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

// ---------- Provider ----------
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const selectSchool = useCallback((school: School | null) =>
    dispatch({ type: 'SELECT_SCHOOL', payload: school }), []);
  const selectVenue = useCallback((venue: Venue | null) =>
    dispatch({ type: 'SELECT_VENUE', payload: venue }), []);
  const selectPerformance = useCallback((performance: Performance | null) =>
    dispatch({ type: 'SELECT_PERFORMANCE', payload: performance }), []);

  const addInsightItem = useCallback((item: InsightItem) =>
    dispatch({ type: 'ADD_INSIGHT_ITEM', payload: item }), []);
  const removeInsightItem = useCallback((id: string) =>
    dispatch({ type: 'REMOVE_INSIGHT_ITEM', payload: id }), []);

  const addInsightMemo = useCallback((content: string, performanceId?: string | null, performanceTitle?: string | null) => {
    const memo: InsightMemo = {
      id: crypto.randomUUID(),
      performanceId: performanceId ?? null,
      performanceTitle: performanceTitle ?? null,
      content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    dispatch({ type: 'ADD_INSIGHT_MEMO', payload: memo });
  }, []);

  const updateInsightMemo = useCallback((id: string, content: string) => {
    const existing = state.insightBoard.memos.find(m => m.id === id);
    if (!existing) return;
    dispatch({
      type: 'UPDATE_INSIGHT_MEMO',
      payload: { ...existing, content, updatedAt: new Date().toISOString() },
    });
  }, [state.insightBoard.memos]);

  const deleteInsightMemo = useCallback((id: string) =>
    dispatch({ type: 'DELETE_INSIGHT_MEMO', payload: id }), []);

  const loadInsightBoard = useCallback((board: InsightBoard) =>
    dispatch({ type: 'LOAD_INSIGHT_BOARD', payload: board }), []);

  return (
    <AppContext.Provider value={{
      state,
      selectSchool,
      selectVenue,
      selectPerformance,
      addInsightItem,
      removeInsightItem,
      addInsightMemo,
      updateInsightMemo,
      deleteInsightMemo,
      loadInsightBoard,
    }}>
      {children}
    </AppContext.Provider>
  );
}

// ---------- Hook ----------
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
