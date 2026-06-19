"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, Undo2, X, Check } from "lucide-react";

const PEN_COLORS = ["#1f2937", "#dc2626", "#2563eb", "#16a34a", "#d97706"];
const CANVAS_W = 900;
const CANVAS_H = 600;

// 구절별 자유낙서(그림 메모). PNG dataURL 로 저장. 포인터 이벤트(마우스·터치·펜) 지원.
export function DrawingCanvas({
  title,
  initialPng,
  onSave,
  onClose,
}: {
  title: string;
  initialPng?: string;
  onSave: (png: string) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [color, setColor] = useState(PEN_COLORS[0]);
  const [width, setWidth] = useState(3);
  const [erase, setErase] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    if (initialPng) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height);
      img.src = initialPng;
    }
  }, [initialPng]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    drawing.current = true;
    last.current = pos(e);
    canvasRef.current!.setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.strokeStyle = erase ? "#ffffff" : color;
    ctx.lineWidth = erase ? 24 : width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.current!.x, last.current!.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  }
  function up() {
    drawing.current = false;
    last.current = null;
  }
  function clear() {
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60 p-3 sm:p-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 rounded-xl bg-white p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">{title} · 그림 메모</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {PEN_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => { setColor(c); setErase(false); }}
              className={`h-6 w-6 rounded-full border-2 ${color === c && !erase ? "border-gray-800" : "border-transparent"}`}
              style={{ backgroundColor: c }}
              aria-label={`색 ${c}`}
            />
          ))}
          <input type="range" min={1} max={12} value={width} onChange={(e) => setWidth(Number(e.target.value))} className="ml-1 w-24" />
          <Button type="button" variant="outline" size="sm" onClick={() => setErase((v) => !v)} className={erase ? "bg-gray-200" : ""}>
            <Eraser size={14} /> 지우개
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={clear}>
            <Undo2 size={14} /> 전체 지우기
          </Button>
        </div>

        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          className="aspect-[3/2] w-full touch-none rounded-md border border-gray-300 bg-white"
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>취소</Button>
          <Button type="button" onClick={() => onSave(canvasRef.current!.toDataURL("image/png"))}>
            <Check size={14} /> 저장
          </Button>
        </div>
      </div>
    </div>
  );
}
