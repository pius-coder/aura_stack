/**
 * `<AuraErrorBoundary>` — displays errors in a shadcn Card.
 */
"use client";

import { Component, type ReactNode } from "react";
import { Button } from "@/aura/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/aura/ui/card";

export interface AuraErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class AuraErrorBoundary extends Component<AuraErrorBoundaryProps, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive">Une erreur est survenue</CardTitle>
            <CardDescription>{this.state.error.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" onClick={this.reset}>
              Réessayer
            </Button>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}
