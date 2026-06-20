// src/components/CreateGroupModal.jsx
import React, { useState } from 'react';

function CreateGroupModal({ isOpen, onClose, allUsers, currentUsername, onCreateGroup }) {
  const [groupName, setGroupName] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState([]);

  if (!isOpen) return null;

  const handleCheckboxToggle = (userId) => {
    setSelectedUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    onCreateGroup(groupName.trim(), selectedUserIds);
    setGroupName("");
    setSelectedUserIds([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs px-4">
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
            <span>➕</span> Create New Group
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold p-1">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Group Channel Name</label>
            <input 
              type="text" 
              required
              placeholder="e.g. dev-team" 
              value={groupName} 
              onChange={(e) => setGroupName(e.target.value)} 
              className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm outline-none text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500" 
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Select Members to Invite</label>
            <div className="max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl p-2 space-y-1 bg-slate-50 dark:bg-slate-800/40">
              {allUsers.map((u) => {
                if (u.username === currentUsername) return null;
                return (
                  <label key={u.id} className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-white dark:hover:bg-slate-800 shadow-2xs border border-transparent hover:border-slate-100 dark:hover:border-slate-700/50 text-sm transition-all">
                    <input 
                      type="checkbox" 
                      checked={selectedUserIds.includes(u.id)} 
                      onChange={() => handleCheckboxToggle(u.id)} 
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4" 
                    />
                    <span className="font-medium text-slate-700 dark:text-slate-200">{u.username}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs transition-all">Cancel</button>
            <button type="submit" className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-all">Assemble Group</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateGroupModal;