import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { ParticlePreset, HandData, SystemSettings } from '../types';

interface ParticleCanvasProps {
  settings: SystemSettings;
  handData: HandData;
}

export interface ParticleCanvasRef {
  resetCamera: () => void;
  triggerBurst: () => void;
}

// Convert Hex color to HSL
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

// Convert HSL to RGB
function hslToRgb(h: number, s: number, l: number): THREE.Color {
  // Clamp and wrap values stably
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s));
  l = Math.max(0, Math.min(100, l));

  h /= 360;
  s /= 100;
  l /= 100;
  let r = l;
  let g = l;
  let b = l;

  if (s !== 0) {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return new THREE.Color(r, g, b);
}

export const ParticleCanvas = forwardRef<ParticleCanvasRef, ParticleCanvasProps>(
  ({ settings, handData }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const requestRef = useRef<number | null>(null);

    // Dynamic state trackers
    const activePresetRef = useRef<ParticlePreset>(settings.preset);
    const handDataRef = useRef<HandData>(handData);
    const settingsRef = useRef<SystemSettings>(settings);

    // Particle system references
    const mainParticlesRef = useRef<THREE.Points | null>(null);
    const backgroundStarsRef = useRef<THREE.Points | null>(null);
    const mainGroupRef = useRef<THREE.Group | null>(null);

    // Buffers for tweening / morphing positions
    const currentPositionsArray = useRef<Float32Array | null>(null);
    const targetPositionsArray = useRef<Float32Array | null>(null);
    const particleSpeeds = useRef<Float32Array | null>(null);
    const morphProgressRef = useRef<number>(1.0); // 1.0 means fully morphed
    const originalColorsRef = useRef<Float32Array | null>(null);

    // Draggability states
    const isDraggingRef = useRef<boolean>(false);

    // Smoothed hand tracking to completely filter out mediaPipe camera jitter
    const smoothedHandRef = useRef({
      detectFactor: 0.0,
      x: 0.0,
      y: 0.0,
      z: 0.5,
      openness: 0.5,
    });

    // Extra sparkle bursts
    const burstEffectRef = useRef<{ active: boolean; scale: number; speed: number }>({
      active: false,
      scale: 1.0,
      speed: 0.05,
    });

    // Update refs to ensure render loop can always read current states without context-loss
    useEffect(() => {
      handDataRef.current = handData;
    }, [handData]);

    useEffect(() => {
      settingsRef.current = settings;
      if (activePresetRef.current !== settings.preset) {
        animateToPreset(settings.preset);
      } else {
        updateParticleColorsDensityAndSize();
      }
    }, [settings]);

    // Handle Exposes
    useImperativeHandle(ref, () => ({
      resetCamera: () => {
        if (cameraRef.current) {
          cameraRef.current.position.set(0, 0, 15);
          cameraRef.current.lookAt(0, 0, 0);
          if (mainGroupRef.current) {
            mainGroupRef.current.rotation.set(0, 0, 0);
          }
        }
      },
      triggerBurst: () => {
        burstEffectRef.current.active = true;
        burstEffectRef.current.scale = 1.0;
        burstEffectRef.current.speed = 0.08;
      }
    }));

    // Create custom particle glow texture via canvas context (extremely lightweight & avoids cross-origin loader issues)
    const createParticleTexture = (): THREE.Texture => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        gradient.addColorStop(0.12, 'rgba(255, 255, 255, 0.85)');
        gradient.addColorStop(0.28, 'rgba(235, 242, 255, 0.55)');
        gradient.addColorStop(0.6, 'rgba(120, 180, 255, 0.18)');
        gradient.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      return texture;
    };

    // Calculate specific mathematical shape coordinate targets
    const computeShapeTargetPoint = (
      index: number,
      totalCount: number,
      preset: ParticlePreset,
      baseColorHex: string
    ): { pos: THREE.Vector3; color: THREE.Color } => {
      const pos = new THREE.Vector3();
      const colorInfo = hexToHsl(baseColorHex);
      let color = new THREE.Color();

      switch (preset) {
        case 'nebula': {
          // A dense core with multi-arm spiral galaxy streams
          const numArms = 3;
          const armIndex = index % numArms;
          
          // Distribution: higher density in core (log scale)
          const p = index / totalCount;
          const r = Math.pow(p, 0.5) * 11.0 + 0.1; 
          
          const angleOffset = r * 0.45; // spiral twist factor
          const baseAngle = (armIndex * 2 * Math.PI) / numArms + angleOffset;
          
          // Gaussian spread dispersion
          const thetaSpread = (Math.random() - 0.5) * 0.35 / (r * 0.12 + 0.5);
          const finalAngle = baseAngle + thetaSpread;
          
          const noiseX = (Math.random() - 0.5) * 0.4;
          const noiseZ = (Math.random() - 0.5) * 0.4;

          pos.x = r * Math.cos(finalAngle) + noiseX;
          // Thin visual galaxy pancake disc heights
          pos.y = (Math.random() - 0.5) * 1.6 * Math.exp(-r / 4.5); 
          pos.z = r * Math.sin(finalAngle) + noiseZ;

          // Inside core has a warmer/white accent color, outer arms match selected base color and shift
          const hueOffset = r * 15; // Hue grows as we travel outward
          if (r < 2.0) {
            color = hslToRgb((colorInfo.h + 40) % 360, 60, 85); // Warm dense core
          } else {
            color = hslToRgb((colorInfo.h + hueOffset) % 360, colorInfo.s, colorInfo.l);
          }
          break;
        }

        case 'fireworks': {
          // Exploding central sphere with micro streamers and randomized blast radiuses
          const seedIndex = Math.floor(index / 1200); // multiple fireworks core sub-centers
          const localIndex = index % 1200;
          
          // Golden ratio distribution for spherical symmetry
          const theta = Math.acos(2 * (localIndex / 1200) - 1);
          const phi = localIndex * 2.39996 * Math.PI; // Golden angle

          const isTrail = Math.random() < 0.25;
          let r = 0;
          
          if (isTrail) {
            r = Math.random() * 4.0; // rocket trailing smoke sparks
          } else {
            r = 6.0 + Math.random() * 3.5; // outer blast layer
          }

          pos.x = r * Math.sin(theta) * Math.cos(phi);
          pos.y = r * Math.sin(theta) * Math.sin(phi);
          pos.z = r * Math.cos(theta);

          // Add a minor launch shift
          if (seedIndex % 3 === 0) {
            pos.x += 1.5; pos.y += 1.0;
          } else if (seedIndex % 3 === 1) {
            pos.x -= 1.5; pos.y -= 1.0;
          }

          // Shimmering multi-colored sparkles
          const hueOffset = (localIndex * 0.3 + seedIndex * 70) % 360;
          color = hslToRgb((colorInfo.h + hueOffset) % 360, 95, isTrail ? 60 : 78);
          break;
        }

        case 'saturn': {
          // Central massive planetary core + thin Cassini rings with dark divisions
          const isRing = index < totalCount * 0.72;

          if (isRing) {
            // Saturn Concentric visual discs
            const ringIndex = index;
            const ringCount = Math.floor(totalCount * 0.72);
            const p = ringIndex / ringCount;
            
            // Random radii between 4.8 and 10.5
            let r = 5.0 + p * 5.5;
            
            // Generate Ring Gaps (like Cassini Division and Encke Gap)
            if (r > 7.3 && r < 8.0) {
              r = r < 7.65 ? 7.3 - Math.random() * 0.3 : 8.0 + Math.random() * 0.35;
            } else if (r > 9.3 && r < 9.6) {
              r = Math.random() < 0.5 ? 9.2 - Math.random() * 0.15 : 9.7 + Math.random() * 0.15;
            }

            const angle = Math.random() * Math.PI * 2;
            pos.x = r * Math.cos(angle);
            // Ultra flat disc ring
            pos.y = (Math.random() - 0.5) * 0.12; 
            pos.z = r * Math.sin(angle);

            // Shading of rings - alternate light/dark rings using hex HSL
            const ringBands = Math.sin(r * 5.0);
            const lightnessFactor = 45 + ringBands * 15;
            color = hslToRgb((colorInfo.h - 15) % 360, colorInfo.s - 20, lightnessFactor);
          } else {
            // Planterary Core Sphere inside
            const sphereIndex = index - Math.floor(totalCount * 0.72);
            const sphereCount = totalCount - Math.floor(totalCount * 0.72);
            
            const u = Math.random();
            const v = Math.random();
            const theta = u * 2.0 * Math.PI;
            const phi = Math.acos(2.0 * v - 1.0);
            
            // Concentrated sphere core
            const r = Math.cbrt(Math.random()) * 3.3; 
            
            pos.x = r * Math.sin(phi) * Math.cos(theta);
            pos.y = r * Math.sin(phi) * Math.sin(theta) * 0.94; // slightly oblate spheroid
            pos.z = r * Math.cos(phi);

            // Give the gas giant planet horizontal banded colors!
            const layerFreq = Math.sin(pos.y * 2.5);
            const hueOffset = layerFreq * 18;
            color = hslToRgb((colorInfo.h + 25 + hueOffset) % 360, colorInfo.s, 56);
          }
          break;
        }

        case 'flower': {
          // Parametric Torus wave Rose Curve
          const theta = (index / totalCount) * Math.PI; // 0 to Pi
          const phi = (index * 137.5 * Math.PI) / 180; // golden spiral increment
          
          const petalCount = 6;
          // Radius varies dynamically with periodic wave multipliers
          const pAngle = phi * petalCount;
          const waveHeight = 2.5 * Math.sin(pAngle);
          
          let r = 5.5 + waveHeight * Math.sin(theta * 3.0);
          
          // Expand the radial spread
          pos.x = r * Math.sin(theta) * Math.cos(phi);
          pos.y = r * Math.cos(theta) * 0.9 + Math.sin(pAngle * 2) * 0.4;
          pos.z = r * Math.sin(theta) * Math.sin(phi);

          // Flower petals have glowing edges or gradients from base index
          const hueOffset = (pos.length() * 12) % 360;
          color = hslToRgb((colorInfo.h + hueOffset) % 360, 90, 68);
          break;
        }
      }

      return { pos, color };
    };

    // Initialize Particle geometry buffers
    const initParticleSystems = (scene: THREE.Scene) => {
      const totalCount = settingsRef.current.density;
      const baseColor = settingsRef.current.baseColor;
      const currentPreset = activePresetRef.current;

      // Ensure geometry
      const mainGeometry = new THREE.BufferGeometry();
      
      const positions = new Float32Array(totalCount * 3);
      const colors = new Float32Array(totalCount * 3);
      const speeds = new Float32Array(totalCount);

      currentPositionsArray.current = new Float32Array(totalCount * 3);
      targetPositionsArray.current = new Float32Array(totalCount * 3);
      originalColorsRef.current = new Float32Array(totalCount * 3);

      for (let i = 0; i < totalCount; i++) {
        const { pos, color } = computeShapeTargetPoint(i, totalCount, currentPreset, baseColor);

        // Positions initialization
        positions[i * 3] = pos.x;
        positions[i * 3 + 1] = pos.y;
        positions[i * 3 + 2] = pos.z;

        // Save current and target in arrays for smooth morphing animations
        currentPositionsArray.current[i * 3] = pos.x;
        currentPositionsArray.current[i * 3 + 1] = pos.y;
        currentPositionsArray.current[i * 3 + 2] = pos.z;

        targetPositionsArray.current[i * 3] = pos.x;
        targetPositionsArray.current[i * 3 + 1] = pos.y;
        targetPositionsArray.current[i * 3 + 2] = pos.z;

        // Speeds
        speeds[i] = 0.02 + Math.random() * 0.05;

        // Custom base HSL Color
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;

        originalColorsRef.current[i * 3] = color.r;
        originalColorsRef.current[i * 3 + 1] = color.g;
        originalColorsRef.current[i * 3 + 2] = color.b;
      }

      mainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      mainGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      mainGeometry.computeBoundingSphere();
      particleSpeeds.current = speeds;

      // Glow points texture
      const glowTexture = createParticleTexture();

      // Custom glowing material using additive blending with elegant sizing and configurable opacity
      const mainMaterial = new THREE.PointsMaterial({
        size: settingsRef.current.size * 0.6,
        map: glowTexture,
        vertexColors: true,
        transparent: true,
        opacity: Math.max(0.05, Math.min(1.0, settingsRef.current.glowIntensity * 0.35)),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      });

      const points = new THREE.Points(mainGeometry, mainMaterial);
      
      const mainGroup = new THREE.Group();
      mainGroup.add(points);
      scene.add(mainGroup);

      mainParticlesRef.current = points;
      mainGroupRef.current = mainGroup;

      // 2. CREATE RANDOM BACKGROUND STATIC STARFIELD (Increasing deep space parallax depth)
      const starCount = 3500;
      const starGeometry = new THREE.BufferGeometry();
      const starPos = new Float32Array(starCount * 3);
      const starColors = new Float32Array(starCount * 3);

      for (let i = 0; i < starCount; i++) {
        // Distribute uniformly on outer space shells
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        const radius = 60 + Math.random() * 120; // far away

        starPos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        starPos[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        starPos[i * 3 + 2] = radius * Math.cos(phi);

        // Background stars have subtle pastel cosmic tints (blues, purples, oranges, whites)
        const randType = Math.random();
        if (randType < 0.3) {
          // Blueish Star
          starColors[i * 3] = 0.65; starColors[i * 3 + 1] = 0.8; starColors[i * 3 + 2] = 1.0;
        } else if (randType < 0.6) {
          // Soft Purple/Magenta
          starColors[i * 3] = 0.78; starColors[i * 3 + 1] = 0.6; starColors[i * 3 + 2] = 0.95;
        } else if (randType < 0.8) {
          // Yellow orange
          starColors[i * 3] = 0.95; starColors[i * 3 + 1] = 0.75; starColors[i * 3 + 2] = 0.55;
        } else {
          // Pure White
          starColors[i * 3] = 1.0; starColors[i * 3 + 1] = 1.0; starColors[i * 3 + 2] = 1.0;
        }
      }

      starGeometry.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
      starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
      starGeometry.computeBoundingSphere();

      const starMaterial = new THREE.PointsMaterial({
        size: 0.45,
        map: glowTexture,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
        opacity: 0.35,
      });

      const backgroundStars = new THREE.Points(starGeometry, starMaterial);
      scene.add(backgroundStars);
      backgroundStarsRef.current = backgroundStars;
    };

    // Smoothly calculate and trigger morph animation when user targets a different shape preset
    const animateToPreset = (newPreset: ParticlePreset) => {
      activePresetRef.current = newPreset;
      const totalCount = settingsRef.current.density;
      const baseColor = settingsRef.current.baseColor;

      if (!mainParticlesRef.current || !currentPositionsArray.current || !targetPositionsArray.current) {
        return;
      }

      // Re-capture current absolute positions as starting point for tweening
      const positionAttr = mainParticlesRef.current.geometry.attributes.position as THREE.BufferAttribute;
      const positions = positionAttr.array as Float32Array;

      for (let i = 0; i < totalCount * 3; i++) {
        currentPositionsArray.current[i] = positions[i];
      }

      if (!originalColorsRef.current) {
        originalColorsRef.current = new Float32Array(totalCount * 3);
      }

      // Compute targeted coordinates positions and baseline colors
      for (let i = 0; i < totalCount; i++) {
        const { pos, color } = computeShapeTargetPoint(i, totalCount, newPreset, baseColor);
        targetPositionsArray.current[i * 3] = pos.x;
        targetPositionsArray.current[i * 3 + 1] = pos.y;
        targetPositionsArray.current[i * 3 + 2] = pos.z;

        originalColorsRef.current[i * 3] = color.r;
        originalColorsRef.current[i * 3 + 1] = color.g;
        originalColorsRef.current[i * 3 + 2] = color.b;
      }

      // Rest morph progress tracker and let the core render loop increment it
      morphProgressRef.current = 0.0;
    };

    // Update colors, density or sizes inline when React settings parameters shift
    const updateParticleColorsDensityAndSize = () => {
      const points = mainParticlesRef.current;
      if (!points) return;

      const totalCount = settingsRef.current.density;
      const baseColor = settingsRef.current.baseColor;
      const size = settingsRef.current.size;
      const currentPreset = activePresetRef.current;

      // Update particle material size and glow opacity
      if (points.material instanceof THREE.PointsMaterial) {
        points.material.size = size * 0.6;
        points.material.opacity = Math.max(0.05, Math.min(1.0, settingsRef.current.glowIntensity * 0.35));
        points.material.needsUpdate = true;
      }

      // Verify and resize buffer size if user increases or decreases particle density on the fly
      const positionAttr = points.geometry.attributes.position as THREE.BufferAttribute;
      const currentBufferSize = positionAttr.count;

      if (currentBufferSize !== totalCount) {
        // Re-construct the systems fully to match newly desired density buffers
        if (sceneRef.current && mainGroupRef.current) {
          sceneRef.current.remove(mainGroupRef.current);
          initParticleSystems(sceneRef.current);
        }
        return;
      }

      // Otherwise, modify colors and target positions dynamically of existing buffers
      const colorAttr = points.geometry.attributes.color as THREE.BufferAttribute;
      const colors = colorAttr.array as Float32Array;

      if (!originalColorsRef.current) {
        originalColorsRef.current = new Float32Array(totalCount * 3);
      }

      for (let i = 0; i < totalCount; i++) {
        const { pos, color } = computeShapeTargetPoint(i, totalCount, currentPreset, baseColor);

        // Soft gradient color mapping
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;

        originalColorsRef.current[i * 3] = color.r;
        originalColorsRef.current[i * 3 + 1] = color.g;
        originalColorsRef.current[i * 3 + 2] = color.b;

        // If morphing is complete, update standard targets so that adjustments in shapes are drawn instantly
        if (morphProgressRef.current >= 1.0 && targetPositionsArray.current) {
          targetPositionsArray.current[i * 3] = pos.x;
          targetPositionsArray.current[i * 3 + 1] = pos.y;
          targetPositionsArray.current[i * 3 + 2] = pos.z;
        }
      }

      colorAttr.needsUpdate = true;
    };

    // Core Setup
    useEffect(() => {
      // Create Scene, Camera and WebGL Engine
      const width = containerRef.current?.clientWidth || window.innerWidth;
      const height = containerRef.current?.clientHeight || window.innerHeight;

      const scene = new THREE.Scene();
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
      camera.position.set(0, 0, 15);
      camera.lookAt(0, 0, 0);
      cameraRef.current = camera;

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      
      // Force block, absolute styling on canvas element to ensure correct layout sizing
      renderer.domElement.style.position = 'absolute';
      renderer.domElement.style.top = '0';
      renderer.domElement.style.left = '0';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.display = 'block';
      
      if (containerRef.current) {
        containerRef.current.appendChild(renderer.domElement);
      }
      rendererRef.current = renderer;

      // Populate interactive elements
      initParticleSystems(scene);

      // Animation variables
      let time = 0;
      let autoRotY = 0;
      let autoRotX = 0;
      let handTiltY = 0;
      let handTiltX = 0;

      // Drag to rotate fallback interactions when camera is not presenting
      let previousMousePosition = { x: 0, y: 0 };

      const onMouseDown = (e: MouseEvent) => {
        isDraggingRef.current = true;
        previousMousePosition = { x: e.clientX, y: e.clientY };
      };

      const onMouseMove = (e: MouseEvent) => {
        if (!isDraggingRef.current || !mainGroupRef.current) return;
        
        const deltaMove = {
          x: e.clientX - previousMousePosition.x,
          y: e.clientY - previousMousePosition.y
        };

        autoRotY += deltaMove.x * 0.007;
        autoRotX += deltaMove.y * 0.007;

        previousMousePosition = { x: e.clientX, y: e.clientY };
      };

      const onMouseUp = () => {
        isDraggingRef.current = false;
      };

      const onTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 1) {
          isDraggingRef.current = true;
          previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
      };

      const onTouchMove = (e: TouchEvent) => {
        if (!isDraggingRef.current || !mainGroupRef.current || e.touches.length !== 1) return;
        
        const deltaMove = {
          x: e.touches[0].clientX - previousMousePosition.x,
          y: e.touches[0].clientY - previousMousePosition.y
        };

        autoRotY += deltaMove.x * 0.007;
        autoRotX += deltaMove.y * 0.007;

        previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      };

      const container = containerRef.current;
      if (container) {
        container.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        container.addEventListener('touchstart', onTouchStart, { passive: true });
        container.addEventListener('touchmove', onTouchMove, { passive: true });
        container.addEventListener('touchend', onMouseUp);
      }

      // Resize observer
      const handleResize = () => {
        if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
        let w = containerRef.current.clientWidth;
        let h = containerRef.current.clientHeight;

        if (w === 0 || h === 0) {
          w = window.innerWidth;
          h = window.innerHeight;
        }

        cameraRef.current.aspect = w / h;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(w, h);
      };

      const resizeObserver = new ResizeObserver(handleResize);
      if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
      }

      // RENDER ANIMATION LOOP (Core High Frequency Tick)
      const tick = () => {
        time += 0.005;

        const mainPoints = mainParticlesRef.current;
        const mainGroup = mainGroupRef.current;
        const bgStars = backgroundStarsRef.current;
        const hd = handDataRef.current;
        const s = settingsRef.current;

        // 1. Slow cosmic background starfield rotation for depth
        if (bgStars) {
          bgStars.rotation.y = time * 0.03;
          bgStars.rotation.x = time * 0.01;
        }

        if (mainPoints && mainGroup) {
          const positionAttr = mainPoints.geometry.attributes.position as THREE.BufferAttribute;
          const positions = positionAttr.array as Float32Array;
          const count = positionAttr.count;

          // Increment Interpolation/Morph progress
          if (morphProgressRef.current < 1.0) {
            // Easing lerp morph rate - slightly slower for supreme transition elegance
            morphProgressRef.current += 0.012;
            if (morphProgressRef.current > 1.0) morphProgressRef.current = 1.0;
          }

          // Smoothly update smoothed hand parameters inside the main render loop with much higher smoothing factor
          // to completely filter out high-frequency camera frames jitter and tracking noise
          const sh = smoothedHandRef.current;
          if (hd.detected) {
            // Slower, more inertia-based updates to eliminate sudden jumps and tracking drops
            sh.detectFactor += (1.0 - sh.detectFactor) * 0.06;
            sh.x += (hd.x - sh.x) * 0.04;
            sh.y += (hd.y - sh.y) * 0.04;
            sh.z += (hd.z - sh.z) * 0.04;
            sh.openness += (hd.openness - sh.openness) * 0.04;
          } else {
            sh.detectFactor += (0.0 - sh.detectFactor) * 0.04;
            sh.x += (0.0 - sh.x) * 0.02;
            sh.y += (0.0 - sh.y) * 0.02;
            sh.z += (0.5 - sh.z) * 0.02;
            sh.openness += (0.5 - sh.openness) * 0.02;
          }

          // Handle Custom Palm dispersion (explosion/contraction) blended seamlessly using detectFactor
          const activeScaling = 0.4 + sh.openness * 1.5;
          const idleScaling = 1.0 + Math.sin(time * 3) * 0.08;
          const opennessScaling = THREE.MathUtils.lerp(idleScaling, activeScaling, sh.detectFactor);

          // Process Sparkle shockwave burst triggering if user makes gestures
          if (burstEffectRef.current.active) {
            burstEffectRef.current.scale += burstEffectRef.current.speed;
            if (burstEffectRef.current.scale > 2.5) {
              burstEffectRef.current.active = false;
            }
          }

          // Morph/Animate positions of every main particle
          if (currentPositionsArray.current && targetPositionsArray.current) {
            const mProgress = morphProgressRef.current;
            const easeProgress = 3 * mProgress * mProgress - 2 * mProgress * mProgress * mProgress; // Smoothstep

            const maxLen = Math.min(count * 3, currentPositionsArray.current.length, targetPositionsArray.current.length);

            // Compute ideal damping factor to add fluid structural inertia directly on particle coordinate changes.
            // When morphing is actively swapping presets, we allow a slightly faster tracking rate so the shapes lock faster.
            const damp = mProgress < 0.95 ? 0.09 : 0.06;

            for (let i = 0; i < count; i++) {
              const i3 = i * 3;
              if (i3 + 2 >= maxLen) {
                continue;
              }

              // Base linear interpolation (lerp) towards current preset shape coordinates
              const targetX = currentPositionsArray.current[i3] + (targetPositionsArray.current[i3] - currentPositionsArray.current[i3]) * easeProgress;
              const targetY = currentPositionsArray.current[i3 + 1] + (targetPositionsArray.current[i3 + 1] - currentPositionsArray.current[i3 + 1]) * easeProgress;
              const targetZ = currentPositionsArray.current[i3 + 2] + (targetPositionsArray.current[i3 + 2] - currentPositionsArray.current[i3 + 2]) * easeProgress;

              // Apply expansion factor (hand openness)
              let fX = targetX * opennessScaling;
              let fY = targetY * opennessScaling;
              let fZ = targetZ * opennessScaling;

              // Trigger custom physical force using smoothed fields to completely avoid coordinate teleporting/flicker
              if (s.attractorMode && sh.detectFactor > 0.01) {
                // Project Hand coordinates to THREE Space dimensions
                const handTargetX = sh.x * 12.0;
                const handTargetY = -sh.y * 10.0;
                const handTargetZ = (sh.z - 0.5) * 10.0;

                // Simple orbit/attractor physics pulling particles towards hand
                const dx = handTargetX - targetX;
                const dy = handTargetY - targetY;
                const dz = handTargetZ - targetZ;

                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1.0;
                const pullPower = (1.5 / distance) * s.interactionSensitivity * sh.detectFactor;

                fX += dx * pullPower;
                fY += dy * pullPower;
                fZ += dz * pullPower;
              }

              // Sparkle Burst expansion modifier
              if (burstEffectRef.current.active) {
                const bScale = burstEffectRef.current.scale;
                fX *= bScale;
                fY *= bScale;
                fZ *= bScale;
              }

              // Apply math micro swirls/noise depending on the preset type to keep application "alive"
              const speedFactor = particleSpeeds.current ? particleSpeeds.current[i] : 0.05;
              let finalX = fX;
              let finalY = fY;
              let finalZ = fZ;

              if (s.preset === 'nebula') {
                const rad = Math.sqrt(fX * fX + fZ * fZ);
                const driftAngle = time * 0.45 * (5.5 / (rad + 1.0));
                finalX = fX * Math.cos(driftAngle) - fZ * Math.sin(driftAngle);
                finalY = fY + Math.sin(time + i * 0.1) * 0.05;
                finalZ = fX * Math.sin(driftAngle) + fZ * Math.cos(driftAngle);
              } else if (s.preset === 'fireworks') {
                // Expanding stream trails
                const flowRatio = 1.0 + Math.sin(time * 1.5 + i) * 0.12;
                finalX = fX * flowRatio;
                finalY = fY * flowRatio - (time % 1.5) * 0.3; // falling air gravity drag
                finalZ = fZ * flowRatio;
              } else if (s.preset === 'saturn') {
                const subRing = i < count * 0.72;
                if (subRing) {
                  // Spin ring orbits
                  const ringFreq = 0.5 + (i % 20) * 0.05;
                  const ringAngle = time * 0.55 * ringFreq;
                  finalX = fX * Math.cos(ringAngle) - fZ * Math.sin(ringAngle);
                  finalY = fY;
                  finalZ = fX * Math.sin(ringAngle) + fZ * Math.cos(ringAngle);
                } else {
                  // Wobble the sphere core slightly
                  finalX = fX + Math.sin(time + i) * 0.03;
                  finalY = fY + Math.cos(time * 0.8 + i) * 0.03;
                  finalZ = fZ + Math.sin(time * 1.2 + i) * 0.03;
                }
              } else {
                // Flower ruffling petals
                const perturbation = 1.0 + Math.sin(time * 2.0 + i) * 0.1;
                finalX = fX * perturbation;
                finalY = fY * perturbation;
                finalZ = fZ * perturbation;
              }

              // Apply low-pass exponential damping directly onto coordinates to make particles move like fluids and completely avoid flickering
              positions[i3] += (finalX - positions[i3]) * damp;
              positions[i3 + 1] += (finalY - positions[i3 + 1]) * damp;
              positions[i3 + 2] += (finalZ - positions[i3 + 2]) * damp;
            }
            positionAttr.needsUpdate = true;
          }

          // 2. Control model's rotation based on continuous rotation parameters
          // Increment base auto-rotations if user is not actively dragging the model
          if (!isDraggingRef.current) {
            autoRotY += s.autoRotateSpeed * 0.006 * (1.0 - sh.detectFactor);
            autoRotX += s.autoRotateSpeed * 0.002 * (1.0 - sh.detectFactor);
          }

          // Smoothly update hand tilt targets using smoothed hand positions
          const targetTiltY = -sh.x * Math.PI * 0.4 * s.interactionSensitivity;
          const targetTiltX = sh.y * Math.PI * 0.4 * s.interactionSensitivity;

          handTiltY += (targetTiltY - handTiltY) * 0.025; // extremely heavy damping on tilts
          handTiltX += (targetTiltX - handTiltX) * 0.025;

          // Combine autoRot and hand tilt offset seamlessly
          mainGroup.rotation.y = autoRotY + handTiltY * sh.detectFactor;
          mainGroup.rotation.x = autoRotX + handTiltX * sh.detectFactor;

          // 3. Dynamic Hue shifting rotation proportional to current rotation angle!
          const colorAttr = mainPoints.geometry.attributes.color as THREE.BufferAttribute;
          if (colorAttr && originalColorsRef.current) {
            const colors = colorAttr.array as Float32Array;
            const originalColors = originalColorsRef.current;
            const seedColorInfo = hexToHsl(s.baseColor);

            // Calculate current hue offset angle (based on scene rotation plus active shift timer)
            const sceneAngleFactor = (mainGroup.rotation.y * 180 / Math.PI) % 360;
            const shiftTimerOffset = (time * s.colorShiftSpeed * 40) % 360;
            const totalHueOffset = (sceneAngleFactor + shiftTimerOffset) % 360;

            for (let i = 0; i < count; i++) {
              // Extract original base colors stably to prevent compounding feedback degradation
              const origR = originalColors[i * 3];
              const origG = originalColors[i * 3 + 1];
              const origB = originalColors[i * 3 + 2];

              const lMax = Math.max(origR, origG, origB);
              const lMin = Math.min(origR, origG, origB);
              let h = 0;
              let sm = 0;
              const lm = (lMax + lMin) / 2;

              if (i * 3 + 2 >= originalColors.length) {
                continue;
              }

              if (lMax !== lMin) {
                const d = lMax - lMin;
                sm = lm > 0.5 ? d / (2 - lMax - lMin) : d / (lMax + lMin);
                switch (lMax) {
                  case origR: h = (origG - origB) / d + (origG < origB ? 6 : 0); break;
                  case origG: h = (origB - origR) / d + 2; break;
                  case origB: h = (origR - origG) / d + 4; break;
                }
                h /= 6;
              }
              const originalHue = h * 360;
              const originalSat = sm * 100;
              const originalLight = lm * 100;

              // Apply target hue adjustments stably
              const finalHue = (originalHue + totalHueOffset) % 360;
              const shiftedRGB = hslToRgb(finalHue, originalSat, originalLight);

              // Update point geometries colors instantly
              colors[i * 3] = shiftedRGB.r;
              colors[i * 3 + 1] = shiftedRGB.g;
              colors[i * 3 + 2] = shiftedRGB.b;
            }
            colorAttr.needsUpdate = true;
          }
        }

        // Re-execute cycle
        renderer.render(scene, camera);
        requestRef.current = requestAnimationFrame(tick);
      };

      // Start loop
      requestRef.current = requestAnimationFrame(tick);

      // Cleanup on unmount
      return () => {
        if (requestRef.current) {
          cancelAnimationFrame(requestRef.current);
        }
        resizeObserver.disconnect();
        if (container) {
          container.removeEventListener('mousedown', onMouseDown);
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
          container.removeEventListener('touchstart', onTouchStart);
          container.removeEventListener('touchmove', onTouchMove);
          container.removeEventListener('touchend', onMouseUp);
        }
        if (rendererRef.current && containerRef.current) {
          containerRef.current.removeChild(rendererRef.current.domElement);
        }
        // Dispose Three assets
        scene.clear();
      };
    }, []);

    return (
      <div 
        id="particle-stage-container"
        ref={containerRef} 
        className="absolute inset-0 w-full h-full z-0 cursor-grab active:cursor-grabbing outline-none"
      />
    );
  }
);

ParticleCanvas.displayName = 'ParticleCanvas';
