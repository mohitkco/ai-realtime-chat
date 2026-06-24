// client/src/App.jsx
import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/AdminDashboard';
function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [isLoading, setIsLoading] = useState(true); // Loading guard flag state

  // Core background session checker hook running on initial page compilation mounts
  useEffect(() => {
    const verifySessionCookie = async () => {
      try {
        const res = await fetch("/api/me", { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setUsername(data.username);
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
        }
      } catch (err) {
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    verifySessionCookie();
  }, []);

  const handleLoginSuccess = (loggedUsername) => {
    setUsername(loggedUsername);
    setIsAuthenticated(true);
  };

  const handleLogoutClear = () => {
    setUsername("");
    setIsAuthenticated(false);
  };

  if (isLoading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="h-10 w-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-bold text-slate-400 mt-4 tracking-wider uppercase">Loading Secure DevWorkspace...</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Auth Route Guarding Logic */}
        <Route 
          path="/" 
          element={!isAuthenticated ? <AuthPage onLoginSuccess={handleLoginSuccess} /> : <Navigate to="/dashboard" />} 
        />
        
        {/* Protected Dashboard Workspace Route */}
        <Route 
          path="/dashboard" 
          element={isAuthenticated ? <Dashboard username={username} onLogout={handleLogoutClear} /> : <Navigate to="/" />} 
        />
        // Inside your main Route switcher component structure:
<Route path="/admin" element={<AdminDashboard />} />
        {/* Catch-all global fallbacks tracking invalid extensions */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;