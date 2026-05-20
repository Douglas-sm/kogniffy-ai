"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { GameEngine } from "@/game/engine/GameEngine";

interface GameCanvasProps {
  className?: string;
}

export function GameCanvas({ className }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const engine = new GameEngine(canvas, {
      onComplete: () => router.push("/report")
    });

    canvas.focus();

    return () => {
      engine.destroy();
    };
  }, [router]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      tabIndex={0}
      role="img"
      aria-label="Jogo Kogniffy AI em Canvas"
    />
  );
}
