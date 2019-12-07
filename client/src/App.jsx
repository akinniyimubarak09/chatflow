import React, { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  Archive, ArrowLeft, Check, CheckCheck, ChevronDown, Edit3, FileText, Image as ImageIcon,
  LogOut, Menu, MessageCircle, MoreVertical, Paperclip, Phone, Plus, Search, Send, Settings,
  Smile, Trash2, UserPlus, Users, Video, X, Moon, Sun
} from "lucide-react";
import { api, API } from "./api";

const socket = io(API, { autoConnect: false });

function Avatar({ user, size = "md" }) {
  const initials = (user?.username || "?").slice(0, 2).toUpperCase();
  return user?.avatar ? <img className={`avatar ${size}`} src={user.avatar} alt="" /> :
    <div className={`avatar ${size} avatar-fallback`}>{initials}</div>;
}

function Auth({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const submit = async e => {
    e.preventDefault(); setError("");
    try {
      const data = mode === "login"
        ? await api.login({ email: form.email, password: form.password })
        : await api.register(form);
      localStorage.setItem("chatflow_token", data.token);
      onAuth(data.user);
    } catch (err) { setError(err.message); }
  };
  return <div className="auth-page">
    <div className="auth-glow glow-one"/><div className="auth-glow glow-two"/>
    <div className="auth-card">
      <div className="brand-mark"><MessageCircle size={26}/></div>
      <h1>ChatFlow</h1>
      <p className="muted">Private conversations. Real-time connection.</p>
      <form onSubmit={submit}>
        {mode === "register" && <input placeholder="Username" value={form.username} onChange={e=>setForm({...form,username:e.target.value})} />}
        <input type="email" placeholder="Email address" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} />
        <input type="password" placeholder="Password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} />
        {error && <div className="error">{error}</div>}
        <button className="primary full">{mode === "login" ? "Sign in" : "Create account"}</button>
      </form>
      <button className="link-button" onClick={()=>setMode(mode==="login"?"register":"login")}>
        {mode === "login" ? "New to ChatFlow? Create an account" : "Already have an account? Sign in"}
      </button>
    </div>
  </div>;
}

function Sidebar({ user, conversations, selected, onSelect, onNew, onProfile, dark, setDark }) {
  const [query, setQuery] = useState("");
  const filtered = conversations.filter(c => c.user?.username.toLowerCase().includes(query.toLowerCase()));
  return <aside className="sidebar">
    <div className="side-top">
      <div className="profile-mini" onClick={onProfile}><Avatar user={user}/><div><strong>{user.username}</strong><span>My profile</span></div></div>
      <div className="icon-row">
        <button title="Theme" onClick={()=>setDark(!dark)}>{dark ? <Sun/>:<Moon/>}</button>
        <button title="New chat" onClick={onNew}><Plus/></button>
        <button title="Settings" onClick={onProfile}><Settings/></button>
      </div>
    </div>
    <div className="searchbox"><Search size={18}/><input placeholder="Search chats" value={query} onChange={e=>setQuery(e.target.value)}/></div>
    <div className="sidebar-tabs"><button className="active">All</button><button>Unread</button><button>Groups</button></div>
    <div className="conversation-list">
      {filtered.length === 0 ? <div className="empty-list"><MessageCircle size={30}/><p>No conversations yet.</p><button className="secondary" onClick={onNew}>Start a chat</button></div> :
      filtered.map(c => <button key={c.id} className={`conversation ${selected?.id===c.id?"selected":""}`} onClick={()=>onSelect(c)}>
        <Avatar user={c.user}/>
        <div className="conversation-main"><div className="conversation-line"><strong>{c.user?.username}</strong><span>{c.lastMessage ? formatTime(c.lastMessage.createdAt):""}</span></div>
        <div className="conversation-line"><span className="preview">{c.lastMessage?.text || "Start a conversation"}</span>{c.unread>0&&<b className="badge">{c.unread}</b>}</div></div>
      </button>)}
    </div>
  </aside>;
}

function NewChat({ onClose, onStart }) {
  const [q,setQ]=useState(""); const [users,setUsers]=useState([]);
  useEffect(()=>{ const t=setTimeout(()=>api.users(q).then(x=>setUsers(x.users)).catch(()=>{}),250); return()=>clearTimeout(t)},[q]);
  return <div className="modal-backdrop"><div className="modal">
    <div className="modal-head"><h2>New conversation</h2><button onClick={onClose}><X/></button></div>
    <div className="searchbox"><Search size={18}/><input autoFocus placeholder="Search people" value={q} onChange={e=>setQ(e.target.value)}/></div>
    <div className="user-results">{users.map(u=><button className="user-result" key={u.id} onClick={()=>onStart(u)}><Avatar user={u}/><div><strong>{u.username}</strong><span>{u.email}</span></div><ChevronDown className="rotate-minus-90"/></button>)}</div>
  </div></div>;
}

function Profile({ user, onClose, onSave, onLogout }) {
  const [name,setName]=useState(user.username); const [bio,setBio]=useState(user.bio||"");
  return <div className="modal-backdrop"><div className="modal profile-modal">
    <div className="modal-head"><h2>Profile</h2><button onClick={onClose}><X/></button></div>
    <div className="profile-large"><Avatar user={{...user,username:name}} size="xl"/></div>
    <label>Username<input value={name} onChange={e=>setName(e.target.value)}/></label>
    <label>Bio<textarea value={bio} onChange={e=>setBio(e.target.value)} maxLength={160}/></label>
    <button className="primary full" onClick={()=>onSave({username:name,bio})}>Save changes</button>
    <button className="danger-outline full" onClick={onLogout}><LogOut size={17}/> Sign out</button>
  </div></div>;
}

function Chat({ user, conversation, onBack }) {
  const [messages,setMessages]=useState([]);
  const [text,setText]=useState("");
  const [typing,setTyping]=useState(false);
  const [reply,setReply]=useState(null);
  const [menu,setMenu]=useState(null);
  const bottomRef=useRef();
  const typingTimer=useRef();

  const scroll=()=>setTimeout(()=>bottomRef.current?.scrollIntoView({behavior:"smooth"}),40);
  useEffect(()=>{
    if(!conversation) return;
    api.messages(conversation.id).then(x=>{setMessages(x.messages);scroll()});
    socket.emit("conversation:join",conversation.id);
    const onNew=m=>{if(m.conversationId===conversation.id){setMessages(prev=>prev.some(x=>x.id===m.id)?prev:[...prev,m]);scroll(); if(m.senderId!==user.id) socket.emit("message:read",{conversationId:conversation.id,messageId:m.id})}};
    const onUpdate=m=>setMessages(prev=>prev.map(x=>x.id===m.id?m:x));
    const onDelete=({id})=>setMessages(prev=>prev.filter(x=>x.id!==id));
    const onTyping=x=>{if(x.userId!==user.id){setTyping(x.isTyping);}};
    socket.on("message:new",onNew); socket.on("message:updated",onUpdate); socket.on("message:deleted",onDelete); socket.on("typing",onTyping);
    return()=>{socket.off("message:new",onNew);socket.off("message:updated",onUpdate);socket.off("message:deleted",onDelete);socket.off("typing",onTyping)};
  },[conversation?.id]);

  const send=async()=>{
    if(!text.trim())return;
    const current=text; setText(""); setReply(null); socket.emit("typing",{conversationId:conversation.id,isTyping:false});
    try{await api.sendMessage(conversation.id,{text:current,replyTo:reply?.id||null})}catch(e){alert(e.message);setText(current)}
  };
  const changeText=e=>{
    setText(e.target.value); socket.emit("typing",{conversationId:conversation.id,isTyping:true});
    clearTimeout(typingTimer.current); typingTimer.current=setTimeout(()=>socket.emit("typing",{conversationId:conversation.id,isTyping:false}),900);
  };
  const edit=async m=>{const next=prompt("Edit message",m.text); if(next!==null&&next.trim())await api.editMessage(m.id,next)};
  const del=async m=>{if(confirm("Delete this message?"))await api.deleteMessage(m.id)};
  return <main className="chat">
    <header className="chat-head">
      <button className="mobile-only back" onClick={onBack}><ArrowLeft/></button><Avatar user={conversation.user}/>
      <div className="chat-title"><strong>{conversation.user?.username}</strong><span>{typing?"typing…":conversation.user?.online?"online":"offline"}</span></div>
      <div className="chat-actions"><button><Phone/></button><button><Video/></button><button><MoreVertical/></button></div>
    </header>
    <section className="messages">
      <div className="encryption-note">🔒 Messages are protected in this demo and stored locally on the server.</div>
      {messages.map((m,i)=><div key={m.id} className={`message-row ${m.senderId===user.id?"mine":"theirs"}`}>
        <div className="message-wrap">
          {m.replyTo && <div className="reply-preview">Replying to a message</div>}
          <div className="message-bubble" onContextMenu={e=>{e.preventDefault();setMenu(m.id)}}>
            {m.attachment && <div className="attachment"><ImageIcon size={16}/> Attachment</div>}
            {m.text && <div>{m.text}</div>}
            <div className="message-meta"><span>{formatTime(m.createdAt)}</span>{m.edited&&<em>edited</em>}{m.senderId===user.id&&<CheckCheck size={15}/>}</div>
            {menu===m.id && <div className="message-menu">
              {m.senderId===user.id&&<><button onClick={()=>{edit(m);setMenu(null)}}><Edit3/>Edit</button><button onClick={()=>{del(m);setMenu(null)}}><Trash2/>Delete</button></>}
              <button onClick={()=>{setReply(m);setMenu(null)}}>↩ Reply</button>
            </div>}
          </div>
        </div>
      </div>)}
      {typing&&<div className="typing"><span></span><span></span><span></span></div>}
      <div ref={bottomRef}/>
    </section>
    <div className="composer-area">
      {reply&&<div className="replying"><span>Replying to {reply.senderId===user.id?"yourself":conversation.user.username}</span><button onClick={()=>setReply(null)}><X/></button></div>}
      <div className="composer">
        <button title="Emoji" onClick={()=>setText(t=>t+"🙂")}><Smile/></button>
        <button title="Attach"><Paperclip/></button>
        <textarea value={text} onChange={changeText} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}}} placeholder="Type a message" rows="1"/>
        <button className="send" onClick={send}><Send/></button>
      </div>
    </div>
  </main>;
}

function formatTime(date){return date?new Date(date).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}):""}

export default function App(){
  const [user,setUser]=useState(null); const [loading,setLoading]=useState(true);
  const [conversations,setConversations]=useState([]); const [selected,setSelected]=useState(null);
  const [newChat,setNewChat]=useState(false); const [profile,setProfile]=useState(false); const [dark,setDark]=useState(localStorage.getItem("chatflow_theme")==="dark");

  useEffect(()=>{document.body.classList.toggle("dark",dark);localStorage.setItem("chatflow_theme",dark?"dark":"light")},[dark]);
  useEffect(()=>{api.me().then(x=>setUser(x.user)).catch(()=>localStorage.removeItem("chatflow_token")).finally(()=>setLoading(false))},[]);
  useEffect(()=>{
    if(!user)return;
    socket.auth={token:localStorage.getItem("chatflow_token")}; socket.connect();
    loadConversations();
    const presence=({userId,online,lastSeen})=>setConversations(prev=>prev.map(c=>c.user?.id===userId?{...c,user:{...c.user,online,lastSeen}}:c));
    socket.on("presence:update",presence);
    return()=>{socket.off("presence:update",presence);socket.disconnect()};
  },[user?.id]);
  const loadConversations=()=>api.conversations().then(x=>setConversations(x.conversations)).catch(()=>{});
  const start=async u=>{const x=await api.createConversation(u.id);setConversations(prev=>prev.some(c=>c.id===x.conversation.id)?prev:[x.conversation,...prev]);setSelected(x.conversation);setNewChat(false)};
  const save=async data=>{const x=await api.updateMe(data);setUser(x.user);setProfile(false)};
  const logout=()=>{localStorage.removeItem("chatflow_token");socket.disconnect();setUser(null);setSelected(null)};
  if(loading)return <div className="loading-screen"><div className="spinner"/><span>Loading ChatFlow…</span></div>;
  if(!user)return <Auth onAuth={u=>setUser(u)}/>;
  return <div className="app-shell">
    <Sidebar user={user} conversations={conversations} selected={selected} onSelect={setSelected} onNew={()=>setNewChat(true)} onProfile={()=>setProfile(true)} dark={dark} setDark={setDark}/>
    {selected?<Chat user={user} conversation={selected} onBack={()=>setSelected(null)}/>:<main className="welcome"><div className="welcome-icon"><MessageCircle size={48}/></div><h2>Welcome to ChatFlow</h2><p>Select a conversation or start a new chat.</p><button className="primary" onClick={()=>setNewChat(true)}><UserPlus size={18}/> New conversation</button></main>}
    {newChat&&<NewChat onClose={()=>setNewChat(false)} onStart={start}/>}
    {profile&&<Profile user={user} onClose={()=>setProfile(false)} onSave={save} onLogout={logout}/>}
  </div>;
}
