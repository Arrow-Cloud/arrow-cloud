import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { FormattedMessage } from 'react-intl';

export const BlueShiftAnnouncementCard: React.FC = () => {
  return (
    <div className="card bg-gradient-to-br from-blue-90040 via-indigo-900/30 to-purple-900/20 backdrop-blur-sm shadow-xl hover:shadow-2xl hover:shadow-blue-500/30 mb-8 border border-blue-500/40 hover:border-blue-400/60 transition-all duration-500 overflow-hidden relative">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4xKSIvPjwvc3ZnPg==')] opacity-50"></div>
      <div className="card-body relative z-10">
        <div className="text-center space-y-4">
          <img src="https://assets.arrowcloud.dance/logos/20250725/blue shift-t big.png" className="w-full max-w-[400px] mx-auto mb-2" />
          <p className="text-lg text-base-content/80 max-w-2xl mx-auto">
            <FormattedMessage
              defaultMessage="Thank you to everyone who participated in Blue Shift! Check out the final standings to see how you ranked. We've assigned trophies to participants, check your profile out to see yours!"
              id="MnF0X2"
              description="thank you message for blue shift participants"
            />
          </p>
          <div className="flex flex-wrap gap-4 justify-center pt-4">
            <Link
              to="/blueshift-results"
              className="btn btn-lg gap-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-400 hover:to-cyan-400 text-white border-0 hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-blue-500/50"
            >
              <span>
                <FormattedMessage defaultMessage="View Results" id="XnqSir" description="button to view blue shift results" />
              </span>
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
