import styles from './StepProgress.module.css';

export interface StepProgressProps {
  /** 검색 모드 — 단계 라벨을 모드에 맞춰 표시 */
  mode: 'school' | 'performance';
  /** 현재 학교가 선택되었는지 */
  hasSchool: boolean;
  /** 현재 공연장이 선택되었는지 */
  hasVenue: boolean;
  /** 공연 대시보드(3단계)에 머무르고 있는지 */
  onDashboard: boolean;
  onStep1: () => void;   // 1단계 검색
  onStep2: () => void;   // 2단계
  onStep3: () => void;   // 공연·교육과정
}

type Status = 'done' | 'current' | 'todo';

/**
 * 검색 절차를 한눈에 보여주는 단계 표시기 (KRDS 프로세스/스텝 패턴).
 * - 모드(학교→공연장 / 작품→학교)에 따라 단계 라벨이 달라진다.
 * - 완료한 단계는 클릭해 되돌아갈 수 있고, 현재 단계는 aria-current="step"으로 표시한다.
 */
export function StepProgress({
  mode, hasSchool, hasVenue, onDashboard, onStep1, onStep2, onStep3,
}: StepProgressProps) {
  const steps: Array<{
    n: number; label: string; short: string; hint: string; status: Status; onClick: () => void; clickable: boolean;
  }> = mode === 'performance'
    ? [
        // 작품 → 학교 흐름: 작품 검색 → (인근 학교, 선택) → 공연·교육과정
        { n: 1, label: '작품 검색', short: '작품', hint: '작품을 찾으세요', status: onDashboard ? 'done' : 'current', onClick: onStep1, clickable: true },
        { n: 2, label: '인근 학교(선택)', short: '인근 학교', hint: '학교 선택은 선택사항', status: onDashboard ? 'done' : 'todo', onClick: onStep1, clickable: !onDashboard },
        { n: 3, label: '공연·교육과정', short: '교육과정', hint: '연계 자료·수업 설계', status: onDashboard ? 'current' : 'todo', onClick: onStep3, clickable: hasVenue },
      ]
    : [
        // 학교 → 공연장 흐름
        { n: 1, label: '학교 검색', short: '학교', hint: '학교를 찾으세요', status: hasSchool ? 'done' : 'current', onClick: onStep1, clickable: true },
        { n: 2, label: '공연장 선택', short: '공연장', hint: '주변 공연장', status: hasVenue ? 'done' : hasSchool && !onDashboard ? 'current' : 'todo', onClick: onStep2, clickable: hasSchool },
        { n: 3, label: '공연·교육과정', short: '교육과정', hint: '연계 자료 보기', status: onDashboard ? 'current' : 'todo', onClick: onStep3, clickable: hasVenue },
      ];

  return (
    <nav className={styles.wrap} aria-label="진행 단계">
      <ol className={styles.list}>
        {steps.map((s, i) => (
          <li key={s.n} className={styles.item}>
            {i > 0 && (
              <span
                className={`${styles.connector} ${steps[i - 1].status === 'done' ? styles.connectorDone : ''}`}
                aria-hidden="true"
              />
            )}
            <button
              type="button"
              className={`${styles.step} ${styles[s.status]}`}
              onClick={s.onClick}
              disabled={!s.clickable}
              aria-current={s.status === 'current' ? 'step' : undefined}
              aria-label={`${s.n}단계 ${s.label}`}
            >
              <span className={styles.badge}>
                {s.status === 'done' ? '✓' : s.n}
              </span>
              <span className={styles.labels}>
                <span className={styles.label}>{s.label}</span>
                <span className={styles.labelShort}>{s.short}</span>
                <span className={styles.hint}>{s.hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
