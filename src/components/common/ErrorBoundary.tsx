import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    // localStorage 손상 가능성 대비 초기화 후 재시작
    try {
      localStorage.removeItem('stageinsight-page');
      localStorage.removeItem('stageinsight-school');
      localStorage.removeItem('stageinsight-venue');
    } catch { /* ignore */ }
    this.setState({ hasError: false, error: null });
    window.location.href = window.location.pathname;
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px',
            textAlign: 'center',
            background: '#EFF6FF',
            color: '#1E3A5F',
            fontFamily: "'Pretendard GOV', 'Pretendard', sans-serif",
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>⚠️</div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '12px', color: '#1E3A5F' }}>
            앱을 불러오는 중 문제가 발생했습니다
          </h2>
          <p style={{ fontSize: '14px', color: '#3B5A8A', marginBottom: '8px', maxWidth: '480px', lineHeight: '1.7' }}>
            일시적인 오류입니다. 아래 버튼을 눌러 초기화하거나 페이지를 새로고침해 주세요.
          </p>
          {this.state.error && (
            <pre
              style={{
                fontSize: '11px', color: '#7EA8CC', background: '#DBEAFE',
                padding: '10px 14px', borderRadius: '8px', margin: '12px 0',
                maxWidth: '560px', overflowX: 'auto', textAlign: 'left',
                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}
            >
              {this.state.error.message}
            </pre>
          )}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '8px' }}>
            <button
              onClick={this.handleReset}
              style={{
                padding: '10px 24px', background: '#3B82F6', color: '#fff',
                border: 'none', borderRadius: '10px', fontSize: '14px',
                fontWeight: 600, cursor: 'pointer',
              }}
            >
              초기화 후 재시작
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 24px', background: 'transparent', color: '#3B82F6',
                border: '1.5px solid #3B82F6', borderRadius: '10px', fontSize: '14px',
                fontWeight: 600, cursor: 'pointer',
              }}
            >
              새로고침
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
