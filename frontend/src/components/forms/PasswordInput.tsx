import React, { useState } from 'react';
import { LucideIcon, Eye, EyeOff } from 'lucide-react';

interface PasswordInputProps {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  icon?: LucideIcon;
  required?: boolean;
  className?: string;
  focusColor?: 'primary' | 'secondary';
  autoComplete?: string;
  name?: string;
}

const PasswordInput: React.FC<PasswordInputProps> = ({
  label,
  placeholder = '',
  value,
  onChange,
  error,
  icon: Icon,
  required = false,
  className = '',
  focusColor = 'primary',
  autoComplete,
  name,
}) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className={`form-control ${className}`}>
      <label className="label">
        <span className="label-text font-medium">{label}</span>
      </label>
      <div className="relative">
        <input
          type={showPassword ? 'text' : 'password'}
          name={name}
          placeholder={placeholder}
          className={`input input-bordered w-full ${Icon ? 'pl-12' : 'pl-4'} pr-12 focus:outline-none focus:border-${focusColor} transition-all duration-300 ${
            error ? 'input-error' : ''
          }`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          autoComplete={autoComplete}
        />
        {Icon && <Icon className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-base-content/50 pointer-events-none z-10" />}
        <button
          type="button"
          className="absolute right-4 top-1/2 transform -translate-y-1/2 text-base-content/50 hover:text-base-content transition-colors z-10"
          onClick={() => setShowPassword(!showPassword)}
        >
          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
      </div>
      {error && (
        <div className="label">
          <span className="label-text-alt text-error">{error}</span>
        </div>
      )}
    </div>
  );
};

export default PasswordInput;
