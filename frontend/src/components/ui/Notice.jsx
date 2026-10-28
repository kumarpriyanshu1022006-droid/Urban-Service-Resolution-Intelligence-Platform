import React from 'react';
import { Info, AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react';

const VARIANTS = {
  info: {
    container: 'bg-[#ECEAE2] border-[#DCDDD4] text-[#252C29]',
    icon: Info,
    iconColor: 'text-[#315E75]',
  },
  warning: {
    container: 'bg-[#A66A25]/10 border-[#A66A25]/30 text-[#252C29]',
    icon: AlertTriangle,
    iconColor: 'text-[#A66A25]',
  },
  danger: {
    container: 'bg-[#B4483E]/10 border-[#B4483E]/30 text-[#252C29]',
    icon: AlertCircle,
    iconColor: 'text-[#B4483E]',
  },
  success: {
    container: 'bg-[#367454]/10 border-[#367454]/30 text-[#252C29]',
    icon: CheckCircle2,
    iconColor: 'text-[#367454]',
  },
};

export default function Notice({
  variant = 'info',
  title,
  children,
  className = '',
}) {
  const config = VARIANTS[variant] || VARIANTS.info;
  const Icon = config.icon;

  return (
    <div
      role="status"
      className={`border rounded-lg p-3.5 flex items-start gap-3 text-xs leading-relaxed ${config.container} ${className}`}
    >
      <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${config.iconColor}`} />
      <div>
        {title && <p className="font-semibold mb-0.5 text-[#252C29]">{title}</p>}
        <div className="text-[#252C29]/90">{children}</div>
      </div>
    </div>
  );
}
