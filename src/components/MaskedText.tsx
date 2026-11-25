import React from 'react';

interface MaskedTextProps {
  lines: string[];
  as?: 'h1' | 'h2' | 'h3';
  className?: string;
  lineClassName?: string;
  baseDelayMs?: number;
  revealKey?: string | number;
}

export const MaskedText: React.FC<MaskedTextProps> = ({
  lines,
  as: Tag = 'h2',
  className = '',
  lineClassName = '',
  baseDelayMs = 0,
  revealKey = 'static',
}) => {
  return (
    <Tag className={className}>
      {lines.map((line, index) => (
        <span
          key={`${revealKey}-${index}`}
          className="mask-line-wrap py-[0.08em] -my-[0.04em]"
        >
          <span
            className={`mask-line-inner ${lineClassName}`}
            style={{ animationDelay: `${baseDelayMs + index * 80}ms` }}
          >
            {line}
          </span>
        </span>
      ))}
    </Tag>
  );
};
