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

function loadInsightBoard(): InsightBoard {
  try {
    const raw = localStorage.getItem(INSIGHT_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as InsightBoard;
  } catch {
    // ignore
  }
  return { items: [], memos: [] };
}

const initialState: AppState = {
  selectedSchool: null,
  selectedVenue: null,
  selectedPerformance: null,
  insightBoard: loadInsightBoard(),
};

// ---------- Reducer ----------
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SELECT_SCHOOL':
      return { ...state, selectedSchool: action.payload, selectedVenue: null, selectedPerformance: null };
    case 'SELECT_VENUE':
      return { ...state, selectedVenue: action.payload, selectedPerformance: null };
    case 'SELECT_PERFORMANCE':
      return { ...state, selectedPerformance: action.payload };

    case 'ADD_INSIGHT_ITEM': {
      const already = state.insightBoard.items.some(
        i => i.id === action.payload.id && i.type === action.payload.type
      );
      if (already) return state;
      const updated = {
        ...state.insightBoard,
        items: [...state.insightBoard.items, action.payload],
      };
      saveInsightBoard(updated);
      return { ...state, insightBoard: updated };
    }
    case 'REMOVE_INSIGHT_ITEM': {
      const updated = {
        ...state.insightBoard,
        items: state.insightBoard.items.filter(i => i.id !== action.payload),
      };
      saveInsightBoard(updated);
      return { ...state, insightBoard: updated };
    }
    case 'ADD_INSIGHT_MEMO': {
      const updated = {
        ...state.insightBoard,
        memos: [...state.insightBoard.memos, action.payload],
      };
      saveInsightBoard(updated);
      return { ...state, insightBoard: updated };
    }
    case 'UPDATE_INSIGHT_MEMO': {
      const updated = {
        ...state.insightBoard,
        memos: state.insightBoard.memos.map(m =>
          m.id === action.payload.id ? action.payload : m
        ),
      };
      saveInsightBoard(updated);
      return { ...state, insightBoard: updated };
    }
    case 'DELETE_INSIGHT_MEMO': {
      const updated = {
        ...state.insightBoard,
        memos: state.insightBoard.memos.filter(m => m.id !== action.payload),
      };
      saveInsightBoard(updated);
      return { ...state, insightBoard: updated };
    }
    case 'LOAD_INSIGHT_BOARD':
      return { ...state, insightBoard: action.payload };

    default:
      return state;
  }
}

function saveInsightBoard(board: InsightBoard) {
  try {
    localStorage.setItem(INSIGHT_STORAGE_KEY, JSON.stringify(board));
  } catch {
    // ignore
  }
}

// ---------- Context ----------
interface AppContextValue {
  state: AppState;
  selectSchool: (school: School | null) => void;
  selectVenue: (venue: Venue | null) => void;
  selectPerformance: (performance: Performance | null) => void;
  addInsightItem: (item: InsightItem) => void;
  removeInsightItem: (id: string) => void;
  addInsightMemo: (content: string) => void;
  updateInsightMemo: (id: string, content: string) => void;
  deleteInsightMemo: (id: string) => void;
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

  const addInsightMemo = useCallback((content: string) => {
    const memo: InsightMemo = {
      id: crypto.randomUUID(),
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
