import { memo, type ReactNode } from "react";

import {
  getTxtSpreadStart,
  type TxtPage,
  type TxtPageFragment,
  type TxtSpreadMode,
} from "./TxtPaginator";

export interface TxtPageWindowProps {
  currentPageIndex: number;
  pages: readonly TxtPage[];
  renderFragment: (fragment: TxtPageFragment) => ReactNode;
  spreadMode: TxtSpreadMode;
}

export const TxtPageWindow = memo(function TxtPageWindow({
  currentPageIndex,
  pages,
  renderFragment,
  spreadMode,
}: TxtPageWindowProps) {
  const spreadSize = spreadMode === "double" ? 2 : 1;
  const currentSpreadStart = getTxtSpreadStart(currentPageIndex, spreadMode);
  const spreadStarts = [
    currentSpreadStart - spreadSize,
    currentSpreadStart,
    currentSpreadStart + spreadSize,
  ].filter((start) => start >= 0 && start < pages.length);

  return (
    <div
      className={`reader-txt-page-window reader-txt-page-window--${spreadMode}`}
      data-rendered-spread-mode={spreadMode}
      data-rendered-page-count={spreadStarts.reduce(
        (count, start) => count + Math.min(spreadSize, pages.length - start),
        0,
      )}
    >
      {spreadStarts.map((spreadStart) => {
        const isCurrent = spreadStart === currentSpreadStart;
        return (
          <section
            key={spreadStart}
            className="reader-txt-spread"
            data-spread-start={spreadStart}
            data-window-state={isCurrent ? "current" : "adjacent"}
            hidden={!isCurrent}
            aria-hidden={isCurrent ? undefined : "true"}
          >
            {pages.slice(spreadStart, spreadStart + spreadSize).map((page) => (
              <article
                key={page.index}
                className="reader-txt-page"
                data-page-index={page.index}
                data-page-start={page.startCharOffset}
                data-page-end={page.endCharOffset}
              >
                {page.fragments.map((fragment) => {
                  const text = fragment.text.slice(
                    fragment.startInBlock,
                    fragment.endInBlock,
                  );
                  const charOffset = fragment.charOffset + fragment.startInBlock;
                  const Tag = fragment.kind === "heading" ? "h2" : "p";
                  return (
                    <Tag
                      key={`${fragment.id}-${fragment.startInBlock}`}
                      className={`reader-virtual-row reader-virtual-row--${fragment.kind} reader-txt-page-fragment reader-txt-page-fragment--${fragment.kind}`}
                      data-chapter-id={fragment.chapterId}
                      data-char-offset={charOffset}
                      data-reader-block-text={text}
                    >
                      {renderFragment({
                        ...fragment,
                        charOffset,
                        endInBlock: text.length,
                        startInBlock: 0,
                        text,
                      })}
                    </Tag>
                  );
                })}
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
});
