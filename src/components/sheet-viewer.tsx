"use client";

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { A4_WIDTH } from "@/components/document-sheet";

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

/**
 * Shows A4-width sheets inside the phone frame.
 *
 * The sheets are laid out at their true 794px width and scaled down to the
 * viewport, so type sizes and column widths stay exactly as they will print.
 * Above 100% the container scrolls and can be dragged, which is how the design
 * lets you read the small print on a phone.
 */
export function SheetViewer({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(A4_WIDTH);
  const [contentHeight, setContentHeight] = useState(0);
  const [zoom, setZoom] = useState(MIN_ZOOM);

  const measure = useCallback(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;

    const styles = getComputedStyle(scroller);
    const width =
      scroller.clientWidth -
      Number.parseFloat(styles.paddingLeft) -
      Number.parseFloat(styles.paddingRight);

    if (width > 0) setAvailable(width);
    setContentHeight(content.offsetHeight);
  }, []);

  useLayoutEffect(() => {
    measure();

    // Images inside the sheets load late and change the height; observe rather
    // than measure once.
    const observer = new ResizeObserver(measure);
    if (contentRef.current) observer.observe(contentRef.current);
    if (scrollRef.current) observer.observe(scrollRef.current);

    return () => observer.disconnect();
  }, [measure]);

  const scale = (available / A4_WIDTH) * zoom;
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (zoom === MIN_ZOOM) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    pan.current = {
      x: event.clientX,
      y: event.clientY,
      left: scroller.scrollLeft,
      top: scroller.scrollTop,
    };
    scroller.style.cursor = "grabbing";
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const start = pan.current;
    const scroller = scrollRef.current;
    if (!start || !scroller) return;
    scroller.scrollLeft = start.left - (event.clientX - start.x);
    scroller.scrollTop = start.top - (event.clientY - start.y);
  }

  function endPan() {
    const scroller = scrollRef.current;
    if (scroller) scroller.style.cursor = "";
    pan.current = null;
  }

  return (
    <>
      <div
        ref={scrollRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerLeave={endPan}
        className="no-scrollbar min-h-0 flex-1 overflow-auto px-4 pt-3 pb-6"
        style={{ cursor: zoom > MIN_ZOOM ? "grab" : "default" }}
      >
        {/* Reserves the scaled footprint; the transform alone does not affect layout. */}
        <div style={{ width: A4_WIDTH * scale, height: contentHeight * scale }}>
          <div
            ref={contentRef}
            className="flex flex-col gap-4 print:gap-0"
            style={{
              width: A4_WIDTH,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            {children}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-center gap-2 print:hidden">
        <button
          type="button"
          onClick={() => setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP))}
          disabled={zoom <= MIN_ZOOM}
          className="icon-btn h-8 w-8 text-base font-extrabold"
          aria-label="ย่อ"
        >
          −
        </button>
        <span className="min-w-11 text-center text-xs opacity-60">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP))}
          disabled={zoom >= MAX_ZOOM}
          className="icon-btn h-8 w-8 text-base font-extrabold"
          aria-label="ขยาย"
        >
          +
        </button>
      </div>
    </>
  );
}
