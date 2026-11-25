import React from 'react';

interface MaskedTextProps {
  lines: string[];
  as?: 'h1' | 'h2' | 'h3';
  className?: string;
  baseDelayMs?: number;
  revealKey?: string | number;
}

export const MaskedText: React.FC<MaskedTextProps> = ({
  lines,
  as: Tag = 'h2',
  className = '',
  baseDelayMs = 0,
  revealKey = 'static',
}) => {
  return (
    <Tag className={className}>
      {lines.map((line, index) => (
        <span
          key={`${revealKey}-${index}`}
          className="mask-line-wrap pb-[0.06em] -mb-[0.06em]"
        >
          <span
            className="mask-line-inner"
            style={{ animationDelay: `${baseDelayMs + index * 80}ms` }}
          >
            {line}
          </span>
        </span>
      ))}
    </Tag>
  );
};
