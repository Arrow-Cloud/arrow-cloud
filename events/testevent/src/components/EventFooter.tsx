import { useIntl } from 'react-intl';

const EventFooter = () => {
  const { formatMessage } = useIntl();
  return (
    <footer className="border-t border-base-content/10 bg-base-200/40 backdrop-blur-sm text-sm text-base-content/70">
      <div className="container mx-auto px-4 py-6 flex items-center justify-center gap-2">
        <span className="text-base-content/50">
          {formatMessage({ defaultMessage: 'Hosted on', id: '/tmeqw', description: 'Footer text before Arrow Cloud logo' })}
        </span>
        <a href="https://arrowcloud.dance" target="_blank" rel="noopener noreferrer" className="inline-flex items-center hover:opacity-80 transition-opacity">
          <img
            src="https://assets.arrowcloud.dance/logos/20250725/text-t.png"
            alt={formatMessage({ defaultMessage: 'Arrow Cloud', id: 'Gnfuoq', description: 'Alt text for Arrow Cloud logo in footer' })}
            className="h-8 w-auto"
          />
        </a>
      </div>
    </footer>
  );
};

export default EventFooter;
