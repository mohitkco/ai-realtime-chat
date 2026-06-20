// client/src/components/SearchDrawer.jsx
import React, { useState } from 'react';

function SearchDrawer({ isOpen, onClose, roomName }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  if (!isOpen) return null;

  const handleSearchSubmit = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim() || !roomName) return;

    setIsSearching(true);
    setResults([]); // Clear existing items immediately to indicate action
    
    try {
      console.log(`📡 Dispatching hybrid search lookup for room [${roomName}] with query: "${searchQuery}"`);
      
      const res = await fetch("http://localhost:8080/api/search/hybrid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName, query: searchQuery.trim() }),
        credentials: 'include'
      });

      const data = await res.json();
      console.log("📥 Received Search Payload Response:", data);

      if (!res.ok) throw new Error(data.error || `HTTP Network Exception State: ${res.status}`);
      
      setResults(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("❌ Frontend Search Drawer Exception:", err.message);
      alert(`Search Interrupted: ${err.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col justify-between transition-all duration-200">
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header Block */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
            <span>🔍</span> AI Hybrid Search
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold p-1">✕ Close</button>
        </div>

        {/* Input Trigger Form */}
        <form onSubmit={handleSearchSubmit} className="p-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex gap-1.5">
            <input 
              type="text"
              required
              placeholder="Search concepts or keywords..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500"
            />
            <button type="submit" disabled={isSearching} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3 py-2 rounded-xl transition-all disabled:opacity-50">
              {isSearching ? "..." : "Find"}
            </button>
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5 px-1">💡 Try searching meanings, like typing "dessert" to find messages about ice-cream.</p>
        </form>

        {/* Search Results Display Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/40 dark:bg-slate-950/20">
          {results.length === 0 ? (
            <div className="text-center py-10 text-slate-400 dark:text-slate-600">
              <p className="text-xs font-semibold">{isSearching ? "Searching vector drive logs..." : "No conceptual records loaded."}</p>
              <p className="text-[10px]">{isSearching ? "Analyzing high-dimensional vector coordinates..." : "Type a query to search across deep vector logs."}</p>
            </div>
          ) : (
            results.map((item) => (
              <div key={item.id} className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-2xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-indigo-500">{item.sender}</span>
                  <span className="text-[9px] bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold px-1.5 py-0.5 rounded-full">
                    🎯 {item.confidence}% match
                  </span>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-medium break-words">
                  {item.text}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default SearchDrawer;