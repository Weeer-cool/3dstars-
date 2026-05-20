/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { ParticleCanvasRef, ParticleCanvas } from './components/ParticleCanvas';
import { PresetSelector } from './components/PresetSelector';
import { ControlPanel } from './components/ControlPanel';
import { HandWebcam } from './components/HandWebcam';
import { SystemSettings, HandData, ParticlePreset } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Maximize, Minimize, Tv, Zap, Info, Camera, Hand } from 'lucide-react';

const INITIAL_SETTINGS: SystemSettings = {
  preset: 'nebula',
  baseColor: '#3b82f6',
  density: 30000,
  size: 1.2,
  glowIntensity: 0.7,
  autoRotateSpeed: 0.8,
  interactionSensitivity: 1.2,
  webcamSize: 'md',
  showSkeleton: true,
  colorShiftSpeed: 0.6,
  audioReactive: false,
  attractorMode: false,
};

export default function App() {
  const [settings, setSettings] = useState<SystemSettings>(INITIAL_SETTINGS);
  const [scriptsReady, setScriptsReady] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Core tracking states
  const [handData, setHandData] = useState<HandData>({
    detected: false,
    x: 0,
    y: 0,
    z: 0.5,
    openness: 0,
    fingerCount: 0,
    gesture: '正在等待手部...',
    speed: 0,
  });
  const [landmarks, setLandmarks] = useState<any[] | null>(null);

  // References
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<ParticleCanvasRef | null>(null);
  const handsInstanceRef = useRef<any>(null);
  const cameraInstanceRef = useRef<any>(null);
  const lastWristRef = useRef<{ x: number; y: number } | null>(null);

  // 1. Detect if script libraries loaded from index.html (dynamic defensive polling)
  useEffect(() => {
    const checkInterval = setInterval(() => {
      if ((window as any).Hands && (window as any).Camera) {
        setScriptsReady(true);
        clearInterval(checkInterval);
      }
    }, 150);
    return () => clearInterval(checkInterval);
  }, []);

  // 2. Setup MediaPipe Hands pipeline once libraries are live
  useEffect(() => {
    if (!scriptsReady) return;

    // Initialize Hands object
    const hands = new (window as any).Hands({
      locateFile: (file: string) => `${import.meta.env.BASE_URL}mediapipe/${file}`,
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 0,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5,
    });

    hands.onResults((results: any) => {
      setCameraLoading(false);
      
      const multiHandLandmarks = results.multiHandLandmarks;
      if (multiHandLandmarks && multiHandLandmarks.length > 0) {
        const hData = multiHandLandmarks[0];
        setLandmarks(multiHandLandmarks);

        // 9: MCP of middle finger (reliable palm center tracking)
        // 0: Wrist joint
        const dx9 = hData[9].x - hData[0].x;
        const dy9 = hData[9].y - hData[0].y;
        const dz9 = hData[9].z - hData[0].z;
        const palmLength = Math.sqrt(dx9 * dx9 + dy9 * dy9 + dz9 * dz9);

        // Map mirrored coordinates so moving hand left revolves the 3D model left
        const handX = (0.5 - hData[9].x) * 2; // -1 to 1
        const handY = (hData[9].y - 0.5) * 2; // -1 to 1
        const handZ = hData[9].z; 

        // Measure fingertips distance to wrist to stably calculate finger openness
        const fingerTips = [4, 8, 12, 16, 20];
        let tipDistSum = 0;
        fingerTips.forEach((idx) => {
          const dx = hData[idx].x - hData[0].x;
          const dy = hData[idx].y - hData[0].y;
          const dz = hData[idx].z - hData[0].z;
          tipDistSum += Math.sqrt(dx * dx + dy * dy + dz * dz);
        });

        // Compute openness (empirical tuning: fisted sum is ~4.4 * palm, wide open is ~9.0 * palm)
        const scaleRatio = tipDistSum / (palmLength || 1);
        let opennessVal = (scaleRatio - 4.4) / 4.4;
        opennessVal = Math.max(0, Math.min(1, opennessVal));

        // Extended Finger Counting (comparing tip elevations to joint knuckles)
        let extendedFingers = 0;
        if (hData[8].y < hData[6].y) extendedFingers++;
        if (hData[12].y < hData[10].y) extendedFingers++;
        if (hData[16].y < hData[14].y) extendedFingers++;
        if (hData[20].y < hData[18].y) extendedFingers++;
        
        // Thumb check (thumb stretches outward horizontally in coordinates)
        const thumbOut = Math.abs(hData[4].x - hData[17].x) > Math.abs(hData[3].x - hData[17].x);
        if (thumbOut) extendedFingers++;

        // Speed of movement (wave velocities)
        let speed = 0;
        if (lastWristRef.current) {
          const wdx = hData[0].x - lastWristRef.current.x;
          const wdy = hData[0].y - lastWristRef.current.y;
          speed = Math.sqrt(wdx * wdx + wdy * wdy) * 100;
        }
        lastWristRef.current = { x: hData[0].x, y: hData[0].y };

        // Classify standard poses for telemetry display
        let customGesture = '已识别动作';
        if (opennessVal > 0.85) {
          customGesture = '星河大舒张 (Palm Open)';
        } else if (opennessVal < 0.22) {
          customGesture = '星核凝聚 (Fist)';
        } else if (extendedFingers === 2 && hData[8].y < hData[6].y && hData[12].y < hData[10].y) {
          customGesture = '极光剪刀手 (Victory)';
        } else if (extendedFingers === 1 && hData[8].y < hData[6].y) {
          customGesture = '星指引 (Pointing)';
        } else if (hData[4].y < hData[3].y && extendedFingers <= 1) {
          customGesture = '太虚指赞 (Thumbs Up)';
        }

        // Auto shockwave trigger if user waves hand extremely fast
        if (speed > 12.0) {
          canvasRef.current?.triggerBurst();
        }

        setHandData({
          detected: true,
          x: handX,
          y: handY,
          z: handZ,
          openness: opennessVal,
          fingerCount: extendedFingers,
          gesture: customGesture,
          speed: speed,
        });
      } else {
        // No hand found inside scene boundaries
        setLandmarks(null);
        setHandData((prev) => ({
          ...prev,
          detected: false,
          gesture: '未见双掌呈露...',
        }));
      }
    });

    handsInstanceRef.current = hands;

    // Initialize Camera Stream pipeline
    if (videoRef.current) {
      const camera = new (window as any).Camera(videoRef.current, {
        onFrame: async () => {
          if (videoRef.current && handsInstanceRef.current) {
            try {
              await handsInstanceRef.current.send({ image: videoRef.current });
            } catch (err) {
              console.warn('MediaPipe send frame error:', err);
            }
          }
        },
        width: 1280,
        height: 720,
      });

      camera.start()
        .then(() => {
          setCameraLoading(false);
          setCameraError(null);
        })
        .catch((err: any) => {
          console.error('Camera startup error:', err);
          setCameraLoading(false);
          setCameraError('由于浏览器的 iframe 跨域安全机制，沙箱预览窗可能会阻止直接调用摄像头权限。');
        });

      cameraInstanceRef.current = camera;
    }

    return () => {
      if (cameraInstanceRef.current) {
        cameraInstanceRef.current.stop?.();
      }
      if (handsInstanceRef.current) {
        handsInstanceRef.current.close?.();
      }
    };
  }, [scriptsReady]);

  // Handle Fullscreen state shifts representation
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch((err) => {
          console.warn(`Fullscreen activation failed: ${err.message}`);
        });
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Synchronise fullScreen indicators
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  return (
    <div id="application-view-stage" className="relative w-screen h-screen overflow-hidden bg-gradient-to-b from-[#020205] to-[#060611] text-slate-100 font-sans">
      
      {/* 1. Header Banner HUD (Translucent futuristic glass bar) */}
      <header className="fixed top-0 left-0 w-full h-16 z-10 px-6 flex items-center justify-between border-b border-white/[0.04] bg-slate-950/20 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 rounded-xl border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.15)] flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-indigo-400 animate-pulse" />
          </div>
          <div>
            <h1 className="text-sm md:text-base font-bold font-sans tracking-wide text-white flex items-center gap-2">
              AetherSparks 3D 智能粒子手势声画系统
              <span className="hidden md:inline text-[9px] font-mono bg-indigo-500/15 text-indigo-400 px-1.5 py-0.5 rounded-md border border-indigo-500/20">v1.2</span>
            </h1>
            <p className="text-[10px] text-slate-400 mt-0.5 font-sans">
              Three.js + MediaPipe Realtime Kinetic Hand Interaction
            </p>
          </div>
        </div>

        {/* Global info status bar */}
        <div className="hidden lg:flex items-center gap-6">
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
            <span>引擎: WebGL Accelerated</span>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-400">
            <Hand className="h-3.5 w-3.5 text-indigo-400" />
            <span>姿态捕捉: {handData.detected ? '已锁定' : '待命'}</span>
          </div>
        </div>
      </header>

      {/* 2. Interactive Fullscreen Background Particle Canvas */}
      <ParticleCanvas 
        ref={canvasRef} 
        settings={settings} 
        handData={handData} 
      />

      {/* 3. Global Control Overlays Container */}
      <main className="absolute inset-x-0 bottom-0 top-16 z-10 p-6 flex justify-between pointer-events-none overflow-hidden select-none">
        
        {/* Left Side: Parameters Slider Controllers Panel */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="pointer-events-auto self-start mt-2"
        >
          <ControlPanel 
            settings={settings} 
            onSettingsChange={setSettings}
            onResetCamera={() => canvasRef.current?.resetCamera()}
            onTriggerBurst={() => canvasRef.current?.triggerBurst()}
            handDetected={handData.detected}
            handGesture={handData.gesture}
          />
        </motion.div>

        {/* Right Side: Preset 3D Model Selectors panel */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="pointer-events-auto self-start mt-2"
        >
          <PresetSelector 
            activePreset={settings.preset} 
            onPresetChange={(preset: ParticlePreset) => {
              setSettings((prev) => ({ ...prev, preset }));
            }}
          />
        </motion.div>
      </main>

      {/* 4. Bottom-Left: Live Picture-in-Picture Webcam tracking pane */}
      <HandWebcam 
        detected={handData.detected}
        handData={handData}
        landmarks={landmarks}
        videoRef={videoRef}
        webcamSize={settings.webcamSize}
        onSizeChange={(size) => setSettings((prev) => ({ ...prev, webcamSize: size }))}
        showSkeleton={settings.showSkeleton}
        onToggleSkeleton={() => setSettings((prev) => ({ ...prev, showSkeleton: !prev.showSkeleton }))}
        isLoading={cameraLoading && settings.webcamSize !== 'hidden'}
      />

      {/* 5. Bottom-Right Controls Corner (Fullscreen controls) */}
      <div id="fullscreen-action-zone" className="fixed bottom-6 right-6 z-20 flex gap-2">
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit Full Screen' : 'Enter Full Screen'}
          className="p-3 bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-2xl text-slate-300 hover:text-white shadow-xl backdrop-blur-md transition-all active:scale-95 flex items-center justify-center cursor-pointer"
        >
          {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
        </button>
      </div>

      {/* Loading Overlay if MediaPipe CDN scripts are being fetched */}
      <AnimatePresence>
        {!scriptsReady && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950 z-50 flex flex-col items-center justify-center gap-4 text-center px-6"
          >
            <div className="relative w-16 h-16 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
              <Sparkles className="h-6 w-6 text-indigo-400 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold font-sans tracking-wide text-white">正在加载星际粒子引擎...</h2>
              <p className="text-xs text-slate-400 mt-2 max-w-sm leading-relaxed">
                正在从全球 CDN 接入加速 MediaPipe 骨骼追踪模块与 Three.js 驱动，需要几秒钟。请确保网络畅通。
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dynamic Camera Blocked notification banner */}
      <AnimatePresence>
        {cameraError && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="fixed bottom-24 right-6 z-40 max-w-sm p-4 bg-rose-950/80 border border-rose-500/30 text-rose-200 rounded-2xl shadow-2xl backdrop-blur-md flex flex-col gap-2 font-sans"
          >
            <div className="flex items-center gap-2 font-semibold text-sm">
              <Info className="h-4 w-4 text-rose-400 shrink-0" />
              <span>智能手部感应拦截</span>
            </div>
            <p className="text-xs text-rose-300 leading-normal">
              {cameraError} 粒子系统切换为<b>鼠标/触屏拖拽与自动巡航混合模式</b>。推荐点击下方按钮，在新窗口中独立打开，即可顺畅启用摄像头。
            </p>
            <div className="flex justify-between items-center gap-2 mt-2">
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 shadow-lg select-none"
              >
                <Maximize className="h-3 w-3" /> 独立窗口打开
              </a>
              <button
                onClick={() => setCameraError(null)}
                className="text-[11px] font-bold text-rose-400 hover:text-rose-300 bg-rose-500/10 px-3 py-1.5 rounded-xl border border-rose-500/15"
              >
                我知道了
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
