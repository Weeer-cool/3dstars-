import { useEffect, useRef, useState, RefObject } from 'react';
import { Camera, CameraOff, Minimize2, Maximize2, Sliders } from 'lucide-react';
import { HandData } from '../types';

interface HandWebcamProps {
  detected: boolean;
  handData: HandData;
  landmarks: any[] | null; // MediaPipe multiHandLandmarks raw array
  videoRef: RefObject<HTMLVideoElement | null>;
  webcamSize: 'sm' | 'md' | 'lg' | 'hidden';
  onSizeChange: (size: 'sm' | 'md' | 'lg' | 'hidden') => void;
  showSkeleton: boolean;
  onToggleSkeleton: () => void;
  isLoading: boolean;
}

export function HandWebcam({
  detected,
  handData,
  landmarks,
  videoRef,
  webcamSize,
  onSizeChange,
  showSkeleton,
  onToggleSkeleton,
  isLoading,
}: HandWebcamProps) {
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 }); // Future capability of positioning if dragging
  
  // Choose width & height based on selected preset webcam window size
  const getSizeClasses = () => {
    switch (webcamSize) {
      case 'sm':
        return 'w-[150px] h-[112px]';
      case 'md':
        return 'w-[240px] h-[180px]';
      case 'lg':
        return 'w-[360px] h-[270px]';
      case 'hidden':
        return 'w-0 h-0 opacity-0 overflow-hidden pointer-events-none';
    }
  };

  // Draw 2D MediaPipe skeletal tracking lines overlay on high frequency canvas
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || webcamSize === 'hidden' || !videoRef.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Direct match with video bounds
    const video = videoRef.current;
    
    const draw = () => {
      if (video.videoWidth === 0) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Horizontal horizontal flipping to match mirror webcam view
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);

      if (detected && landmarks && landmarks.length > 0 && showSkeleton) {
        // Hand structures connections map definition
        const connections = [
          // Thumb
          [0, 1], [1, 2], [2, 3], [3, 4],
          // Index Finger
          [0, 5], [5, 6], [6, 7], [7, 8],
          // Middle Finger
          [0, 9], [9, 10], [10, 11], [11, 12],
          // Ring Finger
          [0, 13], [13, 14], [14, 15], [15, 16],
          // Pinky
          [0, 17], [17, 18], [18, 19], [19, 20],
          // Palm base knuckles
          [5, 9], [9, 13], [13, 17]
        ];

        // Draw joint skeleton bones connection lines
        ctx.strokeStyle = '#6366f1'; // Indigo-500
        ctx.lineWidth = 4;
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'rgba(99, 102, 241, 0.7)';

        const hand = landmarks[0]; // Draw first captured hand
        
        connections.forEach(([sIdx, eIdx]) => {
          const ptStart = hand[sIdx];
          const ptEnd = hand[eIdx];

          if (ptStart && ptEnd) {
            ctx.beginPath();
            ctx.moveTo(ptStart.x * canvas.width, ptStart.y * canvas.height);
            ctx.lineTo(ptEnd.x * canvas.width, ptEnd.y * canvas.height);
            ctx.stroke();
          }
        });

        // Bone lines finished, proceed to draw joint nodes (circle dots)
        ctx.shadowBlur = 0; // reset
        
        hand.forEach((joint: any, index: number) => {
          ctx.beginPath();
          ctx.arc(joint.x * canvas.width, joint.y * canvas.height, 5, 0, 2 * Math.PI);
          
          // Color code special landmark tips for readability
          if ([4, 8, 12, 16, 20].includes(index)) {
            ctx.fillStyle = '#10b981'; // Green-500 tips matching active tracking indicators
          } else if (index === 0) {
            ctx.fillStyle = '#ef4444'; // Red-500 Wrist reference root
          } else {
            ctx.fillStyle = '#f59e0b'; // Amber generic knuckles
          }
          ctx.fill();
        });
      }
    };

    // Keep synchronised drawing
    let animationId = requestAnimationFrame(function loop() {
      draw();
      animationId = requestAnimationFrame(loop);
    });

    return () => cancelAnimationFrame(animationId);
  }, [detected, landmarks, showSkeleton, webcamSize, videoRef]);

  if (webcamSize === 'hidden') {
    return (
      <button
        onClick={() => onSizeChange('md')}
        className="fixed bottom-6 left-6 z-20 flex items-center gap-2 px-4 py-2.5 bg-slate-900/90 border border-slate-800/80 hover:border-slate-700/80 text-xs text-slate-300 rounded-xl shadow-lg backdrop-blur-md transition-all font-sans"
      >
        <Camera className="h-4 w-4 text-indigo-400" />
        打开摄像头 / Show Camera View
      </button>
    );
  }

  return (
    <div
      id="webcam-pane-frame"
      className={`fixed bottom-6 left-6 z-20 transition-all duration-300 rounded-2xl border border-slate-800/80 bg-black/50 backdrop-blur-lg shadow-2xl overflow-hidden flex flex-col group ${getSizeClasses()}`}
    >
      {/* Title Bar header */}
      <div className="flex items-center justify-between px-3 h-8 border-b border-indigo-950/20 bg-slate-950/40 select-none">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className={`h-1.5 w-1.5 rounded-full ${detected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
          <span className="text-[10px] uppercase tracking-wider font-mono text-slate-400 truncate">
            {detected ? `TRACKED | FPS` : 'CAMERA FEED'}
          </span>
        </div>

        {/* Small toggles */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onToggleSkeleton()}
            title="Toggle joint skeleton / 骨骼连线"
            className={`p-1 rounded transition-colors ${
              showSkeleton ? 'text-indigo-400 bg-indigo-500/10' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Sliders className="h-3 w-3" />
          </button>
          
          <button
            onClick={() => {
              const sizes: ('sm' | 'md' | 'lg' | 'hidden')[] = ['sm', 'md', 'lg', 'hidden'];
              const currIdx = sizes.indexOf(webcamSize);
              const nextIdx = (currIdx + 1) % sizes.length;
              onSizeChange(sizes[nextIdx]);
            }}
            title="Cycle window size"
            className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors"
          >
            <Maximize2 className="h-3 w-3" />
          </button>

          <button
            onClick={() => onSizeChange('hidden')}
            title="Collapse / 隐藏"
            className="p-1 rounded text-slate-500 hover:text-slate-400 transition-colors"
          >
            <Minimize2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Frame body containing Video elements */}
      <div className="relative flex-1 bg-slate-950 flex items-center justify-center overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/90 z-20 text-center px-4 font-sans">
            <div className="h-5 w-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            <p className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">Initializing Tracker...</p>
          </div>
        )}

        <video
          ref={videoRef}
          playsInline
          muted
          className="w-full h-full object-cover scale-x-[-1]" // horizontal mirror
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />

        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
        />

        {/* Dynamic hand telemetry label overlay */}
        {detected && (
          <div className="absolute bottom-2 left-2 z-15 bg-slate-950/80 border border-slate-800/40 px-2 py-1 rounded-lg flex flex-col gap-0.5 pointer-events-none backdrop-blur-md">
            <span className="text-[9px] font-mono font-medium text-emerald-400 flex items-center gap-1">
              状态: {handData.gesture || '已就绪'}
            </span>
            <div className="flex gap-2">
              <span className="text-[8px] font-mono text-slate-400">
                开启度: {Math.round(handData.openness * 100)}%
              </span>
              <span className="text-[8px] font-mono text-slate-400">
                手指数: {handData.fingerCount}
              </span>
            </div>
          </div>
        )}

        {!detected && !isLoading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-center p-4 select-none pointer-events-none z-10 font-sans">
            <div className="bg-slate-900/90 border border-slate-800 border-dashed p-3 rounded-xl flex flex-col items-center gap-1 backdrop-blur-md">
              <CameraOff className="h-4 w-4 text-slate-500" />
              <span className="text-[10px] text-slate-400 font-medium">请将手掌面向摄像头</span>
              <span className="text-[8px] text-slate-500 leading-normal">移动手控制旋转 • 手开合进行捏合缩放</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
