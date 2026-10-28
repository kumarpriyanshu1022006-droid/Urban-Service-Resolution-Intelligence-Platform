import React from 'react';
import { Loader2 } from 'lucide-react';

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  type = 'button',
  loading = false,
  disabled = false,
  onClick,
  icon: Icon,
  className = '',
  ...props
}) {
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-md transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer select-none';

  const sizeClasses = {
    sm: 'text-xs px-3 py-1.5 gap-1.5',
    md: 'text-sm px-4 py-2 gap-2',
    lg: 'text-base px-5 py-2.5 gap-2.5',
  }[size] || 'text-sm px-4 py-2 gap-2';

  const variantClasses = {
    primary: 'bg-[#254A40] text-white hover:bg-[#19352E] focus-visible:outline-[#254A40] shadow-xs active:bg-[#152c26]',
    secondary: 'bg-[#A85D3B] text-white hover:bg-[#924f31] focus-visible:outline-[#A85D3B] shadow-xs',
    accent: 'bg-[#C59A52] text-white hover:bg-[#b08845] focus-visible:outline-[#C59A52]',
    outline: 'border border-[#DCDDD4] bg-white text-[#252C29] hover:bg-[#ECEAE2] hover:border-[#C4C5B9] focus-visible:outline-[#254A40]',
    ghost: 'text-[#252C29] hover:bg-[#ECEAE2] focus-visible:outline-[#254A40]',
    danger: 'bg-[#B4483E] text-white hover:bg-[#9a3d34] focus-visible:outline-[#B4483E]',
  }[variant] || 'bg-[#254A40] text-white hover:bg-[#19352E]';

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin text-current" />
      ) : Icon ? (
        <Icon className="w-4 h-4 shrink-0" />
      ) : null}
      <span>{children}</span>
    </button>
  );
}
