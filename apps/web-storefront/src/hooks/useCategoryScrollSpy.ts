import { useCallback, useEffect, useRef, useState } from 'react';

type CategoryTarget = {
  id: string;
  slug: string;
};

export type SectionGeometry = {
  id: string;
  top: number;
  bottom: number;
};

type PageGeometry = {
  scrollY: number;
  viewportHeight: number;
  documentHeight: number;
};

const ACTIVE_LINE_OFFSET = 96;
const SCROLL_SELECTION_TIMEOUT_MS = 1_500;

export function collectCategorySections<T>(
  categories: CategoryTarget[],
  resolveElement: (slug: string) => T | null,
) {
  return categories.flatMap((category) => {
    const element = resolveElement(category.slug);
    return element ? [{ id: category.id, element }] : [];
  });
}

export function shouldHoldPendingSelection(
  pendingId: string,
  sections: SectionGeometry[],
  nextActiveId: string | undefined,
  activeLineOffset = ACTIVE_LINE_OFFSET,
) {
  const pendingGeometry = sections.find((section) => section.id === pendingId);
  const pendingReachedActiveLine = Boolean(
    pendingGeometry
    && pendingGeometry.top <= activeLineOffset + 4
    && pendingGeometry.bottom > activeLineOffset,
  );

  return !pendingReachedActiveLine && nextActiveId !== pendingId;
}

export function resolveActiveCategoryId(
  sections: SectionGeometry[],
  page: PageGeometry,
  activeLineOffset = ACTIVE_LINE_OFFSET,
) {
  if (sections.length === 0) return undefined;

  const isAtPageBottom = page.scrollY + page.viewportHeight >= page.documentHeight - 2;
  if (isAtPageBottom) return sections[sections.length - 1]?.id;

  let activeSection = sections[0];
  for (const section of sections) {
    if (section.top <= activeLineOffset) {
      activeSection = section;
      continue;
    }

    break;
  }

  return activeSection?.id;
}

export function useCategoryScrollSpy(categories: CategoryTarget[]) {
  const [activeCategoryId, setActiveCategoryId] = useState<string | undefined>(categories[0]?.id);
  const pendingSelectionRef = useRef<string | null>(null);
  const selectionTimeoutRef = useRef<number | undefined>();
  const recomputeRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const sections = collectCategorySections(categories, (slug) => document.getElementById(slug));

    if (sections.length === 0) {
      pendingSelectionRef.current = null;
      setActiveCategoryId(undefined);
      return;
    }

    setActiveCategoryId((current) =>
      current && sections.some((section) => section.id === current) ? current : sections[0]?.id,
    );

    const recompute = () => {
      const geometries = sections.map(({ id, element }) => {
        const rect = element.getBoundingClientRect();
        return { id, top: rect.top, bottom: rect.bottom };
      });
      const nextActiveId = resolveActiveCategoryId(geometries, {
        scrollY: window.scrollY,
        viewportHeight: window.innerHeight,
        documentHeight: document.documentElement.scrollHeight,
      });
      const pendingId = pendingSelectionRef.current;

      if (pendingId) {
        if (shouldHoldPendingSelection(pendingId, geometries, nextActiveId)) return;

        pendingSelectionRef.current = null;
        if (selectionTimeoutRef.current !== undefined) {
          window.clearTimeout(selectionTimeoutRef.current);
          selectionTimeoutRef.current = undefined;
        }
      }

      setActiveCategoryId(nextActiveId);
    };

    recomputeRef.current = recompute;
    const observer = new IntersectionObserver(recompute, {
      rootMargin: `-${ACTIVE_LINE_OFFSET}px 0px -45% 0px`,
      threshold: [0, 0.01, 0.25, 0.5, 0.75, 1],
    });
    sections.forEach(({ element }) => observer.observe(element));
    recompute();

    return () => {
      observer.disconnect();
      recomputeRef.current = () => undefined;
    };
  }, [categories]);

  useEffect(() => () => {
    if (selectionTimeoutRef.current !== undefined) {
      window.clearTimeout(selectionTimeoutRef.current);
    }
  }, []);

  const selectCategory = useCallback((categoryId: string) => {
    pendingSelectionRef.current = categoryId;
    setActiveCategoryId(categoryId);

    if (selectionTimeoutRef.current !== undefined) {
      window.clearTimeout(selectionTimeoutRef.current);
    }
    selectionTimeoutRef.current = window.setTimeout(() => {
      pendingSelectionRef.current = null;
      selectionTimeoutRef.current = undefined;
      recomputeRef.current();
    }, SCROLL_SELECTION_TIMEOUT_MS);
  }, []);

  return { activeCategoryId, selectCategory };
}
