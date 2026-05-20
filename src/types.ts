export type ParticlePreset = 'nebula' | 'fireworks' | 'saturn' | 'flower';

export interface ParticlePresetInfo {
  id: ParticlePreset;
  name: string;
  chineseName: string;
  description: string;
  icon: string;
  defaultColor: string;
  defaultDensity: number;
}

export interface HandData {
  detected: boolean;
  x: number; // Normalized -1 to 1
  y: number; // Normalized -1 to 1
  z: number; // Depth relative (approximate)
  openness: number; // 0 (fist) to 1 (fully open)
  fingerCount: number; // 0 to 5 extended fingers
  gesture: string; // Friendly name: "握拳", "张开手掌", "V字手势", "食指指向" 等
  speed: number; // Speed of motion
}

export interface SystemSettings {
  preset: ParticlePreset;
  baseColor: string;
  density: number; // 5000 to 50000
  size: number; // particle size factor
  glowIntensity: number; // brightness additions
  autoRotateSpeed: number; // speed when hand is not interacting
  interactionSensitivity: number; // how strongly track affects movement
  webcamSize: 'sm' | 'md' | 'lg' | 'hidden';
  showSkeleton: boolean; // draw Mediapipe outline over camera
  colorShiftSpeed: number; // Hue shift rate
  audioReactive: boolean; // Optional: react to microphone
  attractorMode: boolean; // Particles attracted to hand position
}
