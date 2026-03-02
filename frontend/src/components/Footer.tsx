import React from 'react';
import { Link } from 'react-router-dom';
import { useIntl } from 'react-intl';
import { DiscordIcon } from './icons/DiscordIcon';

const currentYear = new Date().getFullYear();

const Footer: React.FC = () => {
  const { formatMessage } = useIntl();
  return (
    <footer
      className="border-t border-base-content/10 bg-base-200/40 backdrop-blur-sm text-sm text-base-content/70"
      aria-label={formatMessage({ defaultMessage: 'Footer', id: 'Cqcs8A', description: 'Footer section label' })}
    >
      <div className="container mx-auto px-4 py-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          {/* eslint-disable-next-line formatjs/no-literal-string-in-jsx */}
          <div className="font-medium text-base-content">&copy; {currentYear} Arrow Cloud.</div>
          <div className="text-xs text-base-content/60 max-w-100">
            {formatMessage({
              defaultMessage:
                'We do not host audio files or pack downloads. Pack and chart graphics are scraped from public releases and are not subject to Arrow Cloud copyright.',
              id: 'dIunyv',
              description: 'Disclaimer about hosted content',
            })}
          </div>
        </div>
        <nav aria-label={formatMessage({ defaultMessage: 'Footer navigation', id: 'i+E6a3', description: 'Navigation section in footer' })}>
          <ul className="flex flex-wrap gap-5 items-center">
            <li>
              <Link to="/privacy" className="hover:text-primary transition-colors" data-testid="footer-privacy-link">
                {formatMessage({ defaultMessage: 'Privacy Policy', id: 'ITq0p4', description: 'Link to privacy policy page' })}
              </Link>
            </li>
            <li>
              <Link to="/help" className="hover:text-primary transition-colors" data-testid="footer-help-link">
                {formatMessage({ defaultMessage: 'Help', id: '2uZtKR', description: 'Link to help page' })}
              </Link>
            </li>
            <li className="h-5 w-px bg-base-content/20" aria-hidden="true" />
            <li>
              <a
                href="https://discord.gg/6WfRgMCFX4"
                target="_blank"
                rel="noopener noreferrer"
                className="text-base-content/60 hover:text-primary transition-colors inline-flex items-center"
                aria-label={formatMessage({
                  defaultMessage: 'Join our Discord (opens in new tab)',
                  id: 'CbHUxa',
                  description: 'Label for Discord link that opens in new tab',
                })}
                data-testid="footer-discord-link"
              >
                <DiscordIcon className="w-6 h-6" />
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
};

export default Footer;
