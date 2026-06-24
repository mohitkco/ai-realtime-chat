// src/pages/AuthPage.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:8080";
function AuthPage({ onLoginSuccess }) {
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [inputUsername, setInputUsername] = useState("");
  const [inputPassword, setInputPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const navigate = useNavigate();

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    const endpoint = isSignUpMode ? "/api/register" : "/api/login";

    try {
      // credentials: 'include' forces the browser to accept and store the incoming HttpOnly session cookie
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: inputUsername.trim(), password: inputPassword }),
        credentials: 'include' 
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Authentication failed");

      if (isSignUpMode) {
        alert(data.message);
        setIsSignUpMode(false); 
        setInputPassword(""); 
      } else {
        onLoginSuccess(data.username);
        navigate('/dashboard'); // Clean multi-page redirection to the main dashboard workspace
      }
    } catch (err) {
      setAuthError(err.message);
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-100 dark:bg-slate-950 px-4 transition-colors">
      <form onSubmit={handleAuthSubmit} className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-xl max-w-md w-full border border-slate-200 dark:border-slate-800 space-y-5">
        <div className="text-center space-y-1">
          <span className="text-4xl">🔐</span>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">{isSignUpMode ? "Create Account" : "Welcome Back"}</h2>
          <p className="text-xs text-slate-400">{isSignUpMode ? "Register to start workspace synchronization" : "Sign in to enter live workspace channels"}</p>
        </div>

        {authError && <div className="p-3 rounded-lg bg-red-50 text-red-600 text-xs font-semibold text-center border border-red-100">{authError}</div>}

        <div className="space-y-3">
          <input type="text" required placeholder="Username" value={inputUsername} onChange={(e) => setInputUsername(e.target.value)} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm outline-none text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500" />
          <input type="password" required placeholder="Password" value={inputPassword} onChange={(e) => setInputPassword(e.target.value)} className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm outline-none text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500" />
        </div>

        <button type="submit" className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm tracking-wide shadow-md transition-all active:scale-98">{isSignUpMode ? "Sign Up" : "Sign In"}</button>
        <p className="text-center text-xs text-slate-500">{isSignUpMode ? "Already have an account?" : "New to the workspace?"} <button type="button" onClick={() => { setIsSignUpMode(!isSignUpMode); setAuthError(""); }} className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline">{isSignUpMode ? "Sign In" : "Register Here"}</button></p>
      </form>
    </div>
  );
}

export default AuthPage;