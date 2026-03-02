import React from 'react';
import { AlertCircle, CheckCircle, AlertTriangle, Info, X, LucideIcon } from 'lucide-react';
import { useIntl } from 'react-intl';

export interface AlertProps {
  variant?: 'error' | 'success' | 'warning' | 'info';
  children: React.ReactNode;
  onDismiss?: () => void;
  dismissible?: boolean;
  className?: string;
  icon?: LucideIcon;
}

const variantConfig = {
  error: {
    className: 'alert-error',
    icon: AlertCircle,
  },
  success: {
    className: 'alert-success',
    icon: CheckCircle,
  },
  warning: {
    className: 'alert-warning',
    icon: AlertTriangle,
  },
  info: {
    className: 'alert-info',
    icon: Info,
  },
};

export const Alert: React.FC<AlertProps> = ({ variant = 'info', children, onDismiss, dismissible = false, className = '', icon }) => {
  const { formatMessage } = useIntl();
  const config = variantConfig[variant];
  const Icon = icon || config.icon;

  return (
    <div className={`alert ${config.className} ${className}`}>
      <Icon className="w-5 h-5 flex-shrink-0" />
      <div className="flex-grow">{children}</div>
      {dismissible && onDismiss && (
        <button
          onClick={onDismiss}
          className="btn btn-ghost btn-sm btn-square ml-2"
          aria-label={formatMessage({ defaultMessage: 'Dismiss alert', id: 'hfv1JL', description: 'Label for dismiss alert button' })}
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export default Alert;
