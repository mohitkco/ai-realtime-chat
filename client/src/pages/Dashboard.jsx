// src/pages/Dashboard.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import CreateGroupModal from '../components/CreateGroupModal';
import SearchDrawer from '../components/SearchDrawer';

const socket = io.connect("http://localhost", { withCredentials: true });

function Dashboard({ username, onLogout }) {
  const [room, setRoom] = useState(null);
  const [activeChatLabel, setActiveChatLabel] = useState("");
  const [isPrivateDM, setIsPrivateDM] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false); 
  const [isMembersOpen, setIsMembersOpen] = useState(false); // 👥 Controls right sidebar membership list state
  
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

  // Find user details locally to resolve ID matches matching usernames
  const currentUserObj = allUsers.find(u => u.username === username);
  const currentUserId = currentUserObj ? currentUserObj.id : null;

  // Resolve current active group channel entity object metadata
  const cleanGroupName = activeChatLabel.replace('# ', '');
  const currentChannelObj = channels.find(c => c.name === cleanGroupName);

  const fetchWorkspaceData = async () => {
    try {
      const [roomsRes, usersRes] = await Promise.all([
        fetch("http://localhost/api/rooms", { credentials: 'include' }),
        fetch("http://localhost/api/users", { credentials: 'include' })
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

    // 🎯 REAL-TIME BROADCAST LISTENER: Wipes channel from sidebars instantly across tabs
    socket.on("room_deleted", (data) => {
      setChannels((prev) => prev.filter(c => c.name !== data.roomName));
      if (room === data.roomName) {
        setRoom(null);
        setActiveChatLabel("");
        setChatHistory([]);
        setIsMembersOpen(false);
      }
    });

    // 🎯 REAL-TIME BROADCAST LISTENER: Triggers background metadata re-sync for remaining members
    socket.on("room_membership_updated", () => {
      fetchWorkspaceData();
    });

    // 🎯 REAL-TIME FLASH DISPATCH LISTENER: Instantly wipes screen data logs if Admin triggers terminal cleanup
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
          return msg;
        })
      );
    });

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
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

    return () => {
      socket.off("receive_message");
      socket.off("message_deleted");
      socket.off("room_deleted");
      socket.off("room_membership_updated");
      socket.off("system_purge_event");
      socket.off("message_status_updated");
    };
  }, [room]); // 🎯 Monitored room boundary updates

  useEffect(() => { 
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); 
  }, [chatHistory, typingUsers]); 

  const fetchDirectHistory = async (targetRoom) => {
    if (!targetRoom) return;
    try {
      const res = await fetch(`http://localhost/api/messages/${targetRoom}`, { credentials: 'include' });
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
      const res = await fetch("http://localhost/api/ai/suggest", {
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
      const res = await fetch("http://localhost/api/rooms", {
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

      const res = await fetch(`http://localhost/api/rooms/${cleanRoomName}/exit`, {
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
      
      const roomsRes = await fetch("http://localhost/api/rooms", { credentials: 'include' });
      if (roomsRes.ok) {
        const freshRooms = await roomsRes.json();
        if (Array.isArray(freshRooms)) {
          setChannels(freshRooms.filter(c => c.name !== cleanRoomName));
        }
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // 🎯 THE WHATSAPP INDEPENDENT CLEAR ACTION HOOK
  const handleClearPersonalChat = async () => {
    if (!room) return;
    if (!window.confirm(`⚠️ Clear your personal copy of chat history for room #${room}?\n\nThis will NOT delete messages for the other conversation members.`)) return;

    try {
      const cleanRoomName = room.replace('#', '').trim();

      const res = await fetch(`http://localhost/api/rooms/${cleanRoomName}/clear-personal`, {
        method: "POST",
        credentials: 'include'
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to clear personal history.");

      setChatHistory([]);
      setAiSuggestions([]);
      alert("🧹 Personal canvas cleared. Other users still retain their independent copies.");
    } catch (err) {
      alert(`Operation Failure: ${err.message}`);
    }
  };

  const handleDeleteMessage = (messageId) => {
    if (!window.confirm("Delete this message for everyone?")) return;
    setChatHistory((prev) => prev.filter((msg) => msg.id !== messageId));
    socket.emit("delete_message", { messageId, room, senderName: username });
  };

  const toggleListening = () => {
    if (!recognitionRef.current) return alert("Microphone API not supported.");
    isListening ? recognitionRef.current.stop() : recognitionRef.current.start();
  };

  const handleLogoutSubmit = async () => {
    try {
      await fetch("http://localhost/api/logout", { method: "POST", credentials: 'include' });
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

  return (
    <div className="flex h-screen w-full bg-slate-100 dark:bg-slate-950 font-sans antialiased text-slate-800 dark:text-slate-100 transition-colors duration-300">
      
      {/* SIDEBAR PANEL */}
      <aside className="w-66 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 flex flex-col justify-between border-r border-slate-200 dark:border-slate-800 hidden md:flex transition-colors duration-300">
        <div className="overflow-y-auto flex-1">
          <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-md font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="bg-indigo-600 text-white px-2 py-0.5 rounded-lg text-xs font-black">💬</span> ChatApp
            </h2>
          </div>
          
          <div className="p-4 space-y-6">
            <button 
              onClick={() => setIsModalOpen(true)} 
              className="w-full py-2.5 px-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 text-indigo-600 dark:text-indigo-400 font-bold text-xs hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 transition-all flex items-center justify-center gap-2 shadow-2xs"
            >
              <span>➕</span> Create New Group
            </button>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2 mb-2">📁 My Group Channels</p>
              <nav className="space-y-1">
                {channels.map((ch) => (
                  <button key={ch.id || ch.name} onClick={() => handleSelectGroupChannel(ch.name)} className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${(!isPrivateDM && room === ch.name) ? "bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-white font-bold" : "hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-400"}`}>
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
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold uppercase">{username.charAt(0)}</div>
            <div>
              <p className="text-xs font-bold text-slate-800 dark:text-white leading-tight truncate max-w-[100px]">{username} (You)</p>
              <button onClick={handleLogoutSubmit} className="text-[10px] text-red-500 font-bold hover:underline block text-left">Log Out</button>
            </div>
          </div>
          <span className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse"></span>
        </div>
      </aside>

      {/* CORE CHAT ENGINE HUBS */}
      <div className="flex flex-col flex-1 h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-xs relative overflow-hidden">
        <header className="flex items-center justify-between px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <h1 className="text-md font-bold text-slate-900 dark:text-white tracking-wide">
              {room ? activeChatLabel : "👋 Welcome to ChatApp"}
            </h1>
            
            {/* UTILITY CONTROL ROW FOR ACTIVE CHANNELS */}
            {room && (
              <div className="flex items-center gap-2 ml-2">
                {/* 🧹 DISCRETE CLEAR BUTTON TRIGGERING INDEPENDENT DATA BOUNDARIES */}
                <button 
                  onClick={handleClearPersonalChat} 
                  className="text-xs bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold px-2.5 py-1 rounded-md transition-all border border-slate-200 dark:border-slate-700 shadow-3xs"
                  title="Clear history view for myself only"
                >
                  🧹 Clear Chat
                </button>

                {!isPrivateDM && room !== 'general' && (
                  <button onClick={handleExitGroup} className="text-xs bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 font-bold px-2.5 py-1 rounded-md transition-all border border-red-100 dark:border-red-900/30">
                    🚪 Leave Group
                  </button>
                )}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {room && (
              <>
                <button 
                  onClick={() => setIsSearchOpen(!isSearchOpen)} 
                  className={`px-3 py-2 rounded-xl border transition-all text-xs font-bold flex items-center gap-1.5 shadow-2xs ${isSearchOpen ? "bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700" : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"}`}
                >
                  <span>🔍</span> Search History
                </button>

                {/* 👥 GROUP MEMBER SIDE PANEL DRAWER TOGGLE TRIGGER */}
                {!isPrivateDM && (
                  <button 
                    onClick={() => setIsMembersOpen(!isMembersOpen)} 
                    className={`px-3 py-2 rounded-xl border transition-all text-xs font-bold flex items-center gap-1.5 shadow-2xs ${isMembersOpen ? "bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700" : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"}`}
                  >
                    <span>👥</span> Members ({currentChannelObj && currentChannelObj.members ? currentChannelObj.members.length : 0})
                  </button>
                )}
              </>
            )}
            <button onClick={() => setDarkMode(!darkMode)} className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all text-sm">
              {darkMode ? '☀️ Light' : '🌙 Dark'}
            </button>
          </div>
        </header>

        {!room ? (
          <main className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3 bg-slate-50/50 dark:bg-slate-950/40">
            <div className="h-16 w-16 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center text-3xl shadow-sm animate-bounce">💬</div>
            <h2 className="text-xl font-extrabold text-slate-800 dark:text-white">Hello, {username}!</h2>
            <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
              Select a room from **My Group Channels** or choose a colleague under **Direct Messages** to start an encrypted real-time chat session.
            </p>
          </main>
        ) : (
          <div className="flex flex-1 overflow-hidden w-full relative">
            
            {/* CORE CHAT SCREEN VIEWPORT CONTAINER COLUMN */}
            <div className="flex flex-col flex-1 h-full relative overflow-hidden">
              <main className="flex-1 overflow-y-auto p-6 bg-slate-50/50 dark:bg-slate-950/40 space-y-4">
                {chatHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-600">
                    <p className="text-sm font-semibold">Secure conversation framework active.</p>
                    <p className="text-[11px] text-slate-400">Say hello to initialize real-time data sync channels.</p>
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
                            <button onClick={() => handleDeleteMessage(msg.id)} className="opacity-0 group-hover/msg:opacity-100 text-slate-400 hover:text-red-500 text-xs transition-all duration-150 pl-1" title="Delete Message for Everyone">
                              🗑️
                            </button>
                          )}
                        </div>
                        <div className="flex items-end gap-1.5">
                          <div className={`max-w-md px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-xs ${isMe ? "bg-indigo-600 text-white rounded-tr-none" : "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700/60 rounded-tl-none"}`}>
                            {msg.text}
                          </div>
                          {isMe && (
                            <span 
                              className={`text-[11px] font-black tracking-tighter select-none transition-colors duration-200 ${
                                isSeenByEveryone 
                                  ? "text-sky-500" 
                                  : isSeenBySomeone 
                                    ? "text-slate-400 dark:text-slate-500" 
                                    : "text-slate-200 dark:text-slate-700"
                              }`}
                              title={isPrivateDM ? (isSeenByEveryone ? "Read" : "Delivered") : `Read by ${uniqueReadersCount} of ${expectedRecipientsCount} recipients`}
                            >
                              {isSeenBySomeone ? "✓✓" : "✓"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}

                {typingUsers.length > 0 && (
                  <div className="flex flex-col items-start space-y-1 animate-in fade-in duration-200 mt-2 sticky bottom-0 bg-gradient-to-t from-slate-50/90 to-transparent py-1 dark:from-slate-950/90 z-10">
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

              <footer className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between gap-2 px-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Reply Mood:</span>
                    <select 
                      value={chosenMood} 
                      onChange={(e) => setChosenMood(e.target.value)}
                      className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 font-semibold outline-none text-slate-700 dark:text-slate-300 focus:ring-1 focus:ring-indigo-500"
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
                    className="text-[11px] font-black tracking-wide text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100/70 border border-indigo-100 dark:border-indigo-900/50 px-2.5 py-1 rounded-md transition-all disabled:opacity-50"
                  >
                    {isAiLoading ? "✨ Thinking..." : "✨ Suggest Replies"}
                  </button>
                </div>

                {aiSuggestions.length > 0 && (
                  <div className="flex flex-wrap gap-2 pb-1 animate-in fade-in slide-in-from-bottom-2 duration-150">
                    {aiSuggestions.map((suggestion, idx) => (
                      <button 
                        key={idx}
                        onClick={() => setMessage(suggestion)}
                        className="text-xs font-medium bg-slate-50 hover:bg-indigo-600 dark:bg-slate-800 dark:hover:bg-indigo-600 text-slate-600 dark:text-slate-200 hover:text-white dark:hover:text-white border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-full text-left max-w-full truncate transition-all duration-100 active:scale-95"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/80 rounded-xl p-2 border border-slate-200/60 dark:border-slate-700 focus-within:ring-4 focus-within:ring-indigo-100 dark:focus-within:ring-indigo-950/40">
                  <input 
                    type="text" 
                    placeholder={`Type message here...`} 
                    value={message} 
                    onChange={handleInputChange} 
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()} 
                    className="flex-1 bg-transparent px-3 py-1.5 text-sm outline-none text-slate-800 dark:text-slate-100" 
                  />
                  <button onClick={toggleListening} className={`px-4 py-2 rounded-lg text-xs font-bold ${isListening ? "bg-red-500 text-white animate-pulse" : "bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300"}`}>{isListening ? '🛑 Stop' : '🎙️ Speak'}</button>
                  <button onClick={sendMessage} className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-xs font-bold">Send</button>
                </div>
              </footer>
            </div>

            {/* 👥 INDEPENDENT SIDEBAR DRAWER PANEL DISCOVERING MEMBERS OF THE CHAT ROOM CHANNEL */}
            {isMembersOpen && !isPrivateDM && currentChannelObj && (
              <aside className="w-60 h-full bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col animate-in slide-in-from-right duration-200 z-20">
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
                      <div 
                        key={memberLink.id} 
                        className="flex items-center justify-between px-2.5 py-2 rounded-xl bg-white dark:bg-slate-800/50 border border-slate-200/40 dark:border-slate-700/40 shadow-3xs"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className={`h-2 w-2 rounded-full flex-shrink-0 ${isMemberOnline ? "bg-emerald-500 animate-pulse" : "bg-slate-300 dark:bg-slate-600"}`}></span>
                          <span className="text-xs font-semibold truncate text-slate-700 dark:text-slate-200">
                            {userDetail.username} {isSelf && <span className="text-[10px] text-slate-400 font-normal">(You)</span>}
                          </span>
                        </div>
                        {isMemberOnline && (
                          <span className="text-[8px] bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 font-black px-1.5 py-0.5 rounded-sm tracking-wide">ONLINE</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </aside>
            )}

          </div>
        )}
      </div>

      <SearchDrawer 
        isOpen={isSearchOpen} 
        onClose={() => setIsSearchOpen(false)} 
        roomName={room} 
      />

      <CreateGroupModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        allUsers={allUsers} 
        currentUsername={username} 
        onCreateGroup={handleCreateGroupSubmit} 
      />
    </div>
  );
}

export default Dashboard;