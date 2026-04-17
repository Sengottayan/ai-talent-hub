/**
 * AntiCheatingMonitor — Enhanced AI Proctoring
 * Uses MediaPipe for robust face (profile/partial) and person (body/intrusion) detection.
 */

import { useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import { FaceDetector, ObjectDetector, FilesetResolver } from "@mediapipe/tasks-vision";

// ─── Configuration ────────────────────────────────────────────────────────────
const GRACE_PERIOD_MS = 5000;
const CHECK_INTERVAL_MS = 1000;
const COOLDOWN_MS = 15000;
const WINDOW_SIZE = 5;

// Discovery URLs for MediaPipe WASM and Models
const VISION_WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";
const FACE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
const OBJECT_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite";

interface AntiCheatingMonitorProps {
  interviewId: string;
  email: string;
  candidateName: string;
  onViolationLimitReached?: () => void;
  isCompleted?: boolean;
  isInteractionActive?: boolean;
  videoRef?: React.RefObject<HTMLVideoElement>;
}

// ─── Vision Engine Singleton ──────────────────────────────────────────────────
let visionPromise: Promise<{ faceDetector: FaceDetector; objectDetector: ObjectDetector } | null> | null = null;

const loadVisionEngines = (): Promise<{ faceDetector: FaceDetector; objectDetector: ObjectDetector } | null> => {
  if (visionPromise) return visionPromise;

  visionPromise = (async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(VISION_WASM_URL);
      
      const faceDetector = await FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.4
      });

      const objectDetector = await ObjectDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: OBJECT_MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        scoreThreshold: 0.4,
        maxResults: 5
      });

      console.log("[ACM] ✅ MediaPipe Vision Engines Ready");
      return { faceDetector, objectDetector };
    } catch (err) {
      console.error("[ACM] ❌ Vision Init Failure:", err);
      visionPromise = null;
      return null;
    }
  })();
  return visionPromise;
};

// ─── Component ────────────────────────────────────────────────────────────────
const AntiCheatingMonitor: React.FC<AntiCheatingMonitorProps> = ({
  interviewId,
  email,
  candidateName,
  onViolationLimitReached,
  isCompleted = false,
  videoRef,
}) => {
  const isUnloading = useRef(false);
  const startTime = useRef(Date.now());
  const lastEventFiredAt = useRef<Record<string, number>>({});
  const detectionBuffer = useRef<number[]>([]);
  const lastLogEntry = useRef<string>("");

  const triggerViolation = useCallback(async (type: string, metadata: any = {}) => {
    if (isCompleted || isUnloading.current) return;
    const now = Date.now();
    if (now - startTime.current < GRACE_PERIOD_MS) return;

    const lastFired = lastEventFiredAt.current[type] || 0;
    if (now - lastFired < COOLDOWN_MS) return;
    lastEventFiredAt.current[type] = now;

    const messages: Record<string, { title: string; desc: string }> = {
      multi_face_detected: {
        title: "⚠️ MULTIPLE PEOPLE DETECTED",
        desc: "Security alert: More than one person or physical intrusion detected."
      },
      no_face_detected: {
        title: "⚠️ FACE NOT DETECTED",
        desc: "Please ensure your face is fully visible within the camera frame."
      },
      visibility_hidden: {
        title: "⚠️ TAB SWITCH DETECTED",
        desc: "Focus lost. Stay on the interview page to avoid disqualification."
      },
      window_blur: {
        title: "⚠️ WINDOW FOCUS LOST",
        desc: "Interview window minimized or background app activated."
      }
    };

    const alert = messages[type] || { title: "⚠️ INTEGRITY WARNING", desc: "Suspicious activity detected." };
    toast.error(alert.title, { id: `ac-violation-${type}`, description: alert.desc, duration: 8000 });

    console.log(`[ACM] → FIRING VIOLATION: ${type}`, metadata);

    try {
      const { data } = await api.post(`/interviews/anti-cheating-event`, {
        interview_id: interviewId,
        email,
        candidate_name: candidateName,
        event_type: type,
        clientId: sessionStorage.getItem(`interview_client_id_${interviewId}`),
        timestamp: new Date().toISOString(),
        timestamp_str: getTimerString(),
        ...metadata,
      });

      if (data.interview_status === "auto_completed") {
        toast.error("INTERVIEW TERMINATED", { description: "Multiple violations detected.", duration: 15000 });
        onViolationLimitReached?.();
      }
    } catch (err) {
      console.error("[ACM] Backend sync failed:", err);
    }
  }, [interviewId, email, candidateName, isCompleted, onViolationLimitReached]);

  const getTimerString = () => {
    try {
      const raw = localStorage.getItem(`timer_start_${interviewId}`) || localStorage.getItem(`timer_start_${interviewId}_${email}`);
      if (!raw) return "00:00";
      const s = Math.floor((Date.now() - parseInt(raw, 10)) / 1000);
      return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    } catch { return "00:00"; }
  };

  useEffect(() => {
    if (!interviewId || isCompleted) return;
    const onUnload = () => { isUnloading.current = true; };
    const onVisibility = () => { if (document.visibilityState === "hidden") triggerViolation("visibility_hidden"); };
    const onBlur = () => { setTimeout(() => { if (!isUnloading.current && document.visibilityState === "visible") triggerViolation("window_blur"); }, 500); };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
  }, [interviewId, isCompleted, triggerViolation]);

  useEffect(() => {
    if (!videoRef || isCompleted) return;
    let loopId: any = null;
    let isActive = true;

    const start = async () => {
      const engines = await loadVisionEngines();
      if (!engines) return;
      const { faceDetector, objectDetector } = engines;

      await new Promise<void>((res) => {
        const check = setInterval(() => {
          const v = videoRef.current;
          if (!isActive) { clearInterval(check); res(); return; }
          if (v && v.readyState >= 2 && v.videoWidth > 0) { clearInterval(check); res(); }
        }, 300);
      });

      if (!isActive) return;
      console.log("[ACM] Enhanced Monitoring Active");

      loopId = setInterval(async () => {
        if (!isActive || isCompleted || isUnloading.current) return;
        const video = videoRef.current;
        if (!video) return;

        try {
          // 1. Concurrent Detection
          const faceResult = faceDetector.detectForVideo(video, Date.now());
          const objectResult = objectDetector.detectForVideo(video, Date.now());

          const faceCount = faceResult.detections.length;
          // Filter object results for "person" (ID 0 in COCO-SSD)
          const personCount = objectResult.detections.filter(d => 
            d.categories.some(c => c.categoryName === "person" || c.index === 0)
          ).length;

          const summary = `Faces: ${faceCount}, Persons: ${personCount}`;
          if (summary !== lastLogEntry.current) {
            console.log(`[ACM] ${summary}`);
            lastLogEntry.current = summary;
          }

          // 2. Aggregate Signal for Multi-Presence
          // We prioritize Person count for intrusion, Face count for profile stability
          const aggregateMulti = Math.max(faceCount, personCount);
          detectionBuffer.current.push(aggregateMulti);
          if (detectionBuffer.current.length > WINDOW_SIZE) detectionBuffer.current.shift();

          const buf = detectionBuffer.current;
          if (buf.length < 2) return;

          // VIOLATION LOGIC
          
          // MULTI: If 2+ humans detected in 2 of last 3 frames
          const recentBuf = buf.slice(-3);
          const multiTriggered = recentBuf.filter(c => c >= 2).length >= 2;
          if (multiTriggered) {
            detectionBuffer.current = [1, 1, 1];
            triggerViolation("multi_face_detected", { faceCount, personCount });
            return;
          }

          // NO FACE: Based specifically on Face Detector. 4 of last 5 frames.
          // We allow Person to be present, but we REQUIRE a Face for proctoring.
          const noFaceRun = buf.length >= WINDOW_SIZE && faceCount === 0; 
          // Note: The logic below is a bit simpler for "No Face" to be reactive but stable
          const noFaceCount = buf.filter(c => c === 0).length;
          if (noFaceCount >= 4 && faceCount === 0) {
            detectionBuffer.current = [1, 1, 1, 1, 1];
            triggerViolation("no_face_detected");
            return;
          }
        } catch (err) {
          console.error("[ACM] Detection frame dropped:", err);
        }
      }, CHECK_INTERVAL_MS);
    };

    start();
    return () => {
      isActive = false;
      if (loopId) clearInterval(loopId);
    };
  }, [videoRef, isCompleted, triggerViolation]);

  return null;
};

export default AntiCheatingMonitor;
