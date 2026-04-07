import React, { useState } from 'react';
import { useIntl } from 'react-intl';
import { Palette, User, LogOut, Edit, Menu, X, ChevronDown, Wrench, Languages } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import ThemeController from './ThemeController';
import { useAuth } from '../contexts/AuthContext';
import { LocaleController } from './LocaleController';
import NotificationBell from './NotificationBell';

interface BrowseMenuItemProps {
  children: React.ReactNode;
  to: string;
  onNavigate?: () => void; // optional extra callback
}

const BrowseMenuItem: React.FC<BrowseMenuItemProps> = ({ children, to, onNavigate }) => {
  const handleClick: React.MouseEventHandler<HTMLAnchorElement> = (e) => {
    // Only close dropdown on an unmodified primary click (so ctrl/cmd/middle open-in-new-tab work natively)
    if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      onNavigate?.();
    }
  };
  return (
    <li>
      <Link to={to} onClick={handleClick} className="hover:bg-primary hover:text-primary-content transition-colors">
        {children}
      </Link>
    </li>
  );
};

interface DropDownIconMenuItemProps {
  icon: React.ReactNode;
  children: React.ReactNode;
  dropdownWidth?: string;
  dropdownType?: 'menu' | 'content';
}

const DropDownIconMenuItem: React.FC<DropDownIconMenuItemProps> = ({ icon, children, dropdownWidth = 'w-32', dropdownType = 'menu' }) => {
  const containerClass =
    dropdownType === 'menu'
      ? `dropdown-content bg-base-100 rounded-box z-[1] ${dropdownWidth} p-2 shadow-2xl border border-base-300 mt-3 menu`
      : `dropdown-content bg-base-100 rounded-box z-[1] ${dropdownWidth} shadow-2xl border border-base-300 mt-3`;

  return (
    <div className="dropdown dropdown-end p-0">
      <div tabIndex={0} role="button" className="btn btn-ghost btn-circle">
        {icon}
      </div>
      {dropdownType === 'menu' ? (
        <ul tabIndex={0} className={containerClass}>
          {children}
        </ul>
      ) : (
        <div tabIndex={0} className={containerClass}>
          {children}
        </div>
      )}
    </div>
  );
};

const NavBar: React.FC = () => {
  const navigate = useNavigate();
  const { formatMessage } = useIntl();
  const { user, logout, hasPermission, hasAny } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isBrowseOpen, setIsBrowseOpen] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  // Admin permissions
  const canUploadPacks = hasPermission('packs.upload');
  const canBanUsers = hasPermission('users.ban');
  const hasAnyAdmin = hasAny([canUploadPacks ? 'packs.upload' : '', canBanUsers ? 'users.ban' : ''].filter(Boolean));

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const closeDropdown = () => {
    // Close dropdown by blurring the active element
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
    setIsBrowseOpen(false);
    setIsThemeOpen(false);
    setIsAdminOpen(false);
    setIsLanguageOpen(false);
  };

  const handleBrowseToggle = () => {
    setIsBrowseOpen(!isBrowseOpen);
  };

  const handleThemeToggle = () => {
    setIsThemeOpen(!isThemeOpen);
  };

  const handleLanguageToggle = () => {
    setIsLanguageOpen(!isLanguageOpen);
  };

  const handleAdminToggle = () => {
    setIsAdminOpen(!isAdminOpen);
  };

  return (
    <>
      <div className="navbar bg-base-100/80 backdrop-blur-sm shadow-lg">
        <div className="flex-1">
          <Link to="/" className="inline-flex pl-3">
            <img
              src="https://assets.arrowcloud.dance/logos/20250725/text-t.png"
              alt={formatMessage({ defaultMessage: 'Arrow Cloud Logo', id: 'viVXqx', description: 'Alt text for the Arrow Cloud logo in the navigation bar' })}
              className="h-14 w-auto mr-2"
            />
          </Link>
        </div>

        {/* Desktop Navigation */}
        <div className="flex-none hidden lg:flex">
          {/* Browse Dropdown */}
          <div className="dropdown dropdown-end">
            <div tabIndex={0} role="button" className="btn btn-ghost">
              {formatMessage({ defaultMessage: 'Browse', id: 'dlu2Wl', description: 'Navigation menu button to browse content' })}
              <ChevronDown className="w-4 h-4 ml-1" />
            </div>
            <ul tabIndex={0} className="dropdown-content bg-base-100 rounded-box z-[1] w-32 p-2 shadow-2xl border border-base-300 mt-3 menu">
              <BrowseMenuItem to="/packs">
                {formatMessage({ defaultMessage: 'Packs', id: 'EaTIYv', description: 'Navigation menu item for packs' })}
              </BrowseMenuItem>
              <BrowseMenuItem to="/charts">
                {formatMessage({ defaultMessage: 'Charts', id: '94Mbq6', description: 'Navigation menu item for charts' })}
              </BrowseMenuItem>
              <BrowseMenuItem to="/users">
                {formatMessage({ defaultMessage: 'Users', id: '5sAIEv', description: 'Navigation menu item for users' })}
              </BrowseMenuItem>
              <BrowseMenuItem to="/help">
                {formatMessage({ defaultMessage: 'Help', id: 'BkGM9i', description: 'Navigation menu item for help' })}
              </BrowseMenuItem>
            </ul>
          </div>

          <DropDownIconMenuItem icon={<Palette className="w-5 h-5" />} dropdownWidth="w-64" dropdownType="content">
            <ThemeController />
          </DropDownIconMenuItem>

          <DropDownIconMenuItem icon={<Languages className="w-5 h-5" />} dropdownWidth="w-64" dropdownType="content">
            <LocaleController />
          </DropDownIconMenuItem>

          {/* Admin Dropdown (desktop) */}
          {hasAnyAdmin && (
            <DropDownIconMenuItem icon={<Wrench className="w-5 h-5" />} dropdownWidth="w-48" dropdownType="menu">
              {canUploadPacks && (
                <BrowseMenuItem to="/pack-uploader">
                  {formatMessage({ defaultMessage: 'Pack Uploader', id: '9KyB94', description: 'Admin menu item for uploading packs' })}
                </BrowseMenuItem>
              )}
            </DropDownIconMenuItem>
          )}

          {/* Notification Bell (desktop) */}
          {user && <NotificationBell />}

          <ul className="menu menu-horizontal px-1 py-0">
            <DropDownIconMenuItem icon={<User className="w-5 h-5" />} dropdownWidth="w-40" dropdownType="menu">
              {user ? (
                <>
                  <li>
                    <Link
                      to={`/user/${user.id}`}
                      className="hover:bg-secondary hover:text-secondary-content transition-colors"
                      onClick={(e) => {
                        if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) closeDropdown();
                      }}
                    >
                      {user.alias}
                    </Link>
                  </li>
                  <div className="divider my-1"></div>
                  <li>
                    <Link
                      to="/profile"
                      className="hover:bg-primary hover:text-primary-content transition-colors flex items-center gap-2"
                      onClick={(e) => {
                        if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) closeDropdown();
                      }}
                    >
                      <Edit className="w-4 h-4" />
                      {formatMessage({ defaultMessage: 'Edit Profile', id: '7JspJu', description: 'User menu item for editing profile' })}
                    </Link>
                  </li>
                  <li>
                    <a
                      className="hover:bg-error hover:text-error-content transition-colors"
                      onClick={() => {
                        closeDropdown();
                        handleLogout();
                      }}
                    >
                      <LogOut className="w-4 h-4" />
                      {formatMessage({ defaultMessage: 'Logout', id: 'if82ki', description: 'User menu item for logging out' })}
                    </a>
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <Link
                      to="/login"
                      className="hover:bg-primary hover:text-primary-content transition-colors"
                      onClick={(e) => {
                        if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) closeDropdown();
                      }}
                    >
                      {formatMessage({ defaultMessage: 'Login', id: 'SZ1Xar', description: 'User menu item for logging in' })}
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/register"
                      className="hover:bg-primary hover:text-primary-content transition-colors"
                      onClick={(e) => {
                        if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) closeDropdown();
                      }}
                    >
                      {formatMessage({ defaultMessage: 'Register', id: '8OA9Ae', description: 'User menu item for registering a new account' })}
                    </Link>
                  </li>
                </>
              )}
            </DropDownIconMenuItem>
          </ul>
        </div>

        {/* Mobile Navigation */}
        <div className="flex-none lg:hidden flex items-center">
          {/* Notification Bell (mobile - always visible outside drawer) */}
          {user && <NotificationBell />}
          <button className="btn btn-ghost btn-circle" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Overlay - Outside navbar container */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden backdrop-blur-md bg-black/30">
          <div className="absolute inset-0" onClick={closeMobileMenu}></div>

          {/* Mobile Drawer */}
          <div className="absolute top-0 right-0 h-full w-80 max-w-[80vw] bg-base-100 shadow-2xl transform transition-transform duration-300 overflow-y-auto">
            <div className="p-4 h-full">
              {/* Mobile Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold">{formatMessage({ defaultMessage: 'Menu', id: 'r3HlFt', description: 'Mobile menu header' })}</h2>
                <button className="btn btn-ghost btn-circle btn-sm" onClick={closeMobileMenu}>
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Mobile Menu Items */}
              <div className="space-y-2">
                {/* Browse Collapsible */}
                <div>
                  <button
                    className="w-full flex items-center justify-between p-3 text-left hover:bg-base-200 rounded-lg transition-colors"
                    onClick={handleBrowseToggle}
                  >
                    <span className="font-medium">
                      {formatMessage({ defaultMessage: 'Browse', id: 'yM3blP', description: 'Mobile menu section for browsing content' })}
                    </span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${isBrowseOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isBrowseOpen && (
                    <div className="ml-4 mt-2 space-y-1">
                      <button
                        className="w-full text-left p-2 text-sm hover:bg-base-200 rounded transition-colors"
                        onClick={() => {
                          navigate('/packs');
                          closeMobileMenu();
                        }}
                      >
                        {formatMessage({ defaultMessage: 'Packs', id: 'C22vWu', description: 'Mobile menu item for packs' })}
                      </button>
                      <button
                        className="w-full text-left p-2 text-sm hover:bg-base-200 rounded transition-colors"
                        onClick={() => {
                          navigate('/charts');
                          closeMobileMenu();
                        }}
                      >
                        {formatMessage({ defaultMessage: 'Charts', id: 'Wc2PQF', description: 'Mobile menu item for charts' })}
                      </button>
                      <button
                        className="w-full text-left p-2 text-sm hover:bg-base-200 rounded transition-colors"
                        onClick={() => {
                          navigate('/users');
                          closeMobileMenu();
                        }}
                      >
                        {formatMessage({ defaultMessage: 'Users', id: 'hZH12I', description: 'Mobile menu item for users' })}
                      </button>
                      <button
                        className="w-full text-left p-2 text-sm hover:bg-base-200 rounded transition-colors"
                        onClick={() => {
                          navigate('/help');
                          closeMobileMenu();
                        }}
                      >
                        {formatMessage({ defaultMessage: 'Help', id: 'xJhO/K', description: 'Mobile menu item for help' })}
                      </button>
                    </div>
                  )}
                </div>

                {/* Theme Controller */}
                <div>
                  <button
                    className="w-full flex items-center justify-between p-3 text-left hover:bg-base-200 rounded-lg transition-colors"
                    onClick={handleThemeToggle}
                  >
                    <div className="flex items-center gap-2">
                      <Palette className="w-5 h-5" />
                      <span className="font-medium">
                        {formatMessage({ defaultMessage: 'Theme', id: 'HlcJcp', description: 'Mobile menu section for theme selection' })}
                      </span>
                    </div>
                    <ChevronDown className={`w-4 h-4 transition-transform ${isThemeOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isThemeOpen && (
                    <div className="ml-4 mt-2">
                      <ThemeController />
                    </div>
                  )}
                </div>

                <div>
                  <button
                    className="w-full flex items-center justify-between p-3 text-left hover:bg-base-200 rounded-lg transition-colors"
                    onClick={handleLanguageToggle}
                  >
                    <div className="flex items-center gap-2">
                      <Languages className="w-5 h-5" />
                      <span className="font-medium">
                        {formatMessage({ defaultMessage: 'Language', id: 'XRHhsa', description: 'Mobile menu section for language selection' })}
                      </span>
                    </div>
                    <ChevronDown className={`w-4 h-4 transition-transform ${isThemeOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isLanguageOpen && (
                    <div className="ml-4 mt-2">
                      <LocaleController />
                    </div>
                  )}
                </div>

                {/* Admin (mobile) */}
                {hasAnyAdmin && (
                  <div>
                    <button
                      className="w-full flex items-center justify-between p-3 text-left hover:bg-base-200 rounded-lg transition-colors"
                      onClick={handleAdminToggle}
                    >
                      <div className="flex items-center gap-2">
                        <Wrench className="w-5 h-5" />
                        <span className="font-medium">
                          {formatMessage({ defaultMessage: 'Admin', id: 'NgOmb9', description: 'Mobile menu section for admin tools' })}
                        </span>
                      </div>
                      <ChevronDown className={`w-4 h-4 transition-transform ${isAdminOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isAdminOpen && (
                      <div className="ml-4 mt-2 space-y-1">
                        {canUploadPacks && (
                          <button
                            className="w-full text-left p-2 text-sm hover:bg-base-200 rounded transition-colors"
                            onClick={() => {
                              navigate('/pack-uploader');
                              closeMobileMenu();
                            }}
                          >
                            {formatMessage({ defaultMessage: 'Pack Uploader', id: 'frfVZq', description: 'Mobile admin menu item for pack uploader' })}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* User Menu */}
                <div className="border-t border-base-300 pt-4">
                  {user ? (
                    <div className="space-y-2">
                      <button
                        className="w-full text-left p-3 hover:bg-base-200 rounded-lg transition-colors font-medium"
                        onClick={() => {
                          navigate(`/user/${user.id}`);
                          closeMobileMenu();
                        }}
                      >
                        {user.alias}
                      </button>
                      <button
                        className="w-full text-left p-3 hover:bg-base-200 rounded-lg transition-colors flex items-center gap-2"
                        onClick={() => {
                          navigate('/profile');
                          closeMobileMenu();
                        }}
                      >
                        <Edit className="w-4 h-4" />
                        {formatMessage({ defaultMessage: 'Edit Profile', id: 'LhgF30', description: 'Mobile user menu item for editing profile' })}
                      </button>
                      <button
                        className="w-full text-left p-3 hover:bg-error hover:text-error-content rounded-lg transition-colors flex items-center gap-2"
                        onClick={() => {
                          handleLogout();
                          closeMobileMenu();
                        }}
                      >
                        <LogOut className="w-4 h-4" />
                        {formatMessage({ defaultMessage: 'Logout', id: 'U0/54Q', description: 'Mobile user menu item for logging out' })}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <button
                        className="w-full text-left p-3 hover:bg-primary hover:text-primary-content rounded-lg transition-colors"
                        onClick={() => {
                          navigate('/login');
                          closeMobileMenu();
                        }}
                      >
                        {formatMessage({ defaultMessage: 'Login', id: 'XNTeAR', description: 'Mobile user menu item for logging in' })}
                      </button>
                      <button
                        className="w-full text-left p-3 hover:bg-primary hover:text-primary-content rounded-lg transition-colors"
                        onClick={() => {
                          navigate('/register');
                          closeMobileMenu();
                        }}
                      >
                        {formatMessage({ defaultMessage: 'Register', id: '9pRwtR', description: 'Mobile user menu item for registering a new account' })}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default NavBar;
