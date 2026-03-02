import React from 'react';
import { LucideIcon } from 'lucide-react';

interface TextInputProps {
  label: string;
  type?: 'text' | 'email';
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  icon?: LucideIcon;
  required?: boolean;
  className?: string;
  readOnly?: boolean;
}

const TextInput: React.FC<TextInputProps> = ({
  label,
  type = 'text',
  placeholder = '',
  value,
  onChange,
  error,
  icon: Icon,
  required = false,
  className = '',
  readOnly = false,
}) => {
  return (
    <div className={`form-control ${className}`}>
      <label className="label">
        <span className="label-text font-medium">{label}</span>
      </label>
      <div className="relative">
        <input
          type={type}
          placeholder={placeholder}
          className={`input input-bordered w-full ${Icon ? 'pl-12' : 'pl-4'} focus:outline-none focus:border-primary transition-all duration-300 ${
            error ? 'input-error' : ''
          } ${readOnly ? 'bg-base-200' : ''}`}
          value={value}
          onChange={readOnly ? undefined : (e) => onChange(e.target.value)}
          required={required}
          readOnly={readOnly}
        />
        {Icon && <Icon className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-base-content/50 pointer-events-none z-10" />}
      </div>
      {error && (
        <div className="label">
          <span className="label-text-alt text-error">{error}</span>
        </div>
      )}
    </div>
  );
};

export default TextInput;
