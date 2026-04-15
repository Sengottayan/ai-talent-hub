import React, { useEffect, useRef, useState } from "react";
import { toast } from "@/hooks/use-toast";

interface VideoPanelProps {
  onFaceDetectedStatusChange: (isDetected: boolean) => void;
  onMultiFaceStatusChange?: (isMulti: boolean) => void;
  isActive: boolean;
}

export const VideoPanel: React.FC<VideoPanelProps> = ({
  onFaceDetectedStatusChange,
  onMultiFaceStatusChange,
  isActive,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [faceDetected, setFaceDetected] = useState(true);
  const [multiFaceDetected, setMultiFaceDetected] = useState(false);
  
  // Smoothing buffers to avoid rapid state changes (Production Level Stability)
  const faceStateBuffer = useRef<boolean[]>([]);
  const multiStateBuffer = useRef<boolean[]>([]);
  const BUFFER_SIZE = 3; 

  // Camera Management
  useEffect(() => {
    const startCamera = async () => {
      if (!isActive) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: "user" },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (e) {
        console.error("Camera access denied:", e);
        setFaceDetected(false);
        onFaceDetectedStatusChange(false);
      }
    };

    if (isActive) {
      startCamera();
    } else {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
      }
    }
  }, [isActive]);

  useEffect(() => {
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Use refs for detection state inside the interval to avoid stale closures
  // and prevent the interval from being recreated every time detection state changes.
  const faceDetectedRef = useRef(true);
  const multiFaceDetectedRef = useRef(false);

  // Enhanced Detection Cycle
  useEffect(() => {
    if (!isActive) return;

    // Reset buffers when detection starts
    faceStateBuffer.current = [];
    multiStateBuffer.current = [];

    const interval = setInterval(() => {
      if (!videoRef.current || !canvasRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      if (!ctx) return;

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const width = 320;
        const height = 240;
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(video, 0, 0, width, height);

        const frame = ctx.getImageData(0, 0, width, height);
        const data = frame.data;
        
        // --- Grid-based Cluster Analysis (Robust Production version) ---
        const GRID_ROWS = 12;
        const GRID_COLS = 16;
        const cellWidth = Math.floor(width / GRID_COLS);
        const cellHeight = Math.floor(height / GRID_ROWS);
        const grid = Array(GRID_ROWS).fill(0).map(() => Array(GRID_COLS).fill(0));
        
        let totalSkinPixels = 0;

        for (let y = 0; y < height; y += 4) {
          for (let x = 0; x < width; x += 4) {
            const index = (y * width + x) * 4;
            const r = data[index];
            const g = data[index + 1];
            const b = data[index + 2];

            const isSkin = r > 95 && g > 40 && b > 20 &&
                           Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
                           Math.abs(r - g) > 15 && r > g && r > b;

            if (isSkin) {
              const row = Math.min(Math.floor(y / cellHeight), GRID_ROWS - 1);
              const col = Math.min(Math.floor(x / cellWidth), GRID_COLS - 1);
              grid[row][col]++;
              totalSkinPixels++;
            }
          }
        }

        // --- Connectivity & Blob Identification ---
        const pixelsPerCell = (cellWidth * cellHeight) / 16;
        const skinDensityThreshold = pixelsPerCell * 0.12;
        const denseGrid = grid.map(row => row.map(count => count > skinDensityThreshold));

        const visited = Array(GRID_ROWS).fill(0).map(() => Array(GRID_COLS).fill(false));
        const blobs: {size: number, minX: number, maxX: number}[] = [];

        for (let r = 0; r < GRID_ROWS; r++) {
          for (let c = 0; c < GRID_COLS; c++) {
            if (denseGrid[r][c] && !visited[r][c]) {
              let size = 0;
              let minX = c, maxX = c;
              const stack = [[r, c]];
              visited[r][c] = true;

              while (stack.length > 0) {
                const [currR, currC] = stack.pop()!;
                size++;
                minX = Math.min(minX, currC);
                maxX = Math.max(maxX, currC);

                const neighbors = [[-1, 0],[1, 0],[0, -1],[0, 1],[-1,-1],[-1,1],[1,-1],[1,1]];
                for (const [dr, dc] of neighbors) {
                  const nr = currR + dr;
                  const nc = currC + dc;
                  if (nr >= 0 && nr < GRID_ROWS && nc >= 0 && nc < GRID_COLS && 
                      denseGrid[nr][nc] && !visited[nr][nc]) {
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

        // --- Status Determination with Hysteresis ---
        
        // 1. Face Presence (Buffer-based, reads/writes ref to avoid stale closure)
        const currentPresence = totalSkinPixels / ((width * height) / 16) > 0.02;
        faceStateBuffer.current.push(currentPresence);
        if (faceStateBuffer.current.length > BUFFER_SIZE) faceStateBuffer.current.shift();
        
        const smoothedPresence = faceStateBuffer.current.filter(Boolean).length >= Math.ceil(BUFFER_SIZE / 2);
        
        // Only update state (and fire callback) when value actually changes
        if (smoothedPresence !== faceDetectedRef.current) {
          faceDetectedRef.current = smoothedPresence;
          setFaceDetected(smoothedPresence);
          onFaceDetectedStatusChange(smoothedPresence);
        }

        // 2. Multi-Face Status (Buffer-based)
        const distinctBlobs = blobs.sort((a, b) => a.minX - b.minX).filter((b, i, arr) => {
          if (i === 0) return true;
          return (b.minX - arr[i-1].maxX) >= 2;
        });

        const currentMulti = distinctBlobs.length >= 2;
        multiStateBuffer.current.push(currentMulti);
        if (multiStateBuffer.current.length > BUFFER_SIZE) multiStateBuffer.current.shift();
        
        const smoothedMulti = multiStateBuffer.current.filter(Boolean).length >= Math.ceil(BUFFER_SIZE / 2);

        // Only update state (and fire callback) when value actually changes
        if (smoothedMulti !== multiFaceDetectedRef.current) {
          multiFaceDetectedRef.current = smoothedMulti;
          setMultiFaceDetected(smoothedMulti);
          if (onMultiFaceStatusChange) onMultiFaceStatusChange(smoothedMulti);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
    // Only depend on isActive and the stable callback refs — NOT on the detection states
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover transform scale-x-[-1]"
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* Overlay Status */}
      {!faceDetected && isActive && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
          <p className="text-red-500 font-bold animate-pulse">
            FACE NOT DETECTED
          </p>
        </div>
      )}
    </div>
  );
};
