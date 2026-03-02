import React, { createContext, useContext, useState, ReactNode } from 'react';

export type Route = 'home' | 'login' | 'register';

interface RouterContextType {
  currentRoute: Route;
  navigate: (route: Route) => void;
}

const RouterContext = createContext<RouterContextType | undefined>(undefined);

export const useRouter = () => {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error('useRouter must be used within a RouterProvider');
  }
  return context;
};

interface RouterProviderProps {
  children: ReactNode;
}

export const RouterProvider: React.FC<RouterProviderProps> = ({ children }) => {
  const [currentRoute, setCurrentRoute] = useState<Route>('home');

  const navigate = (route: Route) => {
    setCurrentRoute(route);
  };

  return <RouterContext.Provider value={{ currentRoute, navigate }}>{children}</RouterContext.Provider>;
};
