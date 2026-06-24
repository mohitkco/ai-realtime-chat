// src/pages/Dashboard.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import CreateGroupModal from '../components/CreateGroupModal';
import SearchDrawer from '../components/SearchDrawer';

// 🚀 Force native WebSockets explicitly, dropping polling fallback crash loops
const socket = io({
  withCredentials: true,
  transports: ['websocket'],
  upgrade: false
});

function Dashboard({ username, onLogout }) {
  const [room, setRoom] = useState(null);
  const [activeChatLabel, setActiveChatLabel] = useState("");
  const [isPrivateDM, setIsPrivateDM] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false); 
  const [isMembersOpen, setIsMembersOpen] = useState(false); 
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // 📱 Tracks mobile slide-out nav state
  
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  
  const [chosenMood, setChosenMood] = useState("Casual & Friendly");
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const [channels, setChannels] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]); 

  const recognitionRef = useRef(null);
  const chatEndRef = useRef(null);
  const typingTimeoutRef = useRef(null); 
  const navigate = useNavigate();

  const currentUserObj = allUsers.find(u => u.username === username);
  const currentUserId = currentUserObj ? currentUserObj.id : null;

  const cleanGroupName = activeChatLabel.replace('# ', '');
  const currentChannelObj = channels.find(c => c.name === cleanGroupName);

  const fetchWorkspaceData = async () => {
    try {
      const [roomsRes, usersRes] = await Promise.all([
        fetch("/api/rooms", { credentials: 'include' }),
        fetch("/api/users", { credentials: 'include' })
      ]);
      if (roomsRes.status === 401) { onLogout(); navigate('/'); return; }
      
      const roomsData = await roomsRes.json();
      const usersData = await usersRes.json();

      if (Array.isArray(roomsData)) setChannels(roomsData);
      if (Array.isArray(usersData)) setAllUsers(usersData);
    } catch (err) {
      console.error("Error linking secure records:", err);
    }
  };

  useEffect(() => {
    fetchWorkspaceData();
    socket.emit('user_online', username);

    socket.on('online_users_list', (usersArray) => {
      setOnlineUsers(usersArray);
    });

    socket.on('user_typing', (data) => {
      setTypingUsers((prev) => prev.includes(data.username) ? prev : [...prev, data.username]);
    });

    socket.on('user_stop_typing', (data) => {
      setTypingUsers((prev) => prev.filter(u => u !== data.username));
    });

    return () => {
      socket.off('online_users_list');
      socket.off('user_typing');
      socket.off('user_stop_typing');
    };
  }, [username]);

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [darkMode]);

  useEffect(() => {
    socket.on("receive_message", (data) => {
      const normalizedMsg = { ...data, readReceipts: data.readReceipts || [] };
      setChatHistory((prev) => [...prev, normalizedMsg]);
    });

    socket.on("message_deleted", (data) => {
      setChatHistory((prev) => prev.filter((msg) => msg.id !== data.messageId));
    });

    socket.on("room_deleted", (data) => {
      setChannels((prev) => prev.filter(c => c.name !== data.roomName));
      if (room === data.roomName) {
        setRoom(null);
        setActiveChatLabel("");
        setChatHistory([]);
        setIsMembersOpen(false);
      }
    });

    socket.on("room_membership_updated", () => {
      fetchWorkspaceData();
    });

    socket.on("system_purge_event", () => {
      setChatHistory([]);
      setAiSuggestions([]);
    });

    socket.on("message_status_updated", (data) => {
      const { messageId, userId, status } = data;
      setChatHistory((prevHistory) =>
        prevHistory.map((msg) => {
          if (msg.id === messageId) {
            const receipts = msg.readReceipts ? [...msg.readReceipts] : [];
            const exists = receipts.some(r => r.userId === userId);
            if (!exists) {
              receipts.push({ userId, status });
            } else {
              return {
                ...msg,
                readReceipts: receipts.map(r => r.userId === userId ? { ...r, status } : r)
              };
            }
            return { ...msg, readReceipts: receipts };
          }
          return msg;
        })
      );
    });

    return () => {
      socket.off("receive_message");
      socket.off("message_deleted");
      socket.off("room_deleted");
      socket.off("room_membership_updated");
      socket.off("system_purge_event");
      socket.off("message_status_updated");
    };
  }, [room]);

  useEffect(() => { 
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); 
  }, [chatHistory, typingUsers]); 

  const fetchDirectHistory = async (targetRoom) => {
    if (!targetRoom) return;
    try {
      const res = await fetch(`/api/messages/${targetRoom}`, { credentials: 'include' });
      if (res.ok) {
        const history = await res.json();
        setChatHistory(Array.isArray(history) ? history : []);
      } else {
        setChatHistory([]);
      }
    } catch (err) {
      setChatHistory([]);
    }
  };

  const handleSelectUserDM = (targetUser) => {
    setIsPrivateDM(true);
    const displayLabel = `💬 ${targetUser}`;
    setActiveChatLabel(displayLabel);
    const sortedStringToken = [username, targetUser].sort().join("-");
    const targetRoomName = `private-dm-${sortedStringToken}`;
    setRoom(targetRoomName);
    setChatHistory([]);
    setAiSuggestions([]);
    setTypingUsers([]); 
    setIsSearchOpen(false); 
    setIsMembersOpen(false); 
    setIsMobileMenuOpen(false); 
    socket.emit("join_room", targetRoomName);
    fetchDirectHistory(targetRoomName);
  };

  const handleSelectGroupChannel = (channelName) => {
    setIsPrivateDM(false);
    setActiveChatLabel(`# ${channelName}`);
    setRoom(channelName);
    setChatHistory([]);
    setAiSuggestions([]);
    setTypingUsers([]); 
    setIsSearchOpen(false); 
    setIsMobileMenuOpen(false); 
    socket.emit("join_room", channelName);
    fetchDirectHistory(channelName);
  };

  const handleInputChange = (e) => {
    setMessage(e.target.value);
    if (!room) return;
    socket.emit('typing', { room, username });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('stop_typing', { room, username });
    }, 2000);
  };

  const handleRequestAiSuggestions = async () => {
    if (!room) return;
    setIsAiLoading(true);
    try {
      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName: room, mood: chosenMood }),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed loading suggestions");
      setAiSuggestions(data);
    } catch (err) {
      alert(err.message);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleCreateGroupSubmit = async (groupName, selectedUserIds) => {
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: groupName, invitedUserIds: selectedUserIds }),
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create channel");
      setChannels((prev) => [...prev, data]);
      handleSelectGroupChannel(data.name);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleExitGroup = async () => {
    if (!room || isPrivateDM) return;
    if (room === 'general') return alert("You cannot leave the default general workspace channel.");
    if (!window.confirm(`Are you sure you want to leave group #${room}?`)) return;

    try {
      const cleanRoomName = room.replace('#', '').trim();
      const res = await fetch(`/api/rooms/${cleanRoomName}/exit`, {
        method: "POST",
        credentials: 'include'
      });
      
      const data = await res.json(); 
      if (!res.ok) throw new Error(data.error || "Failed to exit group");
      
      alert(data.message === "SUCCESS_DELETED" ? "Channel deleted because no members remain." : `Successfully left group #${cleanRoomName}`);
      
      setRoom(null);
      setActiveChatLabel("");
      setChatHistory([]);
      setIsMembersOpen(false);
      setChannels((prevChannels) => prevChannels.filter(c => c.name !== cleanRoomName));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleClearPersonalChat = async () => {
    if (!room) return;
    if (!window.confirm(`⚠️ Clear history for room #${room}?`)) return;
    try {
      const cleanRoomName = room.replace('#', '').trim();
      const res = await fetch(`/api/rooms/${cleanRoomName}/clear-personal`, {
        method: "POST",
        credentials: 'include'
      });
      if (!res.ok) throw new Error("Failed to clear personal history.");
      setChatHistory([]);
      setAiSuggestions([]);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteMessage = (messageId) => {
    if (!window.confirm("Delete this message for everyone?")) return;
    setChatHistory((prev) => prev.filter((msg) => msg.id !== messageId));
    socket.emit("delete_message", { messageId, room, senderName: username });
  };

  // 🎙️ Lazily instantiate the constructor on a real tap interaction to keep mobile webkit happy
  const toggleListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Microphone API not supported on this mobile browser architecture.");

    if (!recognitionRef.current) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.lang = 'en-US';
      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setMessage((prev) => prev + (prev ? " " : "") + transcript);
      };
      recognitionRef.current = recognition;
    }

    isListening ? recognitionRef.current.stop() : recognitionRef.current.start();
  };

  const handleLogoutSubmit = async () => {
    try {
      await fetch("/api/logout", { method: "POST", credentials: 'include' });
      onLogout();
      navigate('/');
    } catch (err) {
      console.error(err);
    }
  };

  const sendMessage = () => {
    if (!message.trim() || !room) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socket.emit('stop_typing', { room, username }); 
    socket.emit("send_message", { room, text: message, senderName: username });
    setMessage("");
    setAiSuggestions([]);
  };

  // Reusable Component Sidebar layout block configuration logic
  const renderSidebarContent = () => (
    <>
      <div className="overflow-y-auto flex-1">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-md font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="bg-indigo-600 text-white px-2 py-0.5 rounded-lg text-xs font-black">💬</span> ChatApp
          </h2>
          <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">✕</button>
        </div>
        
        <div className="p-4 space-y-6">
          <button 
            onClick={() => { setIsModalOpen(true); setIsMobileMenuOpen(false); }} 
            className="w-full py-2.5 px-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 text-indigo-600 dark:text-indigo-400 font-bold text-xs hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 transition-all flex items-center justify-center gap-2 shadow-2xs"
          >
            <span>➕</span> Create New Group
          </button>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2 mb-2">📁 My Group Channels</p>
            <nav className="space-y-1">
              {channels.map((ch) => (
                <button key={ch.id || ch.name} onClick={() => handleSelectGroupChannel(ch.name)} className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-left transition-all ${(!isPrivateDM && room === ch.name) ? "bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-white font-bold" : "hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-400"}`}>
                  <span className="text-slate-400 dark:text-slate-500 font-mono">#</span>{ch.name}
                </button>
              ))}
            </nav>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2 mb-2">👤 Direct Messages</p>
            <div className="space-y-1">
              {allUsers.map((u) => {
                if (u.username === username) return null;
                const isSelectedDM = isPrivateDM && activeChatLabel.includes(u.username);
                const isUserOnline = onlineUsers.includes(u.username);

                return (
                  <button key={u.id} onClick={() => handleSelectUserDM(u.username)} className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-sm font-medium text-left transition-all ${isSelectedDM ? "bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-white font-bold" : "hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-400"}`}>
                    <div className="flex items-center gap-2.5 truncate">
                      <span className={`h-2 w-2 rounded-full flex-shrink-0 transition-colors duration-300 ${isUserOnline ? "bg-emerald-500 animate-pulse" : "bg-slate-300 dark:bg-slate-700"}`}></span>
                      <span className="truncate">{u.username}</span>
                    </div>
                    {isUserOnline && <span className="text-[9px] bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 font-bold px-1.5 py-0.5 rounded-sm">LIVE</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5 truncate mr-1">
          <div className="h-8 w-8 min-w-[32px] rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold uppercase">{username.charAt(0)}</div>
          <div className="truncate">
            <p className="text-xs font-bold text-slate-800 dark:text-white leading-tight truncate">{username} (You)</p>
            <button onClick={handleLogoutSubmit} className="text-[10px] text-red-500 font-bold hover:underline block text-left">Log Out</button>
          </div>
        </div>
        <span className="h-2 w-2 min-w-[8px] bg-emerald-500 rounded-full animate-pulse"></span>
      </div>
    </>
  );

  return (
    <div className="flex h-screen w-full bg-slate-100 dark:bg-slate-950 font-sans antialiased text-slate-800 dark:text-slate-100 transition-colors duration-300 relative overflow-hidden">
      
      {/* 🖥️ DESKTOP PERMANENT SIDEBAR */}
      <aside className="w-64 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 flex flex-col justify-between border-r border-slate-200 dark:border-slate-800 hidden md:flex transition-colors duration-300">
        {renderSidebarContent()}
      </aside>

      {/* 📱 MOBILE OVERLAY DRAWER PANEL SIDEBAR */}
      <div className={`fixed inset-0 z-50 md:hidden transition-opacity duration-300 ${isMobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={() => setIsMobileMenuOpen(false)}></div>
        <aside className={`absolute top-0 left-0 bottom-0 w-72 max-w-[80vw] bg-white dark:bg-slate-950 flex flex-col justify-between border-r border-slate-200 dark:border-slate-800 transition-transform duration-300 transform ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}>
          {renderSidebarContent()}
        </aside>
      </div>

      {/* CORE CHAT HUB WINDOW WRAPPER LAYER */}
      <div className={`flex flex-col flex-1 h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-xs relative overflow-hidden ${!room ? "hidden md:flex" : "flex"}`}>
        
        <header className="flex items-center justify-between px-4 md:px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 gap-2">
          <div className="flex items-center gap-2 truncate">
            <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 mr-1 text-sm font-bold">☰</button>
            {room && (
              <button onClick={() => setRoom(null)} className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 mr-1 text-sm font-bold">←</button>
            )}
            
            <h1 className="text-sm md:text-md font-bold text-slate-900 dark:text-white tracking-wide truncate">
              {room ? activeChatLabel : "👋 Welcome to ChatApp"}
            </h1>
            
            {room && (
              <div className="hidden sm:flex items-center gap-1.5 ml-2">
                <button onClick={handleClearPersonalChat} className="text-[11px] bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold px-2 py-0.5 rounded-md transition-all border border-slate-200 dark:border-slate-700 shadow-3xs">🧹 Clear</button>
                {!isPrivateDM && room !== 'general' && (
                  <button onClick={handleExitGroup} className="text-[11px] bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 font-bold px-2 py-0.5 rounded-md transition-all border border-red-100 dark:border-red-900/30">🚪 Leave</button>
                )}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
            {room && (
              <>
                <button 
                  onClick={() => setIsSearchOpen(!isSearchOpen)} 
                  className={`px-2.5 py-1.5 md:px-3 md:py-2 rounded-xl border transition-all text-[11px] md:text-xs font-bold flex items-center gap-1 shadow-2xs ${isSearchOpen ? "bg-indigo-600 border-indigo-600 text-white" : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"}`}
                >
                  <span>🔍</span> <span className="hidden sm:inline">Search</span>
                </button>

                {!isPrivateDM && (
                  <button 
                    onClick={() => setIsMembersOpen(!isMembersOpen)} 
                    className={`px-2.5 py-1.5 md:px-3 md:py-2 rounded-xl border transition-all text-[11px] md:text-xs font-bold flex items-center gap-1 shadow-2xs ${isMembersOpen ? "bg-emerald-600 border-emerald-600 text-white" : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"}`}
                  >
                    <span>👥</span> <span className="hidden sm:inline">Members</span> ({currentChannelObj && currentChannelObj.members ? currentChannelObj.members.length : 0})
                  </button>
                )}
              </>
            )}
            <button onClick={() => setDarkMode(!darkMode)} className="p-1.5 md:p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs md:text-sm">
              {darkMode ? '☀️' : '🌙'}
            </button>
          </div>
        </header>

        {room && (
          <div className="flex sm:hidden items-center justify-start gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
            <button onClick={handleClearPersonalChat} className="text-[10px] bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 shadow-3xs">🧹 Clear copy</button>
            {!isPrivateDM && room !== 'general' && (
              <button onClick={handleExitGroup} className="text-[10px] bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 font-bold px-2 py-1 rounded-md border border-red-100 dark:border-red-900/20">🚪 Leave channel</button>
            )}
          </div>
        )}

        {!room ? (
          <main className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3 bg-slate-50/50 dark:bg-slate-950/40">
            <div className="h-16 w-16 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center text-3xl shadow-sm animate-bounce">💬</div>
            <h2 className="text-xl font-extrabold text-slate-800 dark:text-white">Hello, {username}!</h2>
            <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
              Open the toggle menu drawer button or select a workspace channel in the sidebar layout column parameters to access secure AI real-time chats.
            </p>
          </main>
        ) : (
          <div className="flex flex-1 overflow-hidden w-full relative">
            
            <div className="flex flex-col flex-1 h-full relative overflow-hidden">
              <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50/50 dark:bg-slate-950/40 space-y-4">
                {chatHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-600">
                    <p className="text-xs md:text-sm font-semibold">Secure conversation framework active.</p>
                    <p className="text-[10px] md:text-[11px] text-slate-400">Say hello to initialize real-time data sync channels.</p>
                  </div>
                ) : (
                  chatHistory.map((msg, index) => {
                    const isMe = msg.user?.name === username;
                    const receipts = msg.readReceipts || [];
                    
                    const uniqueReadersCount = receipts.filter(r => r.userId !== currentUserId && r.status === 'READ').length;
                    const expectedRecipientsCount = isPrivateDM 
                      ? 1 
                      : currentChannelObj && currentChannelObj.members 
                        ? currentChannelObj.members.length - 1 
                        : 1;

                    const isSeenBySomeone = uniqueReadersCount > 0;
                    const isSeenByEveryone = uniqueReadersCount >= expectedRecipientsCount;

                    return (
                      <div 
                        key={msg.id || index} 
                        className={`flex flex-col group/msg ${isMe ? "items-end" : "items-start"}`}
                        onMouseEnter={() => {
                          if (!isMe && msg.id && currentUserId) {
                            const alreadyRead = receipts.some(r => r.userId === currentUserId && r.status === 'READ');
                            if (!alreadyRead) {
                              socket.emit('mark_read', {
                                userId: currentUserId,
                                messageId: msg.id,
                                roomId: room
                              });
                            }
                          }
                        }}
                      >
                        <div className="flex items-center gap-2 mb-1 px-1">
                          <span className="text-[11px] text-slate-400 dark:text-slate-500 font-semibold">{isMe ? "You" : msg.user?.name}</span>
                          {isMe && msg.id && (
                            <button onClick={() => handleDeleteMessage(msg.id)} className="opacity-0 group-hover/msg:opacity-100 text-slate-400 hover:text-red-500 text-xs transition-all duration-150 pl-1">
                              🗑️
                            </button>
                          )}
                        </div>
                        <div className="flex items-end gap-1.5">
                          <div className={`max-w-[75vw] md:max-w-md px-3.5 py-2 rounded-2xl text-sm leading-relaxed shadow-xs ${isMe ? "bg-indigo-600 text-white rounded-tr-none" : "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700/60 rounded-tl-none"}`}>
                            {msg.text}
                          </div>
                          {isMe && (
                            <span className={`text-[11px] font-black tracking-tighter select-none transition-colors duration-200 ${isSeenByEveryone ? "text-sky-500" : isSeenBySomeone ? "text-slate-400" : "text-slate-200 dark:text-slate-700"}`}>
                              {isSeenBySomeone ? "✓✓" : "✓"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}

                {typingUsers.length > 0 && (
                  <div className="flex flex-col items-start space-y-1 mt-2 sticky bottom-0 bg-gradient-to-t from-slate-50/90 to-transparent py-1 dark:from-slate-950/90 z-10">
                    <div className="flex items-center gap-1.5 px-1">
                      <span className="text-[11px] text-indigo-500 font-bold">
                        {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing
                      </span>
                      <span className="flex gap-0.5 items-center justify-center h-3">
                        <span className="h-1 w-1 bg-indigo-500 rounded-full animate-bounce duration-300 delay-75"></span>
                        <span className="h-1 w-1 bg-indigo-500 rounded-full animate-bounce duration-300 delay-150"></span>
                        <span className="h-1 w-1 bg-indigo-500 rounded-full animate-bounce duration-300 delay-225"></span>
                      </span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </main>

              <footer className="p-3 md:p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-wider">Mood:</span>
                    <select 
                      value={chosenMood} 
                      onChange={(e) => setChosenMood(e.target.value)}
                      className="text-[11px] md:text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-1.5 py-0.5 md:px-2 md:py-1 font-semibold outline-none text-slate-700 dark:text-slate-300"
                    >
                      <option value="Professional & Technical">💼 Professional</option>
                      <option value="Casual & Friendly">🤝 Casual</option>
                      <option value="Funny & Sarcastic">😂 Sarcastic</option>
                      <option value="Excited & Supportive">🔥 Excited</option>
                    </select>
                  </div>

                  <button 
                    onClick={handleRequestAiSuggestions} 
                    disabled={isAiLoading}
                    className="text-[10px] md:text-[11px] font-black tracking-wide text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 px-2.5 py-1 rounded-md transition-all disabled:opacity-50"
                  >
                    {isAiLoading ? "✨ Thinking..." : "✨ AI Suggestions"}
                  </button>
                </div>

                {aiSuggestions.length > 0 && (
                  <div className="flex flex-nowrap overflow-x-auto gap-2 pb-1 scrollbar-none">
                    {aiSuggestions.map((suggestion, idx) => (
                      <button 
                        key={idx}
                        onClick={() => setMessage(suggestion)}
                        className="text-xs font-medium bg-slate-50 hover:bg-indigo-600 dark:bg-slate-800 dark:hover:bg-indigo-600 text-slate-600 dark:text-slate-200 hover:text-white border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-full whitespace-nowrap flex-shrink-0 transition-all"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl p-1.5 border border-slate-200/60 dark:border-slate-700">
                  <input 
                    type="text" 
                    placeholder="Type message here..." 
                    value={message} 
                    onChange={handleInputChange} 
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()} 
                    className="flex-1 bg-transparent px-2 py-1 text-sm outline-none text-slate-800 dark:text-slate-100 min-w-0" 
                  />
                  <button onClick={toggleListening} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex-shrink-0 ${isListening ? "bg-red-500 text-white animate-pulse" : "bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300"}`}>{isListening ? '🛑' : '🎙'}</button>
                  <button onClick={sendMessage} className="bg-indigo-600 text-white px-3.5 py-1.5 rounded-lg text-[11px] font-bold flex-shrink-0">Send</button>
                </div>
              </footer>
            </div>

            {isMembersOpen && !isPrivateDM && currentChannelObj && (
              <aside className="absolute md:static right-0 top-0 bottom-0 w-60 h-full bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col z-30 shadow-xl md:shadow-none animate-in slide-in-from-right duration-200">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Channel Members</h3>
                  <button onClick={() => setIsMembersOpen(false)} className="text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-white">✕</button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                  {currentChannelObj.members && currentChannelObj.members.map((memberLink) => {
                    const userDetail = allUsers.find(u => 
                      u.id === memberLink.userId || 
                      u.id === memberLink.user?.id ||
                      u.username === memberLink.user?.username
                    );
                    if (!userDetail) return null;

                    const isMemberOnline = onlineUsers.includes(userDetail.username);
                    const isSelf = userDetail.username === username;

                    return (
                      <div key={memberLink.id} className="flex items-center justify-between px-2.5 py-2 rounded-xl bg-white dark:bg-slate-800/50 border border-slate-200/40 dark:border-slate-700/40 shadow-3xs">
                        <div className="flex items-center gap-2 truncate">
                          <span className={`h-2 w-2 rounded-full flex-shrink-0 ${isMemberOnline ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}></span>
                          <span className="text-xs font-semibold truncate text-slate-700 dark:text-slate-200">
                            {userDetail.username} {isSelf && <span className="text-[10px] text-slate-400 font-normal">(You)</span>}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </aside>
            )}

          </div>
        )}
      </div>

      <SearchDrawer isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} roomName={room} />
      <CreateGroupModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} allUsers={allUsers} currentUsername={username} onCreateGroup={handleCreateGroupSubmit} />
    </div>
  );
}

export default Dashboard;