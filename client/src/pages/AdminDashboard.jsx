// src/pages/AdminDashboard.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function AdminDashboard() {
  const [metrics, setMetrics] = useState({
    activeConnections: 0,
    totalSocketEvents: 0,
    totalMessagesProcessed: 0,
    cacheHitRatio: 100.0,
    averageAiLatencyMs: 0,
    vectorDataKB: 0,
    dbMessageCount: 0,
    latencyHistory: [],
    hourlyActivityLoad: [],
    nginxActiveConnections: 0,
    nginxTotalRequests: 0,
    nginxStatus: "CONNECTING..."
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isApiOnline, setIsApiOnline] = useState(false); // ⚡ Explicit API connection guard tracker
  const navigate = useNavigate();

  const fetchLiveMetrics = async () => {
    try {
      const res = await fetch("/api/admin/metrics", { credentials: 'include' });
      if (res.status === 401 || res.status === 403) {
        navigate('/');
        return;
      }
      if (!res.ok) throw new Error("Failed to pull system telemetry data streams.");
      const data = await res.json();
      
      setMetrics(data);
      setIsApiOnline(true); // Explicitly mark API link active on status 200 payload arrival
      setError(null);
    } catch (err) {
      setError(err.message);
      setIsApiOnline(false);
    } finally { 
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveMetrics();
    const telemetryInterval = setInterval(fetchLiveMetrics, 3000);
    return () => clearInterval(telemetryInterval);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-950 text-white font-sans">
        <div className="h-8 w-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">Securing System Terminal Interface...</p>
      </div>
    );
  }

  const latencyList = metrics?.latencyHistory || [];
  const activityLoadList = metrics?.hourlyActivityLoad || [];

  const maxLatencyVal = Math.max(...latencyList.map(o => o.ms || 0), 100);
  const maxLoadVal = Math.max(...activityLoadList.map(o => o.count || 0), 10);

  const chartWidth = 500;
  const chartHeight = 150;
  const padding = 30;
  
  const points = activityLoadList.length > 0 
    ? activityLoadList.map((item, idx) => {
        const x = padding + (idx * (chartWidth - padding * 2)) / (activityLoadList.length - 1 || 1);
        const y = chartHeight - padding - ((item.count || 0) / maxLoadVal) * (chartHeight - padding * 2);
        return `${x},${y}`;
      }).join(' ')
    : `${padding},${chartHeight - padding} ${chartWidth - padding},${chartHeight - padding}`;

  // 🧠 Smart fallback detection checking for any successful incoming state signals
  const isGatewayHealthy = isApiOnline && (metrics.nginxStatus === 'HEALTHY' || metrics.nginxStatus === 'ACTIVE' || !metrics.nginxStatus || metrics.nginxStatus === 'CONNECTING...');

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 p-6 font-sans antialiased">
      
      {/* LOCKED SYSTEM HEADER */}
      <header className="max-w-7xl mx-auto mb-8 border-b border-slate-800 pb-5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-red-600 text-white px-2 py-0.5 rounded text-[9px] font-black tracking-widest uppercase">Root Admin Secure Shell</span>
            <h1 className="text-xl font-black tracking-tight text-white">Platform Control Terminal</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">Isolate framework architecture monitor reading directly from Nginx, Redis, and PostgreSQL logs.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${isGatewayHealthy ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
          <span className={`text-xs font-mono font-bold ${isGatewayHealthy ? 'text-emerald-400' : 'text-red-400'}`}>
            GATEWAY_{isGatewayHealthy ? 'HEALTHY' : 'UNREACHABLE'}
          </span>
        </div>
      </header>

      {error && (
        <div className="max-w-7xl mx-auto mb-6 p-4 bg-red-950/40 border border-red-900/50 rounded-2xl text-xs font-mono text-red-400">
          ⚠️ Operational Warning: {error}
        </div>
      )}

      {/* ⚡ EXTRA TOP TELEMETRY STRIP: NGINX GATEWAY METRICS */}
      <section className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nginx Proxy Connections</p>
            <h4 className="text-xl font-black text-blue-400 mt-1">{metrics?.nginxActiveConnections || 0} Network Sockets</h4>
          </div>
          <span className="text-xl bg-slate-950 p-2 rounded-xl border border-slate-800">🌐</span>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Gateway Accumulated Requests</p>
            <h4 className="text-xl font-black text-yellow-500 mt-1">{metrics?.nginxTotalRequests || 0} Total Packets</h4>
          </div>
          <span className="text-xl bg-slate-950 p-2 rounded-xl border border-slate-800">⚡</span>
        </div>
      </section>

      {/* 4 CORE ANALYTICAL NUMERIC BLOCKS */}
      <main className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Active Sockets</p>
          <h3 className="text-3xl font-black text-white tracking-tight">{metrics?.activeConnections || 0}</h3>
          <p className="text-[10px] text-slate-500 mt-2">Live socket connections connected to current RAM clusters</p>
          <span className="absolute top-4 right-4 text-emerald-500 text-sm">🔌</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Redis Invalidation Ratio</p>
          <h3 className="text-3xl font-black text-white tracking-tight">{metrics?.cacheHitRatio || 100.0}%</h3>
          <div className="w-full bg-slate-800 h-1 rounded-full mt-3 overflow-hidden">
            <div className="bg-sky-400 h-full transition-all duration-500" style={{ width: `${metrics?.cacheHitRatio || 100.0}%` }}></div>
          </div>
          <span className="absolute top-4 right-4 text-sky-400 text-lg">💾</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Vector Storage Footprint</p>
          <h3 className="text-3xl font-black text-indigo-400 tracking-tight">{metrics?.vectorDataKB || 0}<span className="text-xs font-bold text-slate-500 ml-1">KB</span></h3>
          <p className="text-[10px] text-slate-500 mt-2">768-dim embeddings tracked inside PgVector arrays</p>
          <span className="absolute top-4 right-4 text-indigo-400 text-lg">🧠</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Mean AI Compute Time</p>
          <h3 className="text-3xl font-black text-amber-500 tracking-tight">{metrics?.averageAiLatencyMs || 0}<span className="text-xs font-bold text-slate-500 ml-1">ms</span></h3>
          <p className="text-[10px] text-slate-500 mt-2">Average Gemini API request latency cycle speed</p>
          <span className="absolute top-4 right-4 text-amber-500 text-lg">✨</span>
        </div>

      </main>

      {/* GRAPHING GRID SECTION */}
      <section className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* GRAPH A: REAL-TIME TRAFFIC LOAD WAVEFORM CHART */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <span>📈</span> Message Traffic Activity Curves
            </h2>
            <p className="text-[11px] text-slate-400 mb-4">Visualizes payload submission densities over time.</p>
          </div>

          <div className="bg-slate-950/40 p-2 rounded-xl border border-slate-800/40 flex items-center justify-center">
            {activityLoadList.length === 0 ? (
              <div className="h-[150px] flex items-center justify-center text-xs text-slate-600 font-mono">Insufficient load history data.</div>
            ) : (
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto overflow-visible">
                <line x1={padding} y1={padding} x2={chartWidth - padding} y2={padding} stroke="#1e293b" strokeDasharray="3 3" />
                <line x1={padding} y1={chartHeight / 2} x2={chartWidth - padding} y2={chartHeight / 2} stroke="#1e293b" strokeDasharray="3 3" />
                <line x1={padding} y1={chartHeight - padding} x2={chartWidth - padding} y2={chartHeight - padding} stroke="#334155" strokeWidth="1.5" />
                
                <polyline fill="none" stroke="#f43f5e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={points} />
                
                {activityLoadList.map((item, idx) => {
                  const x = padding + (idx * (chartWidth - padding * 2)) / (activityLoadList.length - 1 || 1);
                  const y = chartHeight - padding - ((item.count || 0) / maxLoadVal) * (chartHeight - padding * 2);
                  return (
                    <g key={idx}>
                      <circle cx={x} cy={y} r="4" fill="#fff" stroke="#f43f5e" strokeWidth="2" />
                      <text x={x} y={y - 10} fill="#f43f5e" fontSize="9" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                        {item.count || 0}
                      </text>
                      <text x={x} y={chartHeight - padding + 15} fill="#64748b" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                        {item.hour}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        </div>

        {/* GRAPH B: BACKGROUND PIPELINE INGESTION LATENCY BAR CHART */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <span>📊</span> AI Embedding Operation Tracking Latency
            </h2>
            <p className="text-[11px] text-slate-400 mb-4">Measures elapsed execution times for background vector pipelines.</p>
          </div>

          <div className="w-full flex items-end justify-between gap-1.5 h-[150px] pt-6 px-2 border-b border-l border-slate-800 bg-slate-950/20 rounded-bl-xl">
            {latencyList.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-xs text-slate-600 font-mono">
                No active vector embedding runs tracked yet.
              </div>
            ) : (
              latencyList.map((item, index) => {
                const heightPct = ((item.ms || 0) / maxLatencyVal) * 100;
                return (
                  <div key={index} className="flex-1 flex flex-col items-center group relative cursor-pointer">
                    <div className="absolute bottom-full mb-1 bg-indigo-600 text-white font-mono text-[8px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10 whitespace-nowrap">
                      {item.ms}ms
                    </div>
                    <div 
                      className="w-full bg-indigo-600/20 border-t-2 border-indigo-500 group-hover:bg-indigo-500 transition-all duration-200 rounded-t-xs min-h-[4px]"
                      style={{ height: `${Math.max(heightPct, 3)}%` }}
                    ></div>
                    <span className="text-[7px] font-mono font-bold tracking-tighter text-slate-600 mt-2 block truncate max-w-full text-center">
                      {item.operation}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </section>

    </div>
  );
}

export default AdminDashboard;