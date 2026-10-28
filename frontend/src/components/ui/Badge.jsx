import React from 'react';

const VARIANTS = {
  primary: 'bg-[#254A40]/10 text-[#254A40] border-[#254A40]/20',
  secondary: 'bg-[#A85D3B]/10 text-[#A85D3B] border-[#A85D3B]/20',
  accent: 'bg-[#C59A52]/15 text-[#8F6A2A] border-[#C59A52]/30',
  success: 'bg-[#367454]/10 text-[#367454] border-[#367454]/25',
  warning: 'bg-[#A66A25]/10 text-[#A66A25] border-[#A66A25]/25',
  danger: 'bg-[#B4483E]/10 text-[#B4483E] border-[#B4483E]/25',
  muted: 'bg-[#ECEAE2] text-[#68716A] border-[#DCDDD4]',
};

export default function Badge({ children, variant = 'muted', size = 'sm', className = '' }) {
  const sizeClasses = size === 'xs' ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1';
  const variantClass = VARIANTS[variant] || VARIANTS.muted;

  return (
    <span
      className={`inline-flex items-center font-medium border rounded-md uppercase tracking-wider font-sans ${sizeClasses} ${variantClass} ${className}`}
    >
      {children}
    </span>
  );
}
