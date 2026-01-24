'use client';

import React, { useEffect, useRef } from 'react';

interface StaticParticleOrbProps {
    size?: number; // Size in pixels (width/height)
    particleCount?: number;
    className?: string;
}

/**
 * An animated particle orb/globe component for use as an avatar icon.
 * Renders a rotating sphere of particles on a canvas.
 */
export default function StaticParticleOrb({
    size = 32,
    particleCount = 150,
    className = '',
}: StaticParticleOrbProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const canvasSize = size;
        canvas.width = canvasSize * dpr;
        canvas.height = canvasSize * dpr;
        ctx.scale(dpr, dpr);
        canvas.style.width = `${canvasSize}px`;
        canvas.style.height = `${canvasSize}px`;

        const sphereRadius = size * 0.38;
        const centerX = size / 2;
        const centerY = size / 2;

        interface Particle {
            theta: number;
            phi: number;
            size: number;
        }

        const particles: Particle[] = [];
        for (let i = 0; i < particleCount; i++) {
            particles.push({
                theta: Math.random() * Math.PI * 2,
                phi: Math.acos((Math.random() * 2) - 1),
                size: Math.random() * 0.8 + 0.4,
            });
        }

        let rotationY = 0;
        const rotationX = 0.2;

        const animate = () => {
            ctx.clearRect(0, 0, canvasSize, canvasSize);

            rotationY += 0.005;

            const projected = particles.map(p => {
                const r = sphereRadius;
                let x = r * Math.sin(p.phi) * Math.cos(p.theta);
                let y = r * Math.sin(p.phi) * Math.sin(p.theta);
                let z = r * Math.cos(p.phi);

                let x1 = x * Math.cos(rotationY) - z * Math.sin(rotationY);
                let z1 = x * Math.sin(rotationY) + z * Math.cos(rotationY);
                let y1 = y;

                let y2 = y1 * Math.cos(rotationX) - z1 * Math.sin(rotationX);
                let z2 = y1 * Math.sin(rotationX) + z1 * Math.cos(rotationX);
                let x2 = x1;

                return {
                    x: x2 + centerX,
                    y: y2 + centerY,
                    z: z2,
                    size: p.size,
                };
            });

            projected.sort((a, b) => a.z - b.z);

            // Subtle background glow
            const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, sphereRadius * 1.1);
            gradient.addColorStop(0, 'rgba(255, 255, 255, 0.03)');
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvasSize, canvasSize);

            projected.forEach(p => {
                const depthFactor = (p.z + sphereRadius) / (sphereRadius * 2);
                
                let alpha = 0.2 + depthFactor * 0.8;
                alpha = Math.max(0.15, Math.min(1, alpha));

                const particleSize = Math.max(0.3, p.size * (0.5 + depthFactor * 0.5));

                ctx.beginPath();
                ctx.arc(p.x, p.y, particleSize, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                ctx.fill();
            });

            animationRef.current = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [size, particleCount]);

    return (
        <canvas
            ref={canvasRef}
            className={`shrink-0 ${className}`}
            style={{ width: size, height: size }}
        />
    );
}

