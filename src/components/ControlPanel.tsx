import { SystemSettings, ParticlePreset } from '../types';
import { Sliders, Sparkles, RefreshCw, Palette, Layers, Minimize2, ZoomIn, Info, Orbit, Zap } from 'lucide-react';
import { motion } from 'motion/react';

interface ControlPanelProps {
  settings: SystemSettings;
  onSettingsChange: (settings: SystemSettings) => void;
  onResetCamera: () => void;
  onTriggerBurst: () => void;
  handDetected: boolean;
  handGesture: string;
}

const PRESET_COLORS = [
  '#3b82f6', // Azure Blue
  '#f43f5e', // Neon Rose
  '#f59e0b', // Amber Orange
  '#d946ef', // Fuchsia Magenta
  '#10b981', // Emerald Green
  '#a855f7', // Mystic Purple
  '#06b6d4', // Electric Cyan
  '#ffffff', // Supernova White
];

export function ControlPanel({
  settings,
  onSettingsChange,
  onResetCamera,
  onTriggerBurst,
  handDetected,
  handGesture,
}: ControlPanelProps) {
  const updateSetting = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => {
    onSettingsChange({
      ...settings,
      [key]: value,
    });
  };

  return (
    <div id="control-panel" className="flex flex-col gap-5 w-80 max-h-[85vh] overflow-y-auto pr-1">
      {/* Dynamic Hand interaction status HUD element */}
      <div className="p-4 rounded-2xl border border-indigo-500/20 bg-indigo-950/20 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Zap className={`h-4 w-4 ${handDetected ? 'text-emerald-400 animate-bounce' : 'text-slate-500'}`} />
          <span className="text-xs font-mono tracking-widest text-slate-400 font-semibold uppercase">
            Realtime Tracking / 手部实时追踪
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-slate-400">捕获状态:</div>
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${handDetected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
            <span className={`text-xs font-semibold font-mono ${handDetected ? 'text-emerald-400' : 'text-slate-500'}`}>
              {handDetected ? `ACTIVE` : 'WAITING'}
            </span>
          </div>
        </div>
        {handDetected && (
          <div className="mt-2 text-xs flex items-center justify-between font-mono">
            <span className="text-slate-400">手部姿态/手势:</span>
            <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/10 transition-all">
              {handGesture}
            </span>
          </div>
        )}
      </div>

      {/* Colors Section */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2 px-1">
          <Palette className="h-4 w-4 text-slate-400" />
          <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400 font-mono">
            Color Spectrum / 五彩斑斓基正色
          </h4>
        </div>
        <div className="p-4 rounded-2xl bg-black/40 border border-slate-800/60 backdrop-blur-md flex flex-col gap-3">
          {/* Quick preset grids */}
          <div className="grid grid-cols-4 gap-2">
            {PRESET_COLORS.map((color) => {
              const works = settings.baseColor === color;
              return (
                <button
                  key={color}
                  onClick={() => updateSetting('baseColor', color)}
                  style={{ backgroundColor: color }}
                  className={`h-8 rounded-lg cursor-pointer transition-transform hover:scale-110 active:scale-95 outline-none relative shadow-[0_4px_10px_rgba(0,0,0,0.3)] ${
                    works ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-slate-950 scale-105' : 'opacity-85'
                  }`}
                  title={color}
                />
              );
            })}
          </div>

          <div className="flex items-center gap-3 mt-1 pt-2 border-t border-slate-800/60">
            <input
              type="color"
              value={settings.baseColor}
              onChange={(e) => updateSetting('baseColor', e.target.value)}
              className="w-9 h-8 bg-transparent border-0 rounded-lg cursor-pointer outline-none shrink-0"
              id="custom-color-picker"
            />
            <div className="flex-1 min-w-0">
              <label htmlFor="custom-color-picker" className="text-xs text-slate-400 font-medium cursor-pointer block truncate">
                Custom Color Picker
              </label>
              <div className="text-[10px] font-mono text-slate-500 uppercase mt-0.5">{settings.baseColor}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Sliders Adjustment Panel */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2 px-1">
          <Sliders className="h-4 w-4 text-slate-400" />
          <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400 font-mono">
            Particle Controls / 密度与大小
          </h4>
        </div>

        <div className="p-4 rounded-2xl bg-black/40 border border-slate-800/60 backdrop-blur-md flex flex-col gap-4">
          {/* 1. Density Slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-400 font-medium">粒子密度 / Density</span>
              <span className="text-xs font-mono font-semibold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                {settings.density.toLocaleString()}
              </span>
            </div>
            <input
              type="range"
              min="5000"
              max="80000"
              step="1000"
              value={settings.density}
              onChange={(e) => updateSetting('density', parseInt(e.target.value))}
              className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 outline-none"
            />
            <div className="flex justify-between text-[9px] font-mono text-slate-500 mt-1">
              <span>5,000 (超流畅)</span>
              <span>80,000 (极斑斓)</span>
            </div>
          </div>

          {/* 2. Size Slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-400 font-medium">粒子光点大小 / Particle Size</span>
              <span className="text-xs font-mono font-semibold text-indigo-400">
                {settings.size.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min="0.4"
              max="4.0"
              step="0.1"
              value={settings.size}
              onChange={(e) => updateSetting('size', parseFloat(e.target.value))}
              className="w-full h-1 bg-slate-850 rounded-lg appearance-none cursor-pointer accent-indigo-500 outline-none"
            />
          </div>

          {/* Glow Intensity Slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-400 font-medium">粒子核心亮度 / Glow Brightness</span>
              <span className="text-xs font-mono font-semibold text-indigo-400">
                {settings.glowIntensity.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="4.0"
              step="0.1"
              value={settings.glowIntensity}
              onChange={(e) => updateSetting('glowIntensity', parseFloat(e.target.value))}
              className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 outline-none"
            />
          </div>

          {/* 3. Auto Rotate speed slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-400 font-medium">自转速度 / Auto Rotate</span>
              <span className="text-xs font-mono font-semibold text-indigo-400">
                {settings.autoRotateSpeed.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min="0.0"
              max="2.5"
              step="0.1"
              value={settings.autoRotateSpeed}
              onChange={(e) => updateSetting('autoRotateSpeed', parseFloat(e.target.value))}
              className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 outline-none"
            />
          </div>

          {/* 4. Color Shift speed slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-400 font-medium">梦幻色彩变幻 / Color Spectrum Shaker</span>
              <span className="text-xs font-mono font-semibold text-indigo-400">
                {settings.colorShiftSpeed.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min="0.0"
              max="2.0"
              step="0.1"
              value={settings.colorShiftSpeed}
              onChange={(e) => updateSetting('colorShiftSpeed', parseFloat(e.target.value))}
              className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Advanced toggle filters / Switches */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2 px-1">
          <Orbit className="h-4 w-4 text-slate-400" />
          <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400 font-mono">
            Interaction Mode / 交互模式调节
          </h4>
        </div>

        <div className="p-4 rounded-2xl bg-black/40 border border-slate-800/60 backdrop-blur-md flex flex-col gap-3">
          {/* Attraction Mode */}
          <label className="flex items-center justify-between cursor-pointer group">
            <span className="text-xs text-slate-300 font-medium group-hover:text-slate-100 transition-colors">
              手心引力漩涡 / Attractor Gravity
            </span>
            <input
              type="checkbox"
              checked={settings.attractorMode}
              onChange={(e) => updateSetting('attractorMode', e.target.checked)}
              className="sr-only peer"
            />
            <div className="relative w-9 h-5 bg-slate-850 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600 peer-checked:after:bg-slate-50" />
          </label>

          <p className="text-[10px] text-slate-500 leading-normal mb-1">
            开启后，粒子将对准手掌所在 3D 点施加微重力拉力，形成星际粒子风暴流。
          </p>

          <label className="flex items-center justify-between cursor-pointer group pt-2 border-t border-slate-800/60">
            <span className="text-xs text-slate-300 font-medium group-hover:text-slate-100 transition-colors">
              手势敏感度 / Tracking Sensitivity
            </span>
            <span className="text-xs font-mono text-indigo-400">{settings.interactionSensitivity.toFixed(1)}</span>
          </label>
          <input
            type="range"
            min="0.5"
            max="2.5"
            step="0.1"
            value={settings.interactionSensitivity}
            onChange={(e) => updateSetting('interactionSensitivity', parseFloat(e.target.value))}
            className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 outline-none"
          />
        </div>
      </div>

      {/* Button triggers */}
      <div className="flex gap-2.5">
        <button
          onClick={onResetCamera}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-850 hover:border-slate-700 rounded-xl text-xs font-semibold text-slate-200 shadow-md transition-all active:scale-95 cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5 text-indigo-400" />
          重置视角 / Focus
        </button>
        <button
          onClick={onTriggerBurst}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-indigo-950/40 border border-indigo-700/40 hover:bg-indigo-900/40 hover:border-indigo-600/50 rounded-xl text-xs font-semibold text-indigo-300 shadow-md transition-all active:scale-95 cursor-pointer"
        >
          <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
          极光粒子冲击 / Shock
        </button>
      </div>

      {/* Instruction Section */}
      <div className="p-4 rounded-xl border border-slate-800/50 bg-slate-950/50 flex gap-3 text-left">
        <Info className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold tracking-wider text-slate-300 uppercase font-mono">
            Control Guide / 交互手势秘籍
          </span>
          <p className="text-[10px] text-slate-400/90 leading-relaxed font-sans">
            ① <strong>掌开（扩散）：</strong>伸开五指，模型粒子剧烈对外扩散喷薄。<br />
            ② <strong>握拳（回弹）：</strong>五指聚紧成拳，粒子瞬时向重力球核心缩紧。<br />
            ③ <strong>位移（自转）：</strong>上下左右摇晃手部，粒子系统沿平面作陀螺流线旋转。<br />
            ④ <strong>划过爆发：</strong>使劲挥手或做出五指张贴即闪动作，能够引爆星空级粒子极光！
          </p>
        </div>
      </div>
    </div>
  );
}
