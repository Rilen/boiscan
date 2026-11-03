import { useRef, type ChangeEvent, type ReactNode } from 'react';

interface PhotoInputProps {
  label: string;
  onSelect: (file: File) => void;
  capture?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: ReactNode;
  className?: string;
}

export function PhotoInput({
  label,
  onSelect,
  capture = false,
  variant = 'secondary',
  icon,
  className,
}: PhotoInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onSelect(file);
    event.target.value = '';
  };

  return (
    <label className={`button button--${variant} ${className ?? ''}`.trim()}>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        aria-label={label}
        accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
        {...(capture ? { capture: 'environment' as const } : {})}
        onChange={handleChange}
      />
      {icon}
      <span>{label}</span>
    </label>
  );
}
