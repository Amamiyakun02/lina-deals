import { Avatar, AvatarFallback, AvatarImage } from "./components/ui/avatar";
import { Input } from "./components/ui/input";
import { Send, Paperclip, Loader2, Sparkles } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { motion } from "motion/react";
import type { ReactNode } from "react";

interface Message {
  id: number;
  sender: "user" | "ai";
  text: string;
  timestamp: string;
  image?: string;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      sender: "ai",
      text: "Selamat datang di **AIMER GADGET**. Saya Luna, siap membantu Anda mencari informasi smartphone dan gadget, mulai dari spesifikasi, rekomendasi, hingga ketersediaan produk.",
      timestamp: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
    }
  ]);

  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      console.log("File selected:", files[0]);
    }
  };

  const handleSendMessage = async (textOverride?: string | React.MouseEvent) => {
    const textToSend = typeof textOverride === 'string' ? textOverride : inputMessage;
    if (!textToSend.trim() || isLoading) return;

    const userText = textToSend;
    const newMessage: Message = {
      id: Date.now(),
      sender: "user",
      text: userText,
      timestamp: new Date().toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    setMessages((prev) => [...prev, newMessage]);
    setInputMessage("");
    setIsLoading(true);

    // Keep focus on input
    setTimeout(() => {
      inputRef.current?.focus();
    }, 10);

    try {
      // Menghubungi API Agent
      const response = await fetch("https://myagentic-apps.fastapicloud.dev/agents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
        },
        body: JSON.stringify({
          user_id: "user-aimer-1",
          messages: [
            {
              role: "user",
              content: userText
            }
          ]
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      setIsLoading(false); // Sembunyikan loading, mulai proses stream

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");

      const aiResponseId = Date.now() + 1;
      setMessages((prev) => [...prev, {
        id: aiResponseId,
        sender: "ai",
        text: "",
        timestamp: new Date().toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      }]);

      let aiText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunkStr = decoder.decode(value, { stream: true });

          // Parsing SSE dan raw chunks
          const lines = chunkStr.split('\n');
          for (const line of lines) {
            if (line.startsWith('data:')) {
              const dataStr = line.slice(5).trim();
              if (dataStr === '[DONE]') continue;

              try {
                const data = JSON.parse(dataStr);
                if (data.text) {
                  aiText += data.text;
                } else if (data.error) {
                  console.error("Stream Error:", data.error);
                } else if (typeof data === 'string') {
                  aiText += data;
                }
              } catch (e) {
                // Jika JSON.parse gagal, anggap sebagai raw text
                aiText += dataStr;
              }
            } else if (line.trim() !== '') {
              // Non-SSE text
              aiText += line;
            }
          }

          // Update state dengan teks yang terakumulasi
          setMessages(prev => prev.map(msg =>
            msg.id === aiResponseId ? { ...msg, text: aiText } : msg
          ));
        }
      }

    } catch (error) {
      setIsLoading(false);
      console.error("Error communicating with AI Agent:", error);
      const errorMsg: Message = {
        id: Date.now() + 1,
        sender: "ai",
        text: "Koneksi ke sistem **Aimer Consultant** gagal. Pastikan server backend agent berjalan di `http://localhost:8000/chat_agents`.",
        timestamp: new Date().toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="relative w-screen h-screen flex justify-center overflow-hidden">
      {/* ============================================================
          Aurora Animated Background
          FIX: overflow-hidden pada container mencegah motion.div
          yang ber-animasi meluap keluar dan menyebabkan seluruh
          halaman ikut bergerak / scroll.
          Animasi y-axis dihapus — hanya opacity yang berubah,
          pergerakan lateral (x) masih aman karena root punya
          overflow-hidden.
      ============================================================ */}
      {/* Background: dark slate/indigo — lebih hangat dan tidak menyilaukan */}
      <div className="absolute inset-0 overflow-hidden bg-gradient-to-b from-[#0d1117] via-[#0f1923] to-[#0a0f1a]">
        {/* Aurora Layer 1 — Soft Mint/Teal */}
        <motion.div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              repeating-linear-gradient(
                90deg,
                transparent 0px,
                transparent 10px,
                rgba(110, 231, 183, 0.08) 10px,
                rgba(110, 231, 183, 0.2) 12px,
                rgba(94, 234, 212, 0.28) 15px,
                rgba(110, 231, 183, 0.2) 18px,
                rgba(110, 231, 183, 0.08) 20px,
                transparent 20px,
                transparent 50px
              )
            `,
            filter: "blur(4px)",
            transform: "skewY(-10deg)",
            willChange: "opacity, transform",
          }}
          animate={{
            x: [-80, 80, -80],
            opacity: [0.5, 0.75, 0.5],
          }}
          transition={{
            duration: 28,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Aurora Layer 2 — Soft Sky Blue */}
        <motion.div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              repeating-linear-gradient(
                95deg,
                transparent 0px,
                transparent 14px,
                rgba(147, 197, 253, 0.1) 14px,
                rgba(147, 197, 253, 0.25) 16px,
                rgba(96, 165, 250, 0.32) 19px,
                rgba(147, 197, 253, 0.25) 22px,
                rgba(147, 197, 253, 0.1) 24px,
                transparent 24px,
                transparent 60px
              )
            `,
            filter: "blur(5px)",
            transform: "skewY(8deg)",
            willChange: "opacity, transform",
          }}
          animate={{
            x: [100, -120, 100],
            opacity: [0.4, 0.65, 0.4],
          }}
          transition={{
            duration: 34,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Aurora Layer 3 — Soft Lavender */}
        <motion.div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              repeating-linear-gradient(
                88deg,
                transparent 0px,
                transparent 12px,
                rgba(196, 181, 253, 0.1) 12px,
                rgba(196, 181, 253, 0.22) 14px,
                rgba(167, 139, 250, 0.3) 17px,
                rgba(196, 181, 253, 0.22) 20px,
                rgba(196, 181, 253, 0.1) 22px,
                transparent 22px,
                transparent 55px
              )
            `,
            filter: "blur(6px)",
            transform: "skewY(-5deg)",
            willChange: "opacity, transform",
          }}
          animate={{
            x: [-60, 110, -60],
            opacity: [0.45, 0.65, 0.45],
          }}
          transition={{
            duration: 26,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Aurora Layer 4 — Soft Sage Green */}
        <motion.div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              repeating-linear-gradient(
                92deg,
                transparent 0px,
                transparent 16px,
                rgba(134, 239, 172, 0.08) 16px,
                rgba(134, 239, 172, 0.18) 18px,
                rgba(74, 222, 128, 0.24) 21px,
                rgba(134, 239, 172, 0.18) 24px,
                rgba(134, 239, 172, 0.08) 26px,
                transparent 26px,
                transparent 65px
              )
            `,
            filter: "blur(7px)",
            transform: "skewY(12deg)",
            willChange: "opacity, transform",
          }}
          animate={{
            x: [70, -90, 70],
            opacity: [0.4, 0.6, 0.4],
          }}
          transition={{
            duration: 30,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Soft Glow — Top Mint */}
        <motion.div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 50% 15%, rgba(94, 234, 212, 0.12) 0%, transparent 55%)",
            filter: "blur(90px)",
          }}
          animate={{ opacity: [0.3, 0.55, 0.3] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Soft Glow — Bottom Lavender */}
        <motion.div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 50% 85%, rgba(167, 139, 250, 0.14) 0%, transparent 55%)",
            filter: "blur(100px)",
          }}
          animate={{ opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Main Chat App Container */}
      <div className="relative z-10 w-full max-w-4xl h-screen flex flex-col bg-[#0f111a]/80 backdrop-blur-3xl border-x border-white/[0.05] shadow-2xl">

        {/* Header - Aimer Consultant Brand */}
        <header className="px-6 py-5 border-b border-white/[0.05] flex items-center justify-between bg-black/20 shrink-0">
          <div className="flex items-center gap-4">
            <div className="relative flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.2)] overflow-hidden">
              <Avatar className="w-full h-full rounded-none">
                <AvatarImage src="/images/Luna.png" className="object-cover" />
                <AvatarFallback className="bg-transparent rounded-none">
                  <Sparkles className="w-6 h-6 text-indigo-400" />
                </AvatarFallback>
              </Avatar>
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-wide text-white/90 bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">AIMER GADGET</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-pulse" />
                <span className="text-xs text-indigo-300/80 font-medium tracking-wide uppercase">Agent Online</span>
              </div>
            </div>
          </div>
        </header>

        {/* Chat Area */}
        <div
          className="flex-1 overflow-y-auto px-6 py-8 space-y-8 scroll-smooth"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
        >
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}

          {messages.length === 1 && !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex flex-col sm:flex-row gap-3 pt-2"
            >
              <button
                onClick={() => handleSendMessage("Bisa rekomendasikan smartphone untuk gaming dengan budget di bawah 5 juta?")}
                className="flex-1 text-left px-5 py-4 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 hover:from-indigo-500/20 hover:to-purple-500/20 border border-indigo-500/20 hover:border-indigo-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-300 group-hover:scale-110 transition-transform">
                    🎮
                  </div>
                  <span className="font-semibold text-slate-200 text-sm">Rekomendasi HP Gaming</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Cari smartphone performa tinggi untuk gaming budget di bawah 5 juta.
                </p>
              </button>

              <button
                onClick={() => handleSendMessage("Apa perbedaan spesifikasi dan keunggulan antara iPhone 15 Pro dengan Samsung Galaxy S24 Ultra?")}
                className="flex-1 text-left px-5 py-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 hover:from-emerald-500/20 hover:to-teal-500/20 border border-emerald-500/20 hover:border-emerald-500/40 transition-all duration-300 group"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-300 group-hover:scale-110 transition-transform">
                    ⚖️
                  </div>
                  <span className="font-semibold text-slate-200 text-sm">Bandingkan Flagship</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Perbandingan spesifikasi antara iPhone 15 Pro dan Samsung Galaxy S24 Ultra.
                </p>
              </button>
            </motion.div>
          )}

          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-4 max-w-[80%]"
            >
              <div className="flex-shrink-0 mt-1">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-900/80 to-slate-900/80 border border-indigo-500/30 flex items-center justify-center shadow-lg overflow-hidden">
                  <Avatar className="w-full h-full rounded-none">
                    <AvatarImage src="/images/Luna.png" className="object-cover" />
                    <AvatarFallback className="bg-transparent rounded-none">
                      <Sparkles className="w-5 h-5 text-indigo-400" />
                    </AvatarFallback>
                  </Avatar>
                </div>
              </div>
              <div className="px-5 py-4 rounded-2xl rounded-tl-none bg-slate-900/50 border border-indigo-500/20 shadow-xl backdrop-blur-md flex items-center gap-3 h-[52px]">
                <div className="flex items-center gap-1.5 px-1 py-1">
                  <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0 }} className="w-2 h-2 bg-indigo-400 rounded-full" />
                  <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} className="w-2 h-2 bg-indigo-400 rounded-full" />
                  <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} className="w-2 h-2 bg-indigo-400 rounded-full" />
                </div>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} className="h-4" />
        </div>

        {/* Input Area */}
        <div className="p-6 pt-2 shrink-0 bg-gradient-to-t from-[#0a0b10] to-transparent">
          <div className="relative group">
            {/* Glow effect behind input */}
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-indigo-500/20 rounded-[24px] blur-md opacity-70 group-focus-within:opacity-100 transition duration-500"></div>

            <div className="relative flex items-center gap-3 bg-[#11131a]/90 backdrop-blur-xl border border-white/10 rounded-[20px] p-2 shadow-2xl transition-all duration-300 focus-within:border-indigo-500/50 focus-within:bg-[#151822]">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                className="hidden"
              />
              <button
                onClick={handleFileClick}
                className="p-3 rounded-xl text-slate-400 hover:text-indigo-300 hover:bg-white/5 transition-colors"
                title="Lampirkan File"
              >
                <Paperclip className="w-5 h-5" />
              </button>

              <Input
                ref={inputRef}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Tanyakan seputar smartphone atau gadget..."
                className="flex-1 bg-transparent border-none shadow-none focus-visible:ring-0 text-white placeholder:text-slate-500/80 text-[15px] px-2 h-12"
              />

              <button
                onClick={handleSendMessage}
                disabled={!inputMessage.trim() || isLoading}
                className={`p-3.5 rounded-xl flex items-center justify-center transition-all duration-300 ${inputMessage.trim() && !isLoading
                  ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_20px_rgba(79,70,229,0.4)] hover:shadow-[0_0_25px_rgba(79,70,229,0.6)] hover:scale-105 active:scale-95"
                  : "bg-white/5 text-slate-500 cursor-not-allowed"
                  }`}
              >
                <Send className="w-5 h-5 ml-0.5" />
              </button>
            </div>

            <div className="text-center mt-3">
              <span className="text-[11px] text-slate-500/70 font-medium tracking-wide">
                Sistem AI dapat melakukan kesalahan. Harap verifikasi informasi penting secara mandiri.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.sender === "user";

  const renderMessageContent = (text: string): ReactNode => {
    // Parse bold text for simpler markdown support
    const processFormatting = (content: string) => {
      const parts = content.split(/(\*\*.*?\*\*)/g);
      return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-semibold text-white/95">{part.slice(2, -2)}</strong>;
        }
        return part;
      });
    };

    // Parse code blocks
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const parts: ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const textBefore = text.substring(lastIndex, match.index);
        parts.push(
          <p key={`text-${lastIndex}`} className="text-[15px] leading-relaxed mb-3 whitespace-pre-wrap">
            {processFormatting(textBefore)}
          </p>
        );
      }

      const language = match[1] || "text";
      const code = match[2].trim();

      parts.push(
        <div key={`code-${match.index}`} className="my-4 rounded-xl overflow-hidden border border-white/10 shadow-2xl bg-[#1e1e1e]">
          <div className="flex items-center justify-between px-4 py-2 bg-black/40 border-b border-white/5">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">{language}</span>
          </div>
          <SyntaxHighlighter
            language={language}
            style={vscDarkPlus}
            customStyle={{
              margin: 0,
              padding: "1rem",
              fontSize: "14px",
              background: "transparent",
            }}
          >
            {code}
          </SyntaxHighlighter>
        </div>
      );

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      const textAfter = text.substring(lastIndex);
      parts.push(
        <p key={`text-${lastIndex}`} className="text-[15px] leading-relaxed whitespace-pre-wrap">
          {processFormatting(textAfter)}
        </p>
      );
    }

    return parts.length > 0 ? <>{parts}</> : <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{processFormatting(text)}</p>;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-4 w-full ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar */}
      <div className="flex-shrink-0 mt-1">
        {isUser ? (
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 border border-slate-600/50 flex items-center justify-center shadow-lg">
            <Avatar className="w-9 h-9 rounded-xl">
              <AvatarImage src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop" />
              <AvatarFallback className="bg-transparent text-slate-200 font-medium">U</AvatarFallback>
            </Avatar>
          </div>
        ) : (
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-900/80 to-slate-900/80 border border-indigo-500/40 flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.2)] overflow-hidden">
            <Avatar className="w-full h-full rounded-none">
              <AvatarImage src="/images/Luna.png" className="object-cover" />
              <AvatarFallback className="bg-transparent rounded-none">
                <Sparkles className="w-5 h-5 text-indigo-400" />
              </AvatarFallback>
            </Avatar>
          </div>
        )}
      </div>

      {/* Message Content */}
      <div className={`flex flex-col max-w-[80%] ${isUser ? "items-end" : "items-start"}`}>
        <div className="flex items-center gap-2 mb-1.5 px-1">
          {isUser ? (
            <>
              <span className="text-[11px] text-slate-500 font-medium">{message.timestamp}</span>
              <span className="text-[13px] font-semibold text-slate-300 tracking-wide">Anda</span>
            </>
          ) : (
            <>
              <span className="text-[13px] font-semibold text-indigo-300 tracking-wide">AIMER GADGET</span>
              <span className="text-[11px] text-slate-500 font-medium">{message.timestamp}</span>
            </>
          )}
        </div>

        <div
          className={`px-5 py-4 rounded-[20px] shadow-xl backdrop-blur-md ${isUser
            ? "rounded-tr-sm bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 text-slate-100"
            : "rounded-tl-sm bg-slate-900/60 border border-indigo-500/20 text-slate-200"
            }`}
        >
          {message.image && (
            <div className="mb-4 overflow-hidden rounded-xl border border-white/10">
              <img src={message.image} alt="Attachment" className="w-full max-w-sm h-auto object-cover" />
            </div>
          )}
          <div className="prose prose-invert prose-p:leading-relaxed max-w-none">
            {renderMessageContent(message.text)}
          </div>
        </div>
      </div>
    </motion.div>
  );
}