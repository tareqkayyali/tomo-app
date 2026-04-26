import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { captureError } from '../services/errorTracker';
import { colors } from '../theme/colors';

interface Props {
  children: ReactNode;
  traceId?: string;
  screen?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Top-level error boundary that catches unhandled JS errors
 * and shows a branded recovery screen instead of a white crash.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console in all environments so crash reporters can pick it up
    console.error('ErrorBoundary caught:', error, info.componentStack);
    captureError(error, {
      traceId: this.props.traceId,
      screen: this.props.screen ?? 'global',
      feature: 'error_boundary',
      metadata: {
        componentStack: info.componentStack,
      },
    });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.container}>
        <Text style={styles.emoji}>:(</Text>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.subtitle}>
          Tomo hit an unexpected error. Tap below to try again.
        </Text>

        {__DEV__ && this.state.error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText} numberOfLines={8}>
              {this.state.error.toString()}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.button}
          onPress={this.handleReset}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emoji: {
    fontSize: 48,
    color: colors.accent,
    marginBottom: 16,
    fontFamily: 'Poppins_700Bold',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: 'Poppins_700Bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  errorBox: {
    backgroundColor: colors.creamSubtle,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    width: '100%',
  },
  errorText: {
    fontSize: 12,
    color: colors.error,
    fontFamily: 'Poppins_400Regular',
  },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 9999,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 0.5,
  },
});
