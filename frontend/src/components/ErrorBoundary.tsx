'use client';

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { ExclamationTriangleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  section?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Production error logging can be added here
    if (process.env.NODE_ENV === 'development') {
      console.error(`[ErrorBoundary${this.props.section ? `: ${this.props.section}` : ''}]`, error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="glass rounded-xl p-6 text-center">
          <ExclamationTriangleIcon className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-dark-200 mb-1">
            {this.props.section ? `Error in ${this.props.section}` : 'Something went wrong'}
          </h3>
          <p className="text-xs text-dark-500 mb-4">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={this.handleReset}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-dark-700 hover:bg-dark-600 text-dark-200 text-sm font-medium transition-colors"
          >
            <ArrowPathIcon className="w-4 h-4" />
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
