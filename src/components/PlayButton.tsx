"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface PlayButtonProps {
  className: string;
  href: string;
  spinnerClassName: string;
}

export function PlayButton({ className, href, spinnerClassName }: PlayButtonProps) {
  const router = useRouter();
  const frameRef = useRef<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const loading = isLoading || isPending;

  useEffect(() => {
    router.prefetch(href);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [href, router]);

  const handleClick = () => {
    if (loading) {
      return;
    }

    setIsLoading(true);
    frameRef.current = window.requestAnimationFrame(() => {
      startTransition(() => {
        router.push(href);
      });
    });
  };

  return (
    <button
      type="button"
      className={className}
      aria-busy={loading}
      aria-label={loading ? "Carregando o jogo" : "Jogar Kogniffy AI"}
      disabled={loading}
      onClick={handleClick}
    >
      {loading ? (
        <>
          <span className={spinnerClassName} aria-hidden="true" />
          <span>Carregando...</span>
        </>
      ) : (
        <>
          <span>Jogar</span>
          <span aria-hidden="true">→</span>
        </>
      )}
    </button>
  );
}
