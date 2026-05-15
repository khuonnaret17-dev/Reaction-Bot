"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Play, 
  Square, 
  Terminal, 
  Settings as SettingsIcon, 
  Github, 
  Cpu, 
  Zap, 
  Trash2, 
  Copy, 
  Check, 
  Info,
  Activity,
  Bot
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface LogEntry {
  id: string;
  timestamp: string;
  content: string;
  type: 'INFO' | 'SUCCESS' | 'ERROR' | 'EVENT';
  color?: string;
}

export default function TelegramBotDashboard() {
  const [tokens, setTokens] = useState("");
  const tokensRef = useRef<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const isRunningRef = useRef(false);
  const [lastUpdateId, setLastUpdateId] = useState(0);
  const lastUpdateIdRef = useRef(0);
  const [selectedEmojis, setSelectedEmojis] = useState<string[]>(['❤️']);
  const selectedEmojisRef = useRef<string[]>(['❤️']);
  const [targetCount, setTargetCount] = useState(1);
  const targetCountRef = useRef(1);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'console' | 'settings' | 'help'>('console');
  const [activeTokenCount, setActiveTokenCount] = useState(0);

  // Persistence Layer: Load
  useEffect(() => {
    const savedTokens = localStorage.getItem('bot_tokens');
    const savedEmojis = localStorage.getItem('bot_emojis');
    const savedCount = localStorage.getItem('bot_target_count');

    if (savedTokens) setTokens(savedTokens);
    if (savedEmojis) {
      const parsed = JSON.parse(savedEmojis);
      setSelectedEmojis(parsed);
      selectedEmojisRef.current = parsed;
    }
    if (savedCount) {
      const val = parseInt(savedCount);
      setTargetCount(val);
      targetCountRef.current = val;
    }
    
    addLog("ប្រព័ន្ធរួចរាល់៖ ទិន្នន័យត្រូវបានទាញយកពី LocalStorage", "INFO", "text-slate-500");
  }, []);

  // Persistence Layer: Save
  useEffect(() => {
    localStorage.setItem('bot_tokens', tokens);
  }, [tokens]);

  useEffect(() => {
    localStorage.setItem('bot_emojis', JSON.stringify(selectedEmojis));
  }, [selectedEmojis]);

  useEffect(() => {
    localStorage.setItem('bot_target_count', targetCount.toString());
  }, [targetCount]);

  const addLog = (content: string, type: LogEntry['type'] = 'INFO', color?: string) => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substring(7),
      timestamp: new Date().toLocaleTimeString([], { hour12: false }),
      content,
      type,
      color
    };
    setLogs(prev => [...prev.slice(-99), newLog]);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const startBot = async () => {
    const list = tokens.split('\n').map(t => t.trim()).filter(t => t.length > 10);
    if (list.length === 0) {
      addLog("កំហុស៖ សូមបញ្ចូល Bot Token យ៉ាងហោចណាស់មួយ", "ERROR", "text-rose-500");
      return;
    }
    
    tokensRef.current = list;
    setActiveTokenCount(list.length);
    const primaryToken = list[0];
    
    setIsRunning(true);
    isRunningRef.current = true;
    addLog(`កំពុងចាប់ផ្ដើមជាមួយ Bot ចំនួន ${list.length}...`, "INFO", "text-sky-400");
    
    try {
      const resp = await fetch(`/api/telegram?token=${primaryToken}&method=getMe`);
      const data = await resp.json();
      if (data.ok) {
        addLog(`មេបញ្ជាការ @${data.result.username} (ID: ${data.result.id}) បានភ្ជាប់`, "SUCCESS", "text-emerald-400");
        addLog(`គ្រាប់រ៉ុក្កែតចំនួន ${list.length} គ្រាប់រួចរាល់សម្រាប់បាញ់ Reaction (${selectedEmojisRef.current.join(', ')})`, "INFO", "text-amber-500");
        pollUpdatesLoop();
      } else {
        throw new Error(data.description);
      }
    } catch (err: any) {
      addLog(`បរាជ័យក្នុងការភ្ជាប់៖ ${err.message}`, "ERROR", "text-rose-500");
      setIsRunning(false);
      isRunningRef.current = false;
    }
  };

  const stopBot = () => {
    setIsRunning(false);
    isRunningRef.current = false;
    if (pollingRef.current) clearTimeout(pollingRef.current);
    addLog("Bot ត្រូវបានបញ្ឈប់", "INFO", "text-slate-500");
  };

  const pollUpdatesLoop = async () => {
    if (!isRunningRef.current || tokensRef.current.length === 0) return;

    const primaryToken = tokensRef.current[0];

    try {
      const offset = lastUpdateIdRef.current > 0 ? `&offset=${lastUpdateIdRef.current + 1}` : '';
      const resp = await fetch(`/api/telegram?token=${primaryToken}&method=getUpdates&timeout=15${offset}`);
      const data = await resp.json();
      
      if (data.ok && data.result.length > 0) {
        let maxId = lastUpdateIdRef.current;
        for (const update of data.result) {
          maxId = Math.max(maxId, update.update_id);
          
          const msg = update.channel_post || update.edited_channel_post || update.message || update.edited_message;
          
          if (msg) {
            const isEdit = !!(update.edited_channel_post || update.edited_message);
            const chatTitle = msg.chat.title || 'Private Chat';
            addLog(`${isEdit ? 'កែសម្រួល' : 'សារថ្មី'} ចេញពី "${chatTitle}": ${msg.text?.substring(0, 30) || 'Media'}`, "EVENT", "text-amber-400");
            
            // Execute reactions with limited number of bots based on target count
            const botsToUse = tokensRef.current.slice(0, targetCountRef.current);
            
            for (const [index, token] of botsToUse.entries()) {
              try {
                const reactResp = await fetch(`/api/telegram`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    token: token,
                    method: 'setMessageReaction',
                    body: {
                      chat_id: msg.chat.id,
                      message_id: msg.message_id,
                      reaction: selectedEmojisRef.current.map(emoji => ({ type: 'emoji', emoji }))
                    }
                  })
                });
                const reactData = await reactResp.json();
                if (reactData.ok) {
                  addLog(`✓ Bot #${index + 1} បានបាញ់ {${selectedEmojisRef.current.join(',')}} លើសារ ${msg.message_id}`, "SUCCESS", "text-emerald-500/80");
                } else {
                  addLog(`! Bot #${index + 1} បរាជ័យ៖ ${reactData.description}`, "ERROR", "text-rose-400/80");
                }
              } catch (e) {
                console.error(`Error reacting with token ${index}:`, e);
              }
              
              if (botsToUse.length > 5) {
                await new Promise(r => setTimeout(r, 60)); // Throttling
              }
            }
            addLog(`🌩️ បាញ់រួចរាល់ចំនួន ${botsToUse.length} Reaction`, "SUCCESS", "text-sky-400 font-bold");
          }
        }
        lastUpdateIdRef.current = maxId;
        setLastUpdateId(maxId);
      }
    } catch (err) {
      addLog("កំហុសបច្ចេកទេស៖ មិនអាចទាក់ទង Proxy", "ERROR", "text-rose-600");
    }

    if (isRunningRef.current) {
      pollingRef.current = setTimeout(pollUpdatesLoop, 1000);
    }
  };

  const copyLog = () => {
    const text = logs.map(l => `[${l.timestamp}] ${l.content}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const clearLogs = () => {
    setLogs([]);
    addLog("Console Cleared", "INFO", "text-slate-500");
  };

  return (
    <div className="flex h-screen bg-slate-950 font-sans selection:bg-sky-500/30">
      {/* Sidebar Navigation */}
      <nav className="w-16 border-r border-slate-800 flex flex-col items-center py-6 gap-6 bg-slate-900/50">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20 mb-4">
          <Zap size={20} className="fill-current" />
        </div>
        
        <button onClick={() => setActiveTab('console')} className={`p-3 rounded-xl transition-all ${activeTab === 'console' ? 'bg-sky-500/10 text-sky-400 shadow-[inset_0_0_12px_rgba(56,189,248,0.1)]' : 'text-slate-500 hover:text-slate-300'}`}>
          <Terminal size={20} />
        </button>
        <button onClick={() => setActiveTab('settings')} className={`p-3 rounded-xl transition-all ${activeTab === 'settings' ? 'bg-sky-500/10 text-sky-400 shadow-[inset_0_0_12px_rgba(56,189,248,0.1)]' : 'text-slate-500 hover:text-slate-300'}`}>
          <SettingsIcon size={20} />
        </button>
        <button onClick={() => setActiveTab('help')} className={`p-3 rounded-xl transition-all ${activeTab === 'help' ? 'bg-sky-500/10 text-sky-400 shadow-[inset_0_0_12px_rgba(56,189,248,0.1)]' : 'text-slate-500 hover:text-slate-300'}`}>
          <Info size={20} />
        </button>
        
        <div className="mt-auto">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
        </div>
      </nav>

      <main className="flex-1 flex overflow-hidden">
        {/* Left Control Panel */}
        <div className="w-80 border-r border-slate-800 bg-slate-900/20 flex flex-col shrink-0 overflow-y-auto scrollbar-hide">
          <div className="p-6 space-y-8">
            <div>
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2 mb-1">
                Bot Commander
              </h2>
              <p className="text-xs text-slate-500 font-medium">Multi-Reaction Automation</p>
            </div>

            <section className="space-y-4">
              <label className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold block mb-2 underline underline-offset-8 decoration-sky-500/30">ការបញ្ជា (Control)</label>
              
              <div className="grid grid-cols-1 gap-3">
                {!isRunning ? (
                  <button 
                    onClick={startBot}
                    className="w-full h-12 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-sky-500/20 active:scale-[0.98]"
                  >
                    <Play size={18} fill="currentColor" /> ចាប់ផ្ដើម
                  </button>
                ) : (
                  <button 
                    onClick={stopBot}
                    className="w-full h-12 bg-rose-500 hover:bg-rose-400 text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-rose-500/20 active:scale-[0.98]"
                  >
                    <Square size={18} fill="currentColor" /> បញ្ឈប់
                  </button>
                )}
              </div>
            </section>

            <section className="space-y-4">
              <label className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold block mb-2 underline underline-offset-8 decoration-sky-500/30">ចំនួន Reaction</label>
              <div className="space-y-3">
                <div className="flex justify-between items-center px-1">
                  <span className="text-[11px] text-slate-400">ចំនួនគោលដៅ:</span>
                  <span className="text-[11px] font-mono text-sky-400 font-bold">{targetCount} Reactions</span>
                </div>
                <input 
                  type="range" 
                  min="1" 
                  max="100" 
                  value={targetCount}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setTargetCount(val);
                    targetCountRef.current = val;
                  }}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
                />
                <div className="flex justify-between text-[8px] text-slate-600 font-bold uppercase">
                  <span>1</span>
                  <span>50</span>
                  <span>100</span>
                </div>
                {targetCount > tokens.split('\n').filter(t => t.trim().length > 10).length && tokens.length > 0 && (
                   <p className="text-[9px] text-amber-500 italic flex items-center gap-1">
                     <Info size={10} /> កំពុងប្រើ Bot ទាំងអស់ក្នុងបញ្ជី ({tokens.split('\n').filter(t => t.trim().length > 10).length})
                   </p>
                )}
              </div>
            </section>

            <section className="space-y-4">
              <label className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold block mb-2 underline underline-offset-8 decoration-sky-500/30">Emoji សកម្ម (ជ្រើសរើសបានច្រើន)</label>
              <div className="grid grid-cols-4 gap-2">
                {['❤️', '👍', '🔥', '🎉', '🤩', '⚡', '👏', '🤝', '💯', '🤣', '👀', '🕊️'].map(emoji => {
                  const isSelected = selectedEmojis.includes(emoji);
                  return (
                    <button
                      key={emoji}
                      onClick={() => {
                        let newList;
                        if (isSelected) {
                          newList = selectedEmojis.filter(e => e !== emoji);
                          if (newList.length === 0) return; // Must have at least one
                        } else {
                          newList = [...selectedEmojis, emoji].slice(-3); // Limit to 3 (Telegram Premium limit)
                        }
                        setSelectedEmojis(newList);
                        selectedEmojisRef.current = newList;
                        addLog(`បញ្ជី Reaction: {${newList.join(', ')}}`, "INFO", "text-sky-300");
                      }}
                      className={`aspect-square rounded-lg flex items-center justify-center text-xl transition-all border ${
                        isSelected 
                        ? 'bg-sky-500/10 border-sky-400 text-white shadow-[0_0_15px_rgba(56,189,248,0.1)]' 
                        : 'bg-slate-800/30 border-slate-700 text-slate-400 hover:bg-slate-800 hover:border-slate-500'
                      }`}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
              <p className="text-[9px] text-slate-500 italic mt-2">
                * ជ្រើសរើសបានដល់ទៅ ៣ (Telegram limit)
              </p>
            </section>

            <section className="space-y-4">
              <label className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold block mb-2 underline underline-offset-8 decoration-sky-500/30">ស្ថិតិ (Stats)</label>
              <div className="space-y-2">
                <div className="bg-slate-900/50 border border-slate-800 p-3 rounded-lg flex justify-between items-center">
                  <span className="text-[10px] text-slate-500 font-bold">Bot សកម្ម</span>
                  <span className="text-xs font-mono text-emerald-400">{isRunning ? activeTokenCount : 0} Bots</span>
                </div>
                <div className="bg-slate-900/50 border border-slate-800 p-3 rounded-lg flex justify-between items-center">
                  <span className="text-[10px] text-slate-500 font-bold">Latency</span>
                  <span className="text-xs font-mono text-sky-400">⚡ Fast</span>
                </div>
              </div>
            </section>
          </div>
          
          <div className="mt-auto p-6 border-t border-slate-800 bg-slate-900/30">
            <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono">
              <Github size={12} />
              <span>v1.2.0 Stable Build</span>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col bg-slate-950">
          {/* Header */}
          <header className="h-16 border-b border-slate-800 flex items-center justify-between px-8 bg-slate-900/10 backdrop-blur-sm z-10">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
                <span className="text-xs font-bold text-slate-400 tracking-widest uppercase">
                  {isRunning ? 'System Online' : 'System Standby'}
                </span>
              </div>
              <div className="h-4 w-[1px] bg-slate-800" />
              <div className="flex items-center gap-2 text-sky-400">
                <Cpu size={14} />
                <span className="text-xs font-mono tracking-tighter">Power: Max Output</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button 
                onClick={copyLog}
                className="p-2 text-slate-500 hover:text-sky-400 transition-colors"
                title="Copy Logs"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
              <button 
                onClick={clearLogs}
                className="p-2 text-slate-500 hover:text-rose-400 transition-colors"
                title="Clear Logs"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </header>

          {/* Dynamic Content */}
          <div className="flex-1 relative overflow-hidden">
            {activeTab === 'console' && (
              <div ref={scrollRef} className="absolute inset-0 overflow-y-auto p-8 font-mono scrollbar-thin scrollbar-thumb-slate-800 scroll-smooth">
                <AnimatePresence initial={false}>
                  {logs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-700 pointer-events-none">
                      <Terminal size={48} strokeWidth={1} className="mb-4 opacity-20" />
                      <p className="text-xs font-bold uppercase tracking-widest opacity-20">Waiting for data stream...</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {logs.map((log) => (
                        <motion.div 
                          key={log.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex gap-4 group"
                        >
                          <span className="text-[10px] text-slate-600 font-bold shrink-0 pt-0.5">{log.timestamp}</span>
                          <div className="flex flex-col gap-1">
                            <span className={`text-[11px] leading-relaxed break-all ${log.color || 'text-slate-300'}`}>
                              <span className="mr-2 opacity-50">[{log.type}]</span>
                              {log.content}
                            </span>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {activeTab === 'settings' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute inset-0 p-8 space-y-8 max-w-2xl mx-auto"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                        <Bot size={20} className="text-sky-400" /> Multi-Bot Payload
                      </h3>
                      <p className="text-xs text-slate-500">បញ្ចូល Telegram Bot Tokens របស់អ្នកនៅទីនេះ (មួយបន្ទាត់សម្រាប់មួយ Token)</p>
                    </div>
                    <div className="bg-sky-500/10 border border-sky-500/20 px-3 py-1 rounded-full">
                      <span className="text-[10px] font-bold text-sky-400 uppercase tracking-tighter">
                        Total: {tokens.split('\n').filter(t => t.trim().length > 10).length}
                      </span>
                    </div>
                  </div>
                  
                  <textarea 
                    value={tokens}
                    onChange={(e) => setTokens(e.target.value)}
                    placeholder="734123456:AAE-Your-Token-Here-..."
                    className="w-full h-80 bg-slate-900 border border-slate-800 rounded-xl p-5 text-sm font-mono text-sky-400 focus:border-sky-500/50 focus:outline-none focus:ring-1 focus:ring-sky-500/20 shadow-inner resize-none scrollbar-thin scrollbar-thumb-slate-800 transition-all placeholder:text-slate-700"
                  />
                  
                  <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl flex items-start gap-4">
                    <div className="bg-amber-500/10 p-2 rounded-lg text-amber-400">
                      <Info size={16} />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">សំគាល់សំរាប់អ្នកប្រើប្រាស់</h4>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Token ទីមួយនឹងត្រូវប្រើជា &apos;Master Bot&apos; សម្រាប់តាមដាន Update។ Bot ផ្សេងទៀតនឹងដើរតួជាគ្រាប់រ៉ុក្កែតដើម្បីបាញ់ Reaction។
                        សូមប្រាកដថា Bot ទាំងអស់ត្រូវបានដាក់ជា Admin ក្នុង Channel។
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'help' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute inset-0 p-8 space-y-8 max-w-2xl mx-auto overflow-y-auto"
              >
                <div className="space-y-6">
                   <h3 className="text-2xl font-bold text-slate-100 italic tracking-tighter underline decoration-sky-500 decoration-4 underline-offset-8">សេចក្ដីណែនាំបច្ចេកទេស (Technical Docs)</h3>
                   
                   <div className="space-y-8 text-slate-400">
                     <section>
                       <h4 className="text-sky-400 font-bold mb-3 flex items-center gap-2">
                         <Zap size={14} /> របៀបដំឡើង (Quick Start)
                       </h4>
                       <ol className="list-decimal list-inside space-y-3 text-sm leading-relaxed ml-2 marker:text-sky-500 marker:font-bold">
                         <li>បង្កើត Bot តាមរយៈ <span className="text-emerald-400">@BotFather</span></li>
                         <li>យក Token មកបិទភ្ជាប់ក្នុង <span className="text-sky-400 uppercase font-bold text-[10px]">Settings</span></li>
                         <li>ដាក់ Bot របស់អ្នកចូលក្នុង Channel ដែលអ្នកចង់ឱ្យវាចុច ❤️</li>
                         <li>តំឡើង Bot ឱ្យទៅជា <span className="text-rose-400">Admin</span> និងបើកសិទ្ធិ &quot;Edit Messages&quot;</li>
                         <li>ចុចប៊ូតុង <span className="text-sky-400 italic">ចាប់ផ្ដើម</span> លើ Dashboard</li>
                       </ol>
                     </section>

                     <section>
                       <h4 className="text-sky-400 font-bold mb-3 flex items-center gap-2">
                         <Activity size={14} /> ហេតុអ្វីមិនដើរ? (Troubleshooting)
                       </h4>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                            <span className="text-[10px] font-bold text-rose-500 block mb-2 uppercase">បញ្ហា Reaction</span>
                            <p className="text-xs text-slate-500">Channel អាចនឹងបិទការប្រើ Reaction។ សូមចូលទៅ Channel Settings {'>'} Reactions ឱ្យប្រើ Emoji ដែលអ្នកចង់។</p>
                         </div>
                         <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                            <span className="text-[10px] font-bold text-amber-500 block mb-2 uppercase">បញ្ហា Permissions</span>
                            <p className="text-xs text-slate-500">Bot ត្រូវតែជា Admin និងមានសិទ្ធិកែសម្រួលសារ ដើម្បីអាចដាក់ Reaction បានលើ Channel Post។</p>
                         </div>
                       </div>
                     </section>
                   </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* Activity Bar */}
          <footer className="h-10 border-t border-slate-800 flex items-center justify-between px-8 bg-slate-900/5 text-[10px] font-bold tracking-widest text-slate-600 uppercase">
             <div className="flex items-center gap-6">
                <span className="flex items-center gap-2">
                   <div className="w-1 h-1 rounded-full bg-sky-500 shadow-[0_0_8px_#38bdf8]" /> CPU-001: OK
                </span>
                <span className="flex items-center gap-2">
                   <div className="w-1 h-1 rounded-full bg-sky-500 shadow-[0_0_8px_#38bdf8]" /> MEM-042: STABLE
                </span>
             </div>
             <div className="flex items-center gap-2">
                Active System: <span className="text-sky-500 font-mono">NEURAL_LINK_V4</span>
             </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
