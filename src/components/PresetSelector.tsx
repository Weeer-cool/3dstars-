import { ParticlePreset, ParticlePresetInfo } from '../types';
import { motion } from 'motion/react';
import { Sparkles, Flame, Moon, Flower } from 'lucide-react';

interface PresetSelectorProps {
  activePreset: ParticlePreset;
  onPresetChange: (preset: ParticlePreset) => void;
}

const PRESETS: ParticlePresetInfo[] = [
  {
    id: 'nebula',
    name: 'Cosmic Nebula',
    chineseName: '星云漩涡',
    description: 'A three-arm spiral galactic vortex with a dense glowing nucleus and spiral arms.',
    icon: 'nebula',
    defaultColor: '#3b82f6',
    defaultDensity: 15000,
  },
  {
    id: 'fireworks',
    name: 'Stellar Fireworks',
    chineseName: '超新星烟花',
    description: 'Exploding cosmic pyrotechnics shell with secondary launch sparkles and falling tails.',
    icon: 'fireworks',
    defaultColor: '#f43f5e',
    defaultDensity: 18000,
  },
  {
    id: 'saturn',
    name: 'Saturnian Rings',
    chineseName: '土星光环',
    description: 'Concentric Keplerian orbiting particle rings separated by crisp Cassini structural divisions.',
    icon: 'saturn',
    defaultColor: '#f59e0b',
    defaultDensity: 22000,
  },
  {
    id: 'flower',
    name: 'Blooming Lotus',
    chineseName: '数学秩序花朵',
    description: 'A 3D parametric multi-petal flower designed using mathematical rose curves.',
    icon: 'flower',
    defaultColor: '#d946ef',
    defaultDensity: 16000,
  },
];

export function PresetSelector({ activePreset, onPresetChange }: PresetSelectorProps) {
  const getPresetIcon = (iconName: string) => {
    switch (iconName) {
      case 'nebula':
        return <Sparkles className="h-5 w-5 text-indigo-400" />;
      case 'fireworks':
        return <Flame className="h-5 w-5 text-rose-400" />;
      case 'saturn':
        return <Moon className="h-5 w-5 text-amber-400 rotate-90" />;
      case 'flower':
        return <Flower className="h-5 w-5 text-fuchsia-400" />;
      default:
        return <Sparkles className="h-5 w-5" />;
    }
  };

  return (
    <div id="preset-selector-panel" className="flex flex-col gap-3 w-72 md:w-80 max-h-[85vh] overflow-y-auto">
      <div className="flex items-center gap-2 mb-1 px-1">
        <div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 font-mono">
          3D Particle Shapes / 预设几何模型
        </h3>
      </div>

      <div className="flex flex-col gap-3">
        {PRESETS.map((p) => {
          const isActive = p.id === activePreset;
          return (
            <motion.button
              key={p.id}
              onClick={() => onPresetChange(p.id)}
              whileHover={{ x: -4, scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className={`relative flex flex-col p-4 text-left rounded-xl border transition-all duration-300 outline-none overflow-hidden backdrop-blur-md group ${
                isActive
                  ? 'bg-indigo-950/40 border-indigo-500/70 shadow-[0_0_15px_rgba(99,102,241,0.25)]'
                  : 'bg-black/40 border-slate-800/60 hover:bg-slate-900/40 hover:border-slate-700/60'
              }`}
            >
              {/* Highlight background glow */}
              {isActive && (
                <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-indigo-500/10 rounded-full blur-2xl" />
              )}

              <div className="flex items-start justify-between gap-3 font-sans">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-lg transition-transform group-hover:scale-110 ${
                    isActive ? 'bg-indigo-500/15' : 'bg-slate-900'
                  }`}>
                    {getPresetIcon(p.icon)}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-100 text-sm tracking-wide md:text-base">
                      {p.chineseName}
                    </div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mt-0.5">
                      {p.name}
                    </div>
                  </div>
                </div>

                {isActive && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 bg-indigo-500/15 text-indigo-400 rounded-md border border-indigo-500/20">
                    ACTIVE
                  </span>
                )}
              </div>

              <p className="mt-2.5 text-xs text-slate-400/80 leading-relaxed font-sans">
                {p.description}
              </p>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
