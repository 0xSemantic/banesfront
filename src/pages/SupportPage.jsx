import { useEffect, useState, useRef } from 'react';
import { useAuthStore } from '../store';
import api from '../utils/api';
import { Send, XCircle, MessageCircle, Menu, ChevronLeft } from 'lucide-react';
import { PageHeader, Alert } from '../components/ui';
import clsx from 'clsx';

export default function SupportPage() {
  const { user } = useAuthStore();
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [ws, setWs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef(null);

  // Load sessions
  useEffect(() => {
    const loadSessions = async () => {
      try {
        setLoading(true);
        const res = await api.get('/chat/sessions');
        const sessionsData = Array.isArray(res.data) ? res.data : [];
        setSessions(sessionsData);
        setError(null);
      } catch (err) {
        console.error(err);
        setError('Unable to load chat sessions. Please try again later.');
        setSessions([]);
      } finally {
        setLoading(false);
      }
    };
    loadSessions();
  }, []);

  // WebSocket connection
  useEffect(() => {
    if (!currentSession) return;

    const token = localStorage.getItem('credex_token');
    if (!token) {
      console.error('No authentication token found');
      setError('Authentication required. Please log in again.');
      return;
    }

    const wsUrl = `wss://banesco-9drg.onrender.com/ws/chat/${currentSession.id}?token=${token}`;
    const socket = new WebSocket(wsUrl);
    
    socket.onopen = () => {
      console.log('WebSocket connected for session', currentSession.id);
    };
    
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'new_message') {
          setMessages(prev => [...prev, data.message]);
        }
      } catch (err) {
        console.error('Failed to parse message', err);
      }
    };
    
    socket.onerror = (err) => {
      console.error('WebSocket error', err);
      setError('Connection error. Please refresh the page.');
    };
    
    socket.onclose = () => {
      console.log('WebSocket closed for session', currentSession.id);
    };
    
    setWs(socket);
    
    api.get(`/chat/sessions/${currentSession.id}/messages`)
      .then(res => {
        const msgs = Array.isArray(res.data) ? res.data : [];
        setMessages(msgs);
      })
      .catch(err => console.error('Failed to load messages', err));
    
    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [currentSession]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = () => {
    if (!newMessage.trim() || !ws || ws.readyState !== WebSocket.OPEN) {
      if (ws?.readyState !== WebSocket.OPEN) setError('Disconnected. Please refresh the page.');
      return;
    }
    const tempMessage = {
      id: Date.now(),
      sender_id: user.id,
      content: newMessage,
      timestamp: new Date().toISOString(),
      is_read: false
    };
    setMessages(prev => [...prev, tempMessage]);
    ws.send(JSON.stringify({ content: newMessage }));
    setNewMessage('');
  };

  const createNewSession = async () => {
    try {
      const res = await api.post('/chat/sessions');
      setSessions(prev => [res.data, ...prev]);
      setCurrentSession(res.data);
      setError(null);
      setSidebarOpen(false); // close sidebar on mobile after selection
    } catch (err) {
      console.error(err);
      alert('Could not start new chat. Please try again.');
    }
  };

  const closeSession = async () => {
    if (!currentSession) return;
    try {
      await api.put(`/chat/sessions/${currentSession.id}/close`);
      setCurrentSession(null);
      const res = await api.get('/chat/sessions');
      setSessions(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
    }
  };

  const selectSession = (session) => {
    setCurrentSession(session);
    setSidebarOpen(false);
  };

  if (loading && sessions.length === 0) {
    return <div className="flex justify-center py-12"><div className="spinner" /></div>;
  }
  if (error) return <Alert type="danger" message={error} />;

  return (
    <div className="space-y-4">
      <PageHeader title="Customer Support" subtitle="Chat with our support team" />

      {/* Mobile: toggle sidebar button */}
      <div className="md:hidden flex items-center gap-3">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 rounded-xl bg-bank-surface border border-bank-border text-bank-muted"
        >
          <Menu size={20} />
        </button>
        <span className="text-sm font-semibold text-bank-light">
          {currentSession ? `Session #${currentSession.id}` : 'Select a chat'}
        </span>
      </div>

      <div className="flex flex-col md:flex-row gap-4 min-h-[70vh]">
        {/* Sidebar - hidden on mobile unless toggled */}
        <div
          className={clsx(
            'md:w-72 lg:w-80 flex-shrink-0 bg-bank-surface rounded-2xl border border-bank-border p-4 overflow-y-auto transition-all duration-300',
            'md:block',
            sidebarOpen ? 'block' : 'hidden'
          )}
          style={{ maxHeight: 'calc(100vh - 220px)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-bank-muted">Conversations</h3>
            <button
              onClick={createNewSession}
              className="text-xs bg-primary-600 text-white px-3 py-1.5 rounded-lg hover:bg-primary-700 transition"
            >
              + New
            </button>
          </div>

          <div className="space-y-2">
            {sessions.length === 0 && !loading && (
              <div className="text-center text-bank-muted py-6 text-sm">
                No conversations yet.<br />Start a new chat.
              </div>
            )}
            {sessions.map(s => (
              <div
                key={s.id}
                onClick={() => selectSession(s)}
                className={clsx(
                  'p-3 rounded-xl cursor-pointer transition',
                  currentSession?.id === s.id
                    ? 'bg-primary-600/20 border-l-4 border-primary-600'
                    : 'hover:bg-bank-dark'
                )}
              >
                <p className="font-medium text-bank-light">Session #{s.id}</p>
                <p className="text-xs text-bank-muted">
                  {s.status === 'open' ? '🟢 Open' : '🔒 Closed'}
                </p>
                <p className="text-xs text-bank-muted">
                  {new Date(s.updated_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col bg-bank-dark rounded-2xl border border-bank-border overflow-hidden min-h-[400px]">
          {currentSession ? (
            <>
              {/* Header */}
              <div className="border-b border-bank-border p-3 sm:p-4 bg-bank-surface flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {sidebarOpen && (
                    <button
                      onClick={() => setSidebarOpen(false)}
                      className="md:hidden p-1 text-bank-muted"
                    >
                      <ChevronLeft size={18} />
                    </button>
                  )}
                  <div className="text-bank-light font-semibold text-sm sm:text-base">
                    Support Chat – Session #{currentSession.id}
                  </div>
                </div>
                {currentSession.status === 'open' && (
                  <button
                    onClick={closeSession}
                    className="text-red-400 flex items-center gap-1 hover:text-red-300 transition text-xs sm:text-sm"
                  >
                    <XCircle size={16} /> Close
                  </button>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
                {messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender_id === user.id ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={clsx(
                        'max-w-[85%] sm:max-w-[70%] rounded-2xl p-3',
                        msg.sender_id === user.id
                          ? 'bg-primary-600 text-white'
                          : 'bg-bank-surface text-bank-light shadow'
                      )}
                    >
                      <p className="text-sm break-words">{msg.content}</p>
                      <p className="text-[10px] mt-1 opacity-70">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input area */}
              {currentSession.status === 'open' && (
                <div className="border-t border-bank-border p-3 sm:p-4 bg-bank-surface flex gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && sendMessage()}
                    className="flex-1 bg-bank-dark border border-bank-border rounded-xl px-4 py-2.5 text-sm text-bank-light focus:outline-none focus:border-primary-600"
                    placeholder="Type your message..."
                  />
                  <button
                    onClick={sendMessage}
                    className="bg-primary-600 text-white px-4 py-2.5 rounded-xl hover:bg-primary-700 transition flex-shrink-0"
                  >
                    <Send size={18} />
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-bank-muted p-6">
              <MessageCircle size={48} className="mb-3 opacity-40" />
              <p className="text-center">Select a conversation or start a new chat</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}