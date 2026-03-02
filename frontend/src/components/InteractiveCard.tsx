import React, { useState } from 'react';

interface InteractiveCardProps {
  children: React.ReactNode;
  className?: string;
}

export const InteractiveCard: React.FC<InteractiveCardProps> = ({ children, className = '' }) => {
  const [mousePosition, setMousePosition] = useState({ x: 0.5, y: 0.5 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setMousePosition({ x, y });
  };

  const handleMouseLeave = () => {
    setMousePosition({ x: 0.5, y: 0.5 });
  };

  const transformStyle = {
    transform: `perspective(1000px) rotateX(${(mousePosition.y - 0.5) * 3}deg) rotateY(${(mousePosition.x - 0.5) * 3}deg) translateZ(5px)`,
    transition: 'transform 0.2s ease-out',
  };

  const gradientStyle = {
    background: `conic-gradient(from ${mousePosition.x * 360}deg at ${mousePosition.x * 100}% ${mousePosition.y * 100}%, 
      rgba(30, 64, 175, 0.3), rgba(59, 130, 246, 0.4), rgba(96, 165, 250, 0.5), rgba(147, 197, 253, 0.4), rgba(219, 234, 254, 0.2), rgba(147, 197, 253, 0.4), rgba(96, 165, 250, 0.5), rgba(59, 130, 246, 0.4), rgba(30, 64, 175, 0.3))`,
  };

  return (
    <div className={`relative p-[2px] rounded-xl group ${className}`} style={gradientStyle} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
      <div className="bg-base-100 backdrop-blur-sm shadow-2xl rounded-xl relative overflow-hidden min-h-full" style={transformStyle}>
        {/* Animated background gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/3 via-blue-400/4 to-blue-600/3 opacity-60"></div>

        {/* Content with proper z-index */}
        <div className="relative z-10">{children}</div>
      </div>
    </div>
  );
};
