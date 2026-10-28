import React from 'react';

export default function Card({
  title,
  subtitle,
  action,
  children,
  footer,
  className = '',
  bodyClassName = '',
  headerClassName = '',
}) {
  return (
    <div className={`bg-white border border-[#DCDDD4] rounded-lg shadow-[0_1px_3px_rgba(37,44,41,0.04)] overflow-hidden ${className}`}>
      {(title || subtitle || action) && (
        <div className={`px-5 py-4 border-b border-[#DCDDD4] flex items-center justify-between gap-4 ${headerClassName}`}>
          <div>
            {title && (
              <h3 className="text-base font-semibold text-[#252C29] tracking-tight">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-xs text-[#68716A] mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={`p-5 ${bodyClassName}`}>
        {children}
      </div>
      {footer && (
        <div className="px-5 py-3 border-t border-[#DCDDD4] bg-[#ECEAE2]/40 text-xs text-[#68716A]">
          {footer}
        </div>
      )}
    </div>
  );
}
