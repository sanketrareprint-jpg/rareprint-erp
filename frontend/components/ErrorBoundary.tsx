/**
 * ErrorBoundary — catches React render-time crashes so one broken page
 * doesn't kill the whole app.
 *
 * Wrap any page (or section) that might throw during render:
 *
 *   // In app/some-page/page.tsx:
 *   import { ErrorBoundary } from '@/components/ErrorBoundary';
 *
 *   export default function SomePage() {
 *     return (
 *       <ErrorBoundary>
 *         <SomePageContent />
 *       </ErrorBoundary>
 *     );
 *   }
 *
 * Or wrap the entire shell in dashboard-shell.tsx to protect every page at once.
 *
 * You can pass a custom fallback:
 *   <ErrorBoundary fallback={<p>Custom error UI</p>}>
 *     ...
 *   </ErrorBoundary>
 */

'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred.';
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Log to console so Railway/Vercel logs capture it
    console.error('[ErrorBoundary] Caught render error:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 p-8">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-xl font-semibold text-gray-800">
            This section couldn&apos;t load
          </h2>
          <p className="text-sm text-gray-500 max-w-md text-center">
            {this.state.message}
          </p>
          <div className="flex gap-3">
            <button
              onClick={this.handleReset}
              className="px-4 py-2 text-sm bg-brand-600 text-white rounded hover:bg-brand-700"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
