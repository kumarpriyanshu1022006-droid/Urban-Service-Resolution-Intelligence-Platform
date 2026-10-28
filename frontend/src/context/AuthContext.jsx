import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { loginUser, registerUser, fetchCurrentUser } from '../services/api';

const AuthContext = createContext(null);

export const DEMO_USERS = {
  citizen: {
    email: 'citizen.jane@nyc.net',
    password: 'CitizenPass123!',
    label: 'Citizen Jane',
    role: 'citizen',
    badge: 'Citizen / Public'
  },
  staff_dsny: {
    email: 'officer.smith@dsny.nyc.gov',
    password: 'StaffPass123!',
    label: 'Officer Smith (DSNY)',
    role: 'staff',
    badge: 'DSNY Enforcement'
  },
  staff_dot: {
    email: 'officer.chen@dot.nyc.gov',
    password: 'StaffPass123!',
    label: 'Officer Chen (DOT)',
    role: 'staff',
    badge: 'DOT Field Crew'
  },
  staff_nypd: {
    email: 'officer.rivera@nypd.nyc.gov',
    password: 'StaffPass123!',
    label: 'Officer Rivera (NYPD)',
    role: 'staff',
    badge: 'NYPD Traffic & Safety'
  },
  staff_dep: {
    email: 'inspector.rostova@dep.nyc.gov',
    password: 'StaffPass123!',
    label: 'Inspector Rostova (DEP)',
    role: 'staff',
    badge: 'DEP Environmental Protection'
  },
  staff_dob: {
    email: 'inspector.miller@dob.nyc.gov',
    password: 'StaffPass123!',
    label: 'Inspector Miller (DOB)',
    role: 'staff',
    badge: 'DOB Structural Safety'
  },
  staff_dpr: {
    email: 'ranger.vance@parks.nyc.gov',
    password: 'StaffPass123!',
    label: 'Ranger Vance (Parks)',
    role: 'staff',
    badge: 'DPR Forestry & Parks'
  },
  admin: {
    email: 'admin@civic.nyc.gov',
    password: 'AdminPass123!',
    label: 'Marcus Vance (Admin)',
    role: 'admin',
    badge: 'Operations Manager'
  }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Initialize user session on mount
  const initAuth = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem('civic_auth_token');
    if (token) {
      const res = await fetchCurrentUser();
      if (res.success && res.data) {
        setUser(res.data);
        setLoading(false);
        return;
      }
    }

    // Default to Citizen Jane if no active session for instant interactivity
    const defaultDemo = DEMO_USERS.citizen;
    const loginRes = await loginUser(defaultDemo.email, defaultDemo.password);
    if (loginRes.success && loginRes.data?.user) {
      setUser(loginRes.data.user);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  // Login handler
  const login = async (email, password) => {
    setAuthError(null);
    const res = await loginUser(email, password);
    if (res.success && res.data?.user) {
      setUser(res.data.user);
      return { success: true };
    }
    setAuthError(res.error || 'Authentication failed');
    return { success: false, error: res.error };
  };

  // Register handler
  const register = async (userData) => {
    setAuthError(null);
    const res = await registerUser(userData);
    if (res.success && res.data?.user) {
      setUser(res.data.user);
      return { success: true };
    }
    setAuthError(res.error || 'Registration failed');
    return { success: false, error: res.error };
  };

  // Logout handler
  const logout = () => {
    localStorage.removeItem('civic_auth_token');
    setUser(null);
  };

  // Switch demo account for seamless 1-click evaluation
  const switchDemoRole = async (roleKey) => {
    const target = DEMO_USERS[roleKey];
    if (!target) return;
    setLoading(true);
    const res = await loginUser(target.email, target.password);
    if (res.success && res.data?.user) {
      setUser(res.data.user);
    }
    setLoading(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authError,
        login,
        register,
        logout,
        switchDemoRole,
        isCitizen: user?.role === 'citizen',
        isStaff: user?.role === 'staff',
        isAdmin: user?.role === 'admin'
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
