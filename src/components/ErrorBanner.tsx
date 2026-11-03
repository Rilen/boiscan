import { AlertIcon } from './icons';

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div className="alert alert--error" role="alert">
      <AlertIcon className="alert__icon" />
      <p className="alert__text">{message}</p>
      {onDismiss && (
        <button type="button" className="alert__dismiss" onClick={onDismiss}>
          Fechar
        </button>
      )}
    </div>
  );
}
