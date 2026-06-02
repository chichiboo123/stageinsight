import styles from './StepProgress.module.css';

export interface StepProgressProps {
  /** 현재 학교가 선택되었는지 */
  hasSchool: boolean;
  /** 현재 공연장이 선택되었는지 */
  hasVenue: boolean;
  /** 공연 대시보드(3단계)에 머무르고 있는지 */
  onDashboard: boolean;
  onStep1: () => void;   // 학교 검색
  onStep2: () => void;   // 공연장 선택
  onStep3: () => void;   // 공연·교육과정
}

type Status = 'done' | 'current' | 'todo';

/**
 * 검색 절차를 한눈에 보여주는 단계 표시기 (KRDS 프로세스/스텝 패턴).
 * - 완료한 단계는 클릭해 되돌아갈 수 있다.
 * - 현재 단계는 aria-current="step"으로 표시해 스크린리더 접근성을 확보한다.
 */
export function StepProgress({
  hasSchool, hasVenue, onDashboard, onStep1, onStep2, onStep3,
}: StepProgressProps) {
  // 단계별 상태 계산
  const step3Status: Status = onDashboard ? 'current' : 'todo';
  const step2Status: Status = hasVenue ? 'done' : hasSchool && !onDashboard ? 'current' : 'todo';
  const step1Status: Status = hasSchool ? 'done' : 'current';

  const steps: Array<{
    n: number; label: string; hint: string; status: Status; onClick: () => void; clickable: boolean;
  }> = [
    { n: 1, label: '학교 검색', hint: '학교를 찾으세요', status: step1Status, onClick: onStep1, clickable: true },
    { n: 2, label: '공연장 선택', hint: '주변 공연장', status: step2Status, onClick: onStep2, clickable: hasSchool },
    { n: 3, label: '공연 · 교육과정', hint: '연계 자료 보기', status: step3Status, onClick: onStep3, clickable: hasVenue },
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
            >
              <span className={styles.badge}>
                {s.status === 'done' ? '✓' : s.n}
              </span>
              <span className={styles.labels}>
                <span className={styles.label}>{s.label}</span>
                <span className={styles.hint}>{s.hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
