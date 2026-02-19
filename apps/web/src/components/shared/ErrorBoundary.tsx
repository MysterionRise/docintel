import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 p-8 text-center">
          <h1 className="text-xl font-bold text-red-400">Something went wrong</h1>
          <p className="max-w-md text-sm text-[var(--color-text-muted)]">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.assign('/');
            }}
            className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm text-white transition-colors hover:bg-[var(--color-primary-dark)]"
          >
            Return to Dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
