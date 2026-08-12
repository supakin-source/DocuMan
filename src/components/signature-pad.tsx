"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

export type SignaturePadHandle = {
  /** PNG data URL, or null while the pad is untouched. */
  toDataUrl: () => string | null;
  clear: () => void;
};

/**
 * A canvas the user signs with a finger or a pointer.
 *
 * The bitmap is sized from the element's own box times the device pixel ratio,
 * so a stroke lands under the fingertip on any screen and the exported PNG is
 * not a blurry upscale of a 326px guess.
 */
export function SignaturePad({
  ref,
  height = 150,
  onChange,
}: {
  ref?: RefObject<SignaturePadHandle | null>;
  height?: number;
  /** Fires with true once anything has been drawn. */
  onChange?: (hasInk: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    if (width === 0) return;

    // Preserve what is already drawn across a resize (e.g. an orientation flip).
    const previous = hasInk ? canvas.toDataURL("image/png") : null;

    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#201e1d";

    if (previous) {
      const image = new Image();
      image.onload = () => ctx.drawImage(image, 0, 0, width, height);
      image.src = previous;
    }
  }, [height, hasInk]);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
    // Only re-attach on geometry changes; `resize` itself reads current ink.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  useImperativeHandle(ref, () => ({
    toDataUrl: () => (hasInk ? (canvasRef.current?.toDataURL("image/png") ?? null) : null),
    clear: () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasInk(false);
      onChange?.(false);
    },
  }));

  function pointAt(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: ReactPointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    // Keeps strokes tracking the finger even if it slides past the edge.
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const { x, y } = pointAt(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointAt(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    if (!hasInk) {
      setHasInk(true);
      onChange?.(true);
    }
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ height }}
      className="w-full touch-none border border-divider bg-white"
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      aria-label="พื้นที่ลงลายเซ็น"
    />
  );
}
