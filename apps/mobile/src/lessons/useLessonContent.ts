import { useEffect, useState } from "react";
import type { LessonContent } from "@pawcue/domain";
import { loadLessonContent, type ContentSource } from "./lesson-repository";

export interface LessonContentQuery {
  content: LessonContent | null;
  source: ContentSource | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Loads a lesson's content aggregate.
 *
 * Hand-written rather than a TanStack Query hook because this is a single read with its own offline fallback
 * already handled in the repository — the cache tier that a query library would provide is the very thing
 * `loadLessonContent` implements against AsyncStorage, and layering a second cache over it would leave two
 * answers to "is this lesson available offline?".
 */
export function useLessonContent(slug: string | undefined): LessonContentQuery {
  const [state, setState] = useState<LessonContentQuery>({
    content: null,
    source: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!slug) {
      setState({
        content: null,
        source: null,
        loading: false,
        error: new Error("No lesson specified"),
      });
      return;
    }

    let active = true;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    loadLessonContent(slug)
      .then((result) => {
        // Guarded so a slow fetch for a lesson the user has already navigated away from cannot overwrite the
        // content of the one they are now looking at.
        if (!active) return;
        setState({
          content: result.content,
          source: result.source,
          loading: false,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({
          content: null,
          source: null,
          loading: false,
          error: error instanceof Error ? error : new Error("Unknown error"),
        });
      });

    return () => {
      active = false;
    };
  }, [slug]);

  return state;
}
