import React from 'react';
import { Link } from 'react-router-dom';
import { Info, ArrowRight } from 'lucide-react';
import { FormattedMessage } from 'react-intl';

export const AboutCard: React.FC = () => {
  return (
    <div className="card bg-gradient-to-br from-base-100 via-base-100/90 to-primary/10 backdrop-blur-sm shadow-xl hover:shadow-2xl hover:shadow-primary/20 mb-8 border border-primary/20 hover:border-primary/40 transition-all duration-500">
      <div className="card-body">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-lg hover:from-primary/30 hover:to-primary/20 transition-all duration-300">
            <Info className="w-6 h-6 text-primary hover:scale-110 transition-transform duration-300" />
          </div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            <FormattedMessage defaultMessage="Welcome to Arrow Cloud" id="RoZdO3" description="primary header on the homepage" />
          </h2>
        </div>

        <div className="space-y-6">
          <div>
            <p className="text-lg text-base-content/80 leading-relaxed">
              <FormattedMessage
                defaultMessage="Arrow Cloud is a modern platform designed for the ITG community. We provide score tracking, leaderboards, rivalries, and event hosting capabilities with a focus on stability, user experience, and competitive play."
                id="UCtdeR"
                description="primary intro text on the homepage"
              />
            </p>
          </div>

          <div className="pt-4">
            <div className="flex flex-wrap gap-4 justify-center">
              <Link
                to="/register"
                className="btn btn-lg gap-2 bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-white border-0 hover:scale-105 transition-all duration-300 shadow-lg hover:shadow-xl"
              >
                <span>
                  <FormattedMessage defaultMessage="Sign Up Now" id="IJIw7r" description="button label on the homepage" />
                </span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
              </Link>
              <Link
                to="/login"
                className="btn btn-outline btn-lg border-2 border-primary/60 hover:border-primary hover:bg-primary/10 hover:scale-105 transition-all duration-300"
              >
                <FormattedMessage defaultMessage="Log In" id="IFnUpt" description="button label on the homepage" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
