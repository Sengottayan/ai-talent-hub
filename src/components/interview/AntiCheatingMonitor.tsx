import { useEffect, useRef } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import { logger } from "@/lib/logger";

// face-api.js is loaded dynamically (lazy chunk) to avoid bloating the initial bundle.
// It only loads when face detection starts (during an active interview with videoRef).
type FaceApiModule = typeof import("face-api.js");

interface AntiCheatingMonitorProps {
  interviewId: string;
  email: string;
  candidateName: string;
  onViolationLimitReached?: () => void;
  isCompleted?: boolean;
  isInteractionActive?: boolean;
  videoRef?: React.RefObject<HTMLVideoElement>;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const GRACE_PERIOD_MS = 8000; // 8s grace on start before any events fire
const FACE_CHECK_INTERVAL_MS = 2000; // Check every 2 seconds
const FACE_EVENT_COOLDOWN_MS = 15000; // Min 15s between same face-violation events
const FACE_CONFIDENCE_THRESHOLD = 0.55; // Minimum confidence for TinyFaceDetector
const FACE_MIN_SIZE = 60; // Minimum detected face size in pixels (filter noise)
const FACE_REQUIRED_CONSECUTIVE = 3; // Require N consecutive positive frames before firing
const BLUR_DEDUP_DELAY_MS = 350; // Time to wait after blur to check if visibility changed
const WINDOW_BLUR_COOLDOWN_MS = 5000; // Don't fire window_blur within 5s of visibility_hidden

// ─── Model loading (singleton, loads once per page session) ─────────────────
let modelLoadPromise: Promise<FaceApiModule | null> | null = null;

const loadFaceModels = (): Promise<FaceApiModule | null> => {
  if (modelLoadPromise) return modelLoadPromise;
  modelLoadPromise = import("face-api.js")
    .then(async (faceapi) => {
      await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
      logger.log("✅ face-api.js TinyFaceDetector model loaded");
      return faceapi as FaceApiModule;
    })
    .catch((err) => {
      logger.error("❌ Failed to load face detection model:", err);
      modelLoadPromise = null;
      return null;
    });
  return modelLoadPromise;
};

// ─── Component ───────────────────────────────────────────────────────────────
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
  const startTimeRef = useRef<number>(Date.now());

  // Track when we went hidden (for blur deduplication)
  const visibilityHiddenAtRef = useRef<number>(0);
  const startBlurTimeRef = useRef<number | null>(null);

  // Face detection consecutive-frame buffers
  const multiFaceConsecutiveRef = useRef(0);
  const noFaceConsecutiveRef = useRef(0);
  const modelReadyRef = useRef(false);

  // Per-event cooldown timestamps (prevent spam)
  const lastEventTimeRef = useRef<Record<string, number>>({});

  // ─── Core: send event to backend ──────────────────────────────────────────
  const sendEvent = async (eventType: string, extraData: Record<string, unknown> = {}) => {
    if (isCompleted || isUnloadingRef.current) return;

    const now = Date.now();

    // Grace period guard
    if (now - startTimeRef.current < GRACE_PERIOD_MS) {
      logger.log(`[ACM] Ignoring "${eventType}" — in grace period`);
      return;
    }

    // Per-event cooldown (prevents repeated events of same type)
    const cooldowns: Record<string, number> = {
      visibility_hidden: 1000,
      window_blur: WINDOW_BLUR_COOLDOWN_MS,
      window_focus: 2000,
      multi_face_detected: FACE_EVENT_COOLDOWN_MS,
      no_face_detected: FACE_EVENT_COOLDOWN_MS,
    };
    const cooldown = cooldowns[eventType] ?? 2000;
    const lastFired = lastEventTimeRef.current[eventType] ?? 0;
    if (now - lastFired < cooldown) {
      logger.log(`[ACM] Suppressing "${eventType}" — cooldown active (${Math.round((cooldown - (now - lastFired)) / 1000)}s remaining)`);
      return;
    }
    lastEventTimeRef.current[eventType] = now;

    // Build timestamp string from timer
    const timestampStr = getFormattedRelativeTime();
    const clientId =
      typeof window !== "undefined"
        ? sessionStorage.getItem(`interview_client_id_${interviewId}`)
        : null;

    logger.log(`[ACM] Sending event: ${eventType} at ${timestampStr}`);

    try {
      const { data } = await api.post(`/interviews/anti-cheating-event`, {
        interview_id: interviewId,
        email,
        candidate_name: candidateName,
        event_type: eventType,
        clientId,
        timestamp: new Date().toISOString(),
        timestamp_str: timestampStr,
        ...extraData,
      });

      if (data.interview_status === "auto_completed") {
        toast.dismiss();
        toast.error("Interview ended due to repeated violations.", {
          id: "ac-violation-end",
          duration: 10000,
        });
        onViolationLimitReached?.();
        return;
      }

      // Show user-facing warning toast
      const score = data.suspicious_score ?? 0;
      const max = data.max_allowed_score ?? 10;

      if (score > 0 && score < max) {
        const violationsLeft = max - score;
        const isCritical = violationsLeft <= 1;

        const warningMessage = isCritical
          ? `⚠️ Critical Warning (${score}/${max}): One more violation will end the interview!`
          : `Warning (${score}/${max}): ${getWarningMessage(eventType)}`;

        toast[isCritical ? "error" : "warning"](warningMessage, {
          id: "ac-warning",
          duration: isCritical ? 6000 : 4000,
        });
      }
    } catch (error) {
      logger.error("[ACM] Failed to send event:", error);
    }
  };

  const getWarningMessage = (eventType: string): string => {
    switch (eventType) {
      case "visibility_hidden": return "Please stay on the interview tab.";
      case "window_blur": return "Please keep the interview window focused.";
      case "multi_face_detected": return "Multiple people detected in frame. This is recorded.";
      case "no_face_detected": return "Please stay in front of the camera.";
      default: return "Suspicious activity detected.";
    }
  };

  const getFormattedRelativeTime = (): string => {
    if (typeof window === "undefined") return "00:00";
    try {
      const raw =
        localStorage.getItem(`timer_start_${interviewId}`) ||
        localStorage.getItem(`timer_start_${interviewId}_${email}`);
      if (!raw) return "00:00";
      const diffMs = Date.now() - parseInt(raw, 10);
      if (diffMs < 0) return "00:00";
      const totalS = Math.floor(diffMs / 1000);
      return `${String(Math.floor(totalS / 60)).padStart(2, "0")}:${String(totalS % 60).padStart(2, "0")}`;
    } catch {
      return "00:00";
    }
  };

  // ─── On mount: log initial focus ─────────────────────────────────────────
  useEffect(() => {
    if (interviewId && email && !isCompleted) {
      // Delay initial focus event past grace period
      const timer = setTimeout(() => sendEvent("window_focus"), GRACE_PERIOD_MS + 500);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewId, email]);

  // ─── Tab visibility + window blur/focus listeners ────────────────────────
  useEffect(() => {
    if (!interviewId || !email || isCompleted) return;

    const handleBeforeUnload = () => {
      isUnloadingRef.current = true;
    };

    const handleVisibilityChange = () => {
      if (isUnloadingRef.current) return;

      if (document.visibilityState === "hidden") {
        // Record the time this happened (for blur deduplication)
        visibilityHiddenAtRef.current = Date.now();
        startBlurTimeRef.current = Date.now();
        sendEvent("visibility_hidden");
      } else {
        // Tab became visible again
        const duration = startBlurTimeRef.current
          ? Date.now() - startBlurTimeRef.current
          : 0;
        startBlurTimeRef.current = null;
        // window_focus: no penalty, just for logging + user reassurance
        sendEvent("window_focus", { durationMs: duration });
      }
    };

    // window blur: fires when the browser window loses focus to any OTHER WINDOW/APP.
    // We delay it and skip if visibilitychange=hidden already fired (tab minimize/switch).
    const handleBlur = () => {
      if (isUnloadingRef.current) return;
      setTimeout(() => {
        if (isUnloadingRef.current) return;
        // If visibilitychange fired very recently (< BLUR_DEDUP_DELAY_MS), that
        // event already covered this — don't double-count.
        const lastHidden = Date.now() - visibilityHiddenAtRef.current;
        if (lastHidden < BLUR_DEDUP_DELAY_MS * 2) return;
        if (document.visibilityState === "hidden") return;

        startBlurTimeRef.current = Date.now();
        sendEvent("window_blur");
      }, BLUR_DEDUP_DELAY_MS);
    };

    const handleFocus = () => {
      if (isUnloadingRef.current) return;
      // If visibility was hidden and now restored, visibilitychange handles it.
      // Only fire window_focus here if visibility is still "visible" (e.g. DevTools closed).
      if (document.visibilityState === "visible" && startBlurTimeRef.current) {
        const duration = Date.now() - startBlurTimeRef.current;
        startBlurTimeRef.current = null;
        sendEvent("window_focus", { durationMs: duration });
      }
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

  // ─── ML Face Detection ────────────────────────────────────────────────────
  useEffect(() => {
    if (!videoRef || isCompleted) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;
    let isMounted = true;

    const startDetection = async () => {
      // Dynamically load model (singleton, loads once)
      const faceapi = await loadFaceModels();
      if (!isMounted || !faceapi) return;

      modelReadyRef.current = true;
      logger.log("[ACM] Face detection started");

      // offsetting canvas for detection (performance)
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 240;

      intervalId = setInterval(async () => {
        if (!isMounted || isCompleted || isUnloadingRef.current) return;

        const video = videoRef.current;
        if (!video || video.readyState < video.HAVE_ENOUGH_DATA || video.paused) return;

        try {
          // Run TinyFaceDetector on the video element directly
          const detections = await faceapi.detectAllFaces(
            video,
            new faceapi.TinyFaceDetectorOptions({
              inputSize: 224,         // Lower = faster, still accurate enough
              scoreThreshold: FACE_CONFIDENCE_THRESHOLD,
            })
          );

          // Filter out tiny noise detections that are not real faces
          const realFaces = detections.filter(
            (d) => d.box.width >= FACE_MIN_SIZE && d.box.height >= FACE_MIN_SIZE
          );

          const faceCount = realFaces.length;
          logger.log(`[ACM] Faces detected: ${faceCount}`);

          // ── Multi-face: require N consecutive frames ──────────────────
          if (faceCount >= 2) {
            multiFaceConsecutiveRef.current += 1;
            noFaceConsecutiveRef.current = 0; // Reset no-face streak

            if (multiFaceConsecutiveRef.current >= FACE_REQUIRED_CONSECUTIVE) {
              multiFaceConsecutiveRef.current = 0; // Reset after firing
              await sendEvent("multi_face_detected", { faceCount });
              toast.error(
                `🚨 Multiple people detected (${faceCount} faces). This violation is recorded.`,
                { id: "multi-face-toast", duration: 6000 }
              );
            }
          } else {
            multiFaceConsecutiveRef.current = 0;
          }

          // ── No-face: require N consecutive frames ────────────────────
          if (faceCount === 0) {
            noFaceConsecutiveRef.current += 1;
            multiFaceConsecutiveRef.current = 0; // Reset multi-face streak

            if (noFaceConsecutiveRef.current >= FACE_REQUIRED_CONSECUTIVE) {
              noFaceConsecutiveRef.current = 0; // Reset after firing
              await sendEvent("no_face_detected");
              toast.warning(
                "Face not visible. Please stay in front of the camera.",
                { id: "no-face-toast", duration: 5000 }
              );
            }
          } else {
            noFaceConsecutiveRef.current = 0;
          }
        } catch (err) {
          // Silently ignore per-frame detection errors (network hiccup, tab hidden)
          logger.log("[ACM] Detection frame skipped:", err);
        }
      }, FACE_CHECK_INTERVAL_MS);
    };

    startDetection();

    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRef, isCompleted]);

  return null;
};

export default AntiCheatingMonitor;
