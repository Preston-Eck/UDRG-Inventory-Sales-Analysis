
import React from 'react';

export const Card = ({ children, className = '' }: { children?: React.ReactNode, className?: string }) => (
    <div className={`bg-[var(--card-bg)] border border-[var(--border-color)] rounded-lg p-4 shadow-sm ${className}`}>
        {children}
    </div>
);

export const Button = ({ onClick, children, variant = 'primary', className = '', disabled = false }: any) => {
    const baseStyle = "px-4 py-2 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--sidebar-bg)] disabled:opacity-50 disabled:cursor-not-allowed";

    const style = variant === 'primary'
        ? { backgroundColor: 'var(--primary-color)', color: '#fff' }
        : variant === 'success' ? { backgroundColor: '#10b981', color: '#fff' }
            : {};

    const variantClass = variant === 'secondary' ? "bg-[var(--card-bg)] hover:bg-[var(--border-color)] text-[var(--text-color)] border border-[var(--border-color)]" : "";

    return (
        <button onClick={onClick} disabled={disabled} style={style} className={`${baseStyle} ${variantClass} ${className}`}>
            {children}
        </button>
    );
};

export const HeaderWithInfo = ({ label, infoQuery, onExplain, className = '', align = 'left', sortable = false, onSort, currentSort, currentDir }: any) => (
    <th className={`px-4 py-3 ${className}`}>
        <div className={`flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : 'justify-start'} group`}>
            <span
                className={sortable ? "cursor-pointer hover:text-white select-none" : ""}
                onClick={sortable && onSort ? onSort : undefined}
            >
                {label}
                {sortable && currentSort && (
                    <span className="ml-1 text-[10px] text-[var(--primary-color)]">
                        {currentSort ? (currentDir === 'asc' ? '▲' : '▼') : ''}
                    </span>
                )}
            </span>
            <i className="fa-regular fa-circle-question text-slate-600 group-hover:text-[var(--primary-color)] text-[10px] transition-colors cursor-pointer" onClick={() => onExplain(infoQuery)} title="Click for AI Explanation"></i>
        </div>
    </th>
);
