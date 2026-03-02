import { useState, useEffect, useCallback } from 'react';

interface UseCooldownTimerOptions {
  onComplete?: () => void;
  autoStart?: boolean;
}

interface UseCooldownTimerReturn {
  timeLeft: number;
  isActive: boolean;
  start: (seconds: number) => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  formatTime: (seconds?: number) => string;
}

export const useCooldownTimer = (initialSeconds: number = 0, options: UseCooldownTimerOptions = {}): UseCooldownTimerReturn => {
  const { onComplete, autoStart = false } = options;

  const [timeLeft, setTimeLeft] = useState(initialSeconds);
  const [isActive, setIsActive] = useState(autoStart && initialSeconds > 0);

  useEffect(() => {
    if (!isActive || timeLeft <= 0) {
      if (timeLeft === 0 && onComplete) {
        onComplete();
      }
      return;
    }

    const timer = setTimeout(() => {
      setTimeLeft((prev) => {
        const newTime = prev - 1;
        if (newTime <= 0) {
          setIsActive(false);
          return 0;
        }
        return newTime;
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, [timeLeft, isActive, onComplete]);

  const start = useCallback((seconds: number) => {
    setTimeLeft(seconds);
    setIsActive(true);
  }, []);

  const pause = useCallback(() => {
    setIsActive(false);
  }, []);

  const resume = useCallback(() => {
    if (timeLeft > 0) {
      setIsActive(true);
    }
  }, [timeLeft]);

  const reset = useCallback(() => {
    setTimeLeft(0);
    setIsActive(false);
  }, []);

  const formatTime = useCallback(
    (seconds?: number): string => {
      const timeToFormat = seconds !== undefined ? seconds : timeLeft;
      const minutes = Math.floor(timeToFormat / 60);
      const remainingSeconds = timeToFormat % 60;
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    },
    [timeLeft],
  );

  return {
    timeLeft,
    isActive,
    start,
    pause,
    resume,
    reset,
    formatTime,
  };
};
