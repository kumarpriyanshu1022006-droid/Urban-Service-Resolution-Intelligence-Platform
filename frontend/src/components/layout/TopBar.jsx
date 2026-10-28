import React, { useState, useEffect } from 'react';
import { Menu, RefreshCw, Bell, Shield, User, Briefcase, Check } from 'lucide-react';
import { useAuth, DEMO_USERS } from '../../context/AuthContext';
import { fetchUserNotifications, markNotificationRead } from '../../services/api';

export default function TopBar({
  title,
  subtitle,
  onOpenMobile,
  apiHealth,
  onRefreshHealth,
  isRefreshingHealth,
  onNavigate
}) {
  const { user, switchDemoRole } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState(false);

  // Fetch notifications
  useEffect(() => {
    let ignore = false;
    async function loadNotifs() {
      if (!user) return;
      const res = await fetchUserNotifications();
      if (!ignore && res.success && res.data) {
        setNotifications(res.data.notifications || []);
        setUnreadCount(res.data.unread_count || 0);
      }
    }
    loadNotifs();
    const interval = setInterval(loadNotifs, 15000);
    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, [user]);

  const handleMarkRead = async (notif) => {
    await markNotificationRead(notif.id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, is_read: 1 } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    if (notif.reference_no && onNavigate) {
      setShowNotifMenu(false);
      onNavigate('track', notif.reference_no);
    }
  };

  return (
    <header className="h-16 bg-white border-b border-[#DCDDD4] px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-[0_1px_2px_rgba(37,44,41,0.02)]">
      {/* Left: Mobile hamburger & title context */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobile}
          className="lg:hidden p-2 rounded-md text-[#68716A] hover:bg-[#ECEAE2] hover:text-[#252C29] transition-colors cursor-pointer"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[#252C29]">
              {title}
            </h2>
          </div>
          {subtitle && (
            <p className="text-xs text-[#68716A] hidden md:block">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Right Controls: Role Switcher, Notifications, API Health */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Quick Role Switcher Pill Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowRoleMenu(!showRoleMenu)}
            title="Demo Persona Switcher (For local evaluation only)"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#ECEAE2]/80 hover:bg-[#ECEAE2] border border-[#DCDDD4] text-xs font-medium text-[#252C29] transition-colors cursor-pointer"
          >
            {user?.role === 'admin' ? (
              <Shield className="w-3.5 h-3.5 text-[#254A40]" />
            ) : user?.role === 'staff' ? (
              <Briefcase className="w-3.5 h-3.5 text-[#254A40]" />
            ) : (
              <User className="w-3.5 h-3.5 text-[#254A40]" />
            )}
            <span className="hidden sm:inline font-semibold">{user?.full_name || 'Select Role'}</span>
            <span className="text-[10px] text-[#68716A] bg-white px-1.5 py-0.5 rounded border border-[#DCDDD4]">
              {user?.role === 'admin' ? 'Admin' : user?.role === 'staff' ? user?.department : 'Citizen'}
            </span>
          </button>

          {showRoleMenu && (
            <div className="absolute right-0 mt-2 w-72 bg-white border border-[#DCDDD4] rounded-lg shadow-xl p-2.5 z-50 space-y-2">
              <div className="px-2 py-1 border-b border-[#ECEAE2]">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#B4483E]">
                  Demo Persona Switcher
                </div>
                <div className="text-[11px] text-[#68716A]">
                  For local evaluator testing. Authenticates via live backend JWT tokens. Production uses standard OAuth2 / credentials.
                </div>
              </div>

              {Object.entries(DEMO_USERS).map(([key, demo]) => {
                const isSelected = user?.email === demo.email;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      switchDemoRole(key);
                      setShowRoleMenu(false);
                      if (onNavigate) {
                        if (demo.role === 'citizen') onNavigate('citizen_dashboard');
                        else if (demo.role === 'staff') onNavigate('staff_workspace');
                        else if (demo.role === 'admin') onNavigate('admin_dashboard');
                      }
                    }}
                    className={`w-full flex items-center justify-between p-2 rounded-md text-xs text-left transition-colors cursor-pointer ${
                      isSelected ? 'bg-[#254A40]/10 text-[#254A40] font-semibold' : 'hover:bg-[#ECEAE2] text-[#252C29]'
                    }`}
                  >
                    <div>
                      <div className="font-semibold">{demo.label}</div>
                      <div className="text-[11px] text-[#68716A]">{demo.badge}</div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-[#254A40]" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Notifications Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowNotifMenu(!showNotifMenu)}
            className="p-2 rounded-md text-[#68716A] hover:bg-[#ECEAE2] hover:text-[#252C29] relative transition-colors cursor-pointer"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#B4483E] ring-2 ring-white" />
            )}
          </button>

          {showNotifMenu && (
            <div className="absolute right-0 mt-2 w-80 bg-white border border-[#DCDDD4] rounded-lg shadow-xl p-3 z-50 space-y-2 max-h-96 overflow-y-auto">
              <div className="flex items-center justify-between border-b border-[#ECEAE2] pb-2">
                <span className="text-xs font-semibold text-[#252C29]">Notifications</span>
                <span className="text-[11px] text-[#68716A]">{unreadCount} unread</span>
              </div>

              {notifications.length === 0 ? (
                <p className="text-xs text-[#68716A] py-4 text-center">No notifications yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {notifications.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleMarkRead(n)}
                      className={`w-full text-left p-2 rounded-md text-xs transition-colors cursor-pointer ${
                        !n.is_read ? 'bg-[#ECEAE2]/60 font-medium' : 'hover:bg-gray-50 text-[#68716A]'
                      }`}
                    >
                      <div className="flex justify-between items-baseline">
                        <span className="text-[#252C29] font-semibold">{n.title}</span>
                        <span className="text-[10px] text-[#68716A]">{n.created_at?.split(' ')[1] || ''}</span>
                      </div>
                      <p className="text-[11px] text-[#68716A] line-clamp-2 mt-0.5">{n.message}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Backend health pill */}
        <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#ECEAE2] border border-[#DCDDD4] text-xs text-[#252C29]">
          <span
            className={`w-2 h-2 rounded-full ${
              apiHealth?.success ? 'bg-[#367454]' : 'bg-[#A66A25]'
            }`}
          />
          <button
            type="button"
            onClick={onRefreshHealth}
            disabled={isRefreshingHealth}
            title="Refresh backend status"
            className="text-[#68716A] hover:text-[#252C29] cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshingHealth ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </header>
  );
}
