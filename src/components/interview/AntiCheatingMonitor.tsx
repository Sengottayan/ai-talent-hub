import { useEffect, useRef } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import { logger } from "@/lib/logger";

interface AntiCheatingMonitorProps {
  interviewId: string;
  email: string;
  candidateName: string;
  onViolationLimitReached?: () => void;
  isCompleted?: boolean;
  isInteractionActive?: boolean; // Is the candidate currently speaking?
  videoRef?: React.RefObject<HTMLVideoElement>; // Optional: pass camera stream for face detection
}

const AntiCheatingMonitor: React.FC<AntiCheatingMonitorProps> = ({
  interviewId,
  email,
  candidateName,
  onViolationLimitReached,
  isCompleted = false,
  isInteractionActive = false,
  videoRef,
}) => {
  const isUnloadingRef = useRef(false);
  const startBlurTimeRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const GRACE_PERIOD_MS = 5000; // 5 seconds grace period on start

  // Track visibility state to prevent duplicate events when blur + visibility fire together
  const isHiddenRef = useRef(false);

  // Face detection state refs (avoid stale closures inside setInterval)
  const faceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const multiFaceStateBuffer = useRef<boolean[]>([]);
  const noFaceStateBuffer = useRef<boolean[]>([]);
  const FACE_BUFFER_SIZE = 4; // Require 4 consecutive same-result frames before triggering
  const lastMultiFaceEventRef = useRef<number>(0);
  const lastNoFaceEventRef = useRef<number>(0);
  const FACE_EVENT_COOLDOWN_MS = 8000; // Min 8s between same face events to avoid spam

  // Helper to get relative time from interview start
  const getFormattedRelativeTime = (): string => {
    if (typeof window === "undefined") return "00:00";

    let startTime: number | null = null;
    try {
      const standardKey = `timer_start_${interviewId}`;
      const storedStandard = localStorage.getItem(standardKey);

      if (storedStandard) {
        startTime = parseInt(storedStandard, 10);
      } else {
        const scopedKey = `timer_start_${interviewId}_${email}`;
        const storedScoped = localStorage.getItem(scopedKey);
        if (storedScoped) startTime = parseInt(storedScoped, 10);
      }
    } catch (e) {
      logger.error("Failed to get timer start:", e);
    }

    if (!startTime) return "00:00";

    const now = Date.now();
    const diffMs = now - startTime;
    if (diffMs < 0) return "00:00";

    const totalSeconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  };

  // Send event to backend
  const sendEvent = async (eventType: string, extraData: any = {}) => {
    if (isCompleted) return;

    // Ignore events during grace period
    if (Date.now() - startTimeRef.current < GRACE_PERIOD_MS) {
      logger.log(`Ignoring ${eventType} during grace period`);
      return;
    }

    const timestampStr = getFormattedRelativeTime();

    // Get clientId from sessionStorage
    const clientId =
      typeof window !== "undefined"
        ? sessionStorage.getItem(`interview_client_id_${interviewId}`)
        : null;

    try {
      const { data } = await api.post(`/interviews/anti-cheating-event`, {
        interview_id: interviewId,
        email: email,
        candidate_name: candidateName,
        event_type: eventType,
        clientId: clientId,
        timestamp: new Date().toISOString(),
        timestamp_str: timestampStr,
        ...extraData,
      });

      // Handle response
      if (data.interview_status === "auto_completed") {
        toast.dismiss();
        toast.error("Interview ended due to repeated violations.", {
          id: "ac-violation-end",
          duration: 10000,
        });
        if (onViolationLimitReached) {
          onViolationLimitReached();
        }
        return;
      }

      // Show warnings
      const score = data.suspicious_score;
      const max = data.max_allowed_score;
      const violationsLeft = max - score;

      if (score > 0 && score < max) {
        let message = `Warning (${score}/${max}): Please stay on the interview tab.`;
        if (violationsLeft === 1) {
          message = `Critical Warning (${score}/${max}): One more violation will end the interview.`;
        }

        toast.warning(message, {
          id: "ac-warning",
          duration: 4000,
        });
      }
    } catch (error) {
      logger.error("Anti-cheating event error:", error);
    }
  };

  // Initial check on mount
  useEffect(() => {
    if (interviewId && email && !isCompleted) {
      sendEvent("window_focus");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewId, email]);

  // Tab visibility & window focus event listeners
  useEffect(() => {
    if (!interviewId || !email || isCompleted) return;

    const handleBeforeUnload = () => {
      isUnloadingRef.current = true;
    };

    const handleVisibilityChange = () => {
      if (isUnloadingRef.current) return;

      if (document.visibilityState === "hidden") {
        // Tab hidden: could be minimize, tab switch, or screen lock
        isHiddenRef.current = true;
        startBlurTimeRef.current = Date.now();
        sendEvent("visibility_hidden");
      } else {
        // Tab became visible again
        isHiddenRef.current = false;
        const duration = startBlurTimeRef.current
          ? Date.now() - startBlurTimeRef.current
          : 0;
        startBlurTimeRef.current = null;
        // Send focus event (no score penalty — just for logging)
        sendEvent("window_focus", { durationMs: duration });
      }
    };

    // *** KEY FIX: Only fire window_blur if the tab is still visible.
    // This prevents double-counting when minimizing (which fires both
    // visibilitychange=hidden AND window blur simultaneously).
    const handleBlur = () => {
      if (isUnloadingRef.current) return;

      // Delay to let visibilitychange fire first
      setTimeout(() => {
        // If tab is hidden, visibilitychange already handled it — skip
        if (document.visibilityState === "hidden") return;
        if (isUnloadingRef.current) return;

        // Tab is still visible but window lost focus (e.g. another app, DevTools)
        startBlurTimeRef.current = Date.now();
        sendEvent("window_blur");
      }, 300);
    };

    const handleFocus = () => {
      if (isUnloadingRef.current) return;
      // If visibility change already handled return-to-tab, skip
      if (isHiddenRef.current) return;

      const duration = startBlurTimeRef.current
        ? Date.now() - startBlurTimeRef.current
        : 0;
      startBlurTimeRef.current = null;
      sendEvent("window_focus", { durationMs: duration });
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewId, email, isCompleted]);

  // ============================================================
  // FACE DETECTION via canvas analysis on the camera video stream
  // ============================================================
  useEffect(() => {
    if (!videoRef || isCompleted) return;

    // Create an offscreen canvas for pixel analysis
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    faceCanvasRef.current = canvas;

    const DETECTION_INTERVAL_MS = 1500; // Check every 1.5 seconds

    const detectFaces = () => {
      const video = videoRef.current;
      if (!video || video.readyState < video.HAVE_ENOUGH_DATA) return;

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, 320, 240);
      const frame = ctx.getImageData(0, 0, 320, 240);
      const data = frame.data;

      const GRID_ROWS = 12;
      const GRID_COLS = 16;
      const cellWidth = Math.floor(320 / GRID_COLS);
      const cellHeight = Math.floor(240 / GRID_ROWS);
      const grid = Array(GRID_ROWS)
        .fill(0)
        .map(() => Array(GRID_COLS).fill(0));

      let totalSkinPixels = 0;

      for (let y = 0; y < 240; y += 4) {
        for (let x = 0; x < 320; x += 4) {
          const index = (y * 320 + x) * 4;
          const r = data[index];
          const g = data[index + 1];
          const b = data[index + 2];

          // Robust multi-range skin detection (handles varied lighting + skin tones)
          const isSkin =
            r > 95 &&
            g > 40 &&
            b > 20 &&
            Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
            Math.abs(r - g) > 15 &&
            r > g &&
            r > b;

          if (isSkin) {
            const row = Math.min(Math.floor(y / cellHeight), GRID_ROWS - 1);
            const col = Math.min(Math.floor(x / cellWidth), GRID_COLS - 1);
            grid[row][col]++;
            totalSkinPixels++;
          }
        }
      }

      // Blob detection
      const pixelsPerCell = (cellWidth * cellHeight) / 16;
      const skinDensityThreshold = pixelsPerCell * 0.12;
      const denseGrid = grid.map((row) =>
        row.map((count) => count > skinDensityThreshold)
      );

      const visited = Array(GRID_ROWS)
        .fill(0)
        .map(() => Array(GRID_COLS).fill(false));
      const blobs: { size: number; minX: number; maxX: number }[] = [];

      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          if (denseGrid[r][c] && !visited[r][c]) {
            let size = 0;
            let minX = c,
              maxX = c;
            const stack = [[r, c]];
            visited[r][c] = true;

            while (stack.length > 0) {
              const [currR, currC] = stack.pop()!;
              size++;
              minX = Math.min(minX, currC);
              maxX = Math.max(maxX, currC);

              const neighbors = [
                [-1, 0],
                [1, 0],
                [0, -1],
                [0, 1],
                [-1, -1],
                [-1, 1],
                [1, -1],
                [1, 1],
              ];
              for (const [dr, dc] of neighbors) {
                const nr = currR + dr;
                const nc = currC + dc;
                if (
                  nr >= 0 &&
                  nr < GRID_ROWS &&
                  nc >= 0 &&
                  nc < GRID_COLS &&
                  denseGrid[nr][nc] &&
                  !visited[nr][nc]
                ) {
                  visited[nr][nc] = true;
                  stack.push([nr, nc]);
                }
              }
            }
            if (size >= 5) {
              blobs.push({ size, minX, maxX });
            }
          }
        }
      }

      // Distinct blobs (face-sized, adequately separated)
      const distinctBlobs = blobs
        .sort((a, b) => a.minX - b.minX)
        .filter((b, i, arr) => {
          if (i === 0) return true;
          return b.minX - arr[i - 1].maxX >= 2;
        });

      // --- Face presence detection ---
      const totalPixelRatio = totalSkinPixels / ((320 * 240) / 16);
      const isFacePresent = totalPixelRatio > 0.02;

      noFaceStateBuffer.current.push(!isFacePresent);
      if (noFaceStateBuffer.current.length > FACE_BUFFER_SIZE)
        noFaceStateBuffer.current.shift();

      const noFaceVotes = noFaceStateBuffer.current.filter(Boolean).length;
      const isConfidentlyNoFace =
        noFaceVotes >= Math.ceil(FACE_BUFFER_SIZE * 0.75);

      if (isConfidentlyNoFace) {
        const now = Date.now();
        // Only fire if enough time has passed since last event (prevent spam)
        if (now - lastNoFaceEventRef.current >= FACE_EVENT_COOLDOWN_MS) {
          lastNoFaceEventRef.current = now;
          // Only send if interview is past grace period
          if (now - startTimeRef.current >= GRACE_PERIOD_MS) {
            logger.log("👤 No face detected — sending event");
            sendEvent("no_face_detected");
            toast.warning("Face not visible. Please stay in front of the camera.", {
              id: "no-face-warning",
              duration: 4000,
            });
          }
        }
      } else {
        // Reset no-face buffer on detection (don't reset no-face cooldown)
        if (!isConfidentlyNoFace) {
          noFaceStateBuffer.current = [];
        }
      }

      // --- Multi-face detection ---
      const isMultiFace = distinctBlobs.length >= 2;

      multiFaceStateBuffer.current.push(isMultiFace);
      if (multiFaceStateBuffer.current.length > FACE_BUFFER_SIZE)
        multiFaceStateBuffer.current.shift();

      const multiFaceVotes = multiFaceStateBuffer.current.filter(Boolean).length;
      const isConfidentlyMultiFace =
        multiFaceVotes >= Math.ceil(FACE_BUFFER_SIZE * 0.75);

      if (isConfidentlyMultiFace) {
        const now = Date.now();
        if (now - lastMultiFaceEventRef.current >= FACE_EVENT_COOLDOWN_MS) {
          lastMultiFaceEventRef.current = now;
          if (now - startTimeRef.current >= GRACE_PERIOD_MS) {
            logger.log("👥 Multiple faces detected — sending event");
            sendEvent("multi_face_detected");
            toast.error("Multiple people detected in frame. This is being recorded.", {
              id: "multi-face-warning",
              duration: 5000,
            });
          }
        }
      } else {
        if (!isConfidentlyMultiFace) {
          multiFaceStateBuffer.current = [];
        }
      }
    };

    const interval = setInterval(detectFaces, DETECTION_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      faceCanvasRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRef, isCompleted, interviewId, email]);

  return null; // This is an invisible monitoring component
};

export default AntiCheatingMonitor;
