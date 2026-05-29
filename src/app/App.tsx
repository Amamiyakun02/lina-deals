import { Avatar, AvatarFallback, AvatarImage } from "./components/ui/avatar";
import { Send, Paperclip, Sparkles, Globe } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import ProductCard, { Product } from "./components/ui/ProductCard";
import { cn } from "./components/ui/utils";
import { translations, type Lang } from "../i18n/translations";

// ─── Parse [PRODUCTS:{...}] dari response agent ─────────────────────────────

/**
 * Ekstrak data produk dari blok [PRODUCTS:{"items":[...]}] yang disisipkan agent.
 * Mengembalikan array Product[] atau [] jika tidak ada / parse gagal.
 */
export function parseProductsFromResponse(text: string): Product[] {
  if (!text) return [];
  // Regex: cari [PRODUCTS:{...}] — gunakan greedy matching agar tidak terpotong oleh nested brackets (misal colors)
  const match = text.match(/\[PRODUCTS:(\{[\s\S]*\})\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]);
    const items: unknown[] = Array.isArray(parsed.items) ? parsed.items : [];
    return items.filter(Boolean).map((item: unknown) => {
      const p = item as Record<string, unknown>;
      return {
        id: String(p.id ?? Math.random()),
        name: String(p.name ?? "Produk"),
        brand: String(p.brand ?? ""),
        price: String(p.price ?? "Rp 0"),
        rating: Number(p.rating ?? 0),
        reviewsCount: Number(p.reviewsCount ?? 0),
        specs: {
          screen: String((p.specs as Record<string, unknown>)?.screen ?? "-"),
          processor: String((p.specs as Record<string, unknown>)?.processor ?? "-"),
          camera: String((p.specs as Record<string, unknown>)?.camera ?? "-"),
          battery: String((p.specs as Record<string, unknown>)?.battery ?? "-"),
        },
        tags: Array.isArray(p.tags) ? (p.tags as string[]) : ["Toko Aimer"],
        image: String(p.image ?? `https://placehold.co/300x300/e2e8f0/475569?text=${encodeURIComponent(String(p.name ?? "Produk")).slice(0, 15)}`),
        colors: Array.isArray(p.colors) ? (p.colors as { name: string; hex: string }[]) : [{ name: "Default", hex: "#8E8E93" }],
      } satisfies Product;
    });
  } catch {
    return [];
  }
}

/**
 * Ekstrak daftar ID produk dari blok [PRODUCTS:id1,id2,id3] jika ada.
 * Mengembalikan array string ID atau [] jika tidak ada.
 */
export function extractProductIdsFromResponse(text: string): string[] {
  if (!text) return [];
  const match = text.match(/\[PRODUCTS:([\s\S]*?)(?:\]|$)/);
  if (!match) return [];
  const content = match[1].trim();
  if (content.startsWith("{")) return []; // Ini format JSON lama

  // Pecah berdasarkan koma dan ambil hanya ID yang valid (24 karakter heksadesimal yang lengkap)
  return content
    .split(",")
    .map(id => id.trim())
    .filter(id => /^[a-fA-F0-9]{24}$/i.test(id));
}

/**
 * Hapus blok [PRODUCTS:{...}] atau [PRODUCTS:id1,id2,id3] dari teks agar tidak muncul mentah di chat bubble.
 */
export function cleanTextFromProducts(text: string): string {
  let cleaned = text.replace(/\[PRODUCTS:[\s\S]*?(?:\]|$)/g, "");
  cleaned = cleaned.replace(/\[PENELUSURAN:[\s\S]*?(?:\]|$)/g, "");
  return cleaned.trimEnd();
}

export const parseProductsFromText = parseProductsFromResponse; // backward compat alias

interface Message {
  id: number;
  sender: "user" | "ai";
  text: string;
  timestamp: string;
  image?: string;
  products?: Product[];
  productsLoading?: boolean;
  rawText?: string;
}

// ─── Tipe untuk Quick Prompt dari API ─────────────────────────────────────────
interface QuickPrompt {
  id: string;
  icon: string;
  title: string;
  description: string;
  prompt: string;
  color: string;
}

// Map color name → Tailwind gradient classes
const PROMPT_COLORS: Record<string, string> = {
  indigo:  "from-indigo-50 to-indigo-100/50 hover:from-indigo-100 hover:to-indigo-200/50 border-indigo-200 hover:border-indigo-300",
  emerald: "from-emerald-50 to-emerald-100/50 hover:from-emerald-100 hover:to-emerald-200/50 border-emerald-200 hover:border-emerald-300",
  violet:  "from-violet-50 to-violet-100/50 hover:from-violet-100 hover:to-violet-200/50 border-violet-200 hover:border-violet-300",
  rose:    "from-rose-50 to-rose-100/50 hover:from-rose-100 hover:to-rose-200/50 border-rose-200 hover:border-rose-300",
  blue:    "from-blue-50 to-blue-100/50 hover:from-blue-100 hover:to-blue-200/50 border-blue-200 hover:border-blue-300",
  amber:   "from-amber-50 to-amber-100/50 hover:from-amber-100 hover:to-amber-200/50 border-amber-200 hover:border-amber-300",
};

const ICON_COLORS: Record<string, string> = {
  indigo:  "bg-indigo-200/50 text-indigo-700",
  emerald: "bg-emerald-200/50 text-emerald-700",
  violet:  "bg-violet-200/50 text-violet-700",
  rose:    "bg-rose-200/50 text-rose-700",
  blue:    "bg-blue-200/50 text-blue-700",
  amber:   "bg-amber-200/50 text-amber-700",
};

export default function App() {
  // ─── Language State (persisted in localStorage) ──────────────────────────
  const [lang, setLang] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem("aimer-lang");
      return (saved === "id" || saved === "en") ? saved : "id";
    } catch {
      return "id";
    }
  });

  const t = translations[lang];

  const toggleLang = () => {
    const next: Lang = lang === "id" ? "en" : "id";
    setLang(next);
    try { localStorage.setItem("aimer-lang", next); } catch { /* noop */ }
  };

  const [sessionId] = useState(() => "session-" + Math.random().toString(36).substring(2, 15) + "-" + Date.now());

  // ─── Quick Prompts: fetch dari API ──────────────────────────────────────────
  const buildFallbackPrompts = (currentLang: Lang): QuickPrompt[] => [
    {
      id: "gaming",
      icon: "🎮",
      title: translations[currentLang].quickPrompts.gaming.title,
      description: translations[currentLang].quickPrompts.gaming.description,
      prompt: translations[currentLang].quickPrompts.gaming.prompt,
      color: "indigo",
    },
    {
      id: "flagship",
      icon: "⚖️",
      title: translations[currentLang].quickPrompts.flagship.title,
      description: translations[currentLang].quickPrompts.flagship.description,
      prompt: translations[currentLang].quickPrompts.flagship.prompt,
      color: "emerald",
    },
  ];

  const [quickPrompts, setQuickPrompts] = useState<QuickPrompt[]>(() => buildFallbackPrompts("id"));

  // Sync fallback prompts when lang changes (only if no API prompts loaded)
  const [apiPromptsLoaded, setApiPromptsLoaded] = useState(false);
  useEffect(() => {
    if (!apiPromptsLoaded) {
      setQuickPrompts(buildFallbackPrompts(lang));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, apiPromptsLoaded]);

  useEffect(() => {
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const baseUrl = isLocal ? "http://localhost:8000" : "https://myagentic-apps.fastapicloud.dev";
    fetch(`${baseUrl}/v1/agent/quick-prompts`)
      .then(res => res.ok ? res.json() : Promise.reject(res.status))
      .then(data => {
        if (Array.isArray(data?.prompts) && data.prompts.length > 0) {
          setQuickPrompts(data.prompts);
          setApiPromptsLoaded(true);
        }
      })
      .catch(() => {
        // Jika gagal, tetap pakai fallback
      });
  }, []);

  const buildWelcomeMessage = (currentLang: Lang): Message => ({
    id: 1,
    sender: "ai",
    text: translations[currentLang].welcomeMessage,
    timestamp: new Date().toLocaleTimeString(currentLang === "id" ? "id-ID" : "en-US", { hour: "2-digit", minute: "2-digit" }),
  });

  const [messages, setMessages] = useState<Message[]>(() => [buildWelcomeMessage("id")]);

  // Update welcome message when lang changes (only if it's the first/only message)
  useEffect(() => {
    setMessages(prev => {
      if (prev.length === 1 && prev[0].id === 1 && prev[0].sender === "ai") {
        return [buildWelcomeMessage(lang)];
      }
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Action handler for Product Card buttons
  const handleProductAction = (action: "check_stock" | "view_specs" | "booking", product: Product) => {
    if (action === "check_stock") {
      handleSendMessage(`Apakah unit **${product.name}** saat ini ready stock di toko Anda?`);
    } else if (action === "view_specs") {
      handleSendMessage(`Bisa tolong berikan rincian spesifikasi lengkap dan kelebihan dari **${product.name}**?`);
    } else if (action === "booking") {
      handleSendMessage(`Bisa tolong booking produk **${product.name}** untuk saya?`);
    }
  };

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
    const textToSend = typeof textOverride === "string" ? textOverride : inputMessage;
    if (!textToSend.trim() || isLoading) return;

    const userText = textToSend;
    const locale = lang === "id" ? "id-ID" : "en-US";
    const newMessage: Message = {
      id: Date.now(),
      sender: "user",
      text: userText,
      timestamp: new Date().toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    setMessages((prev) => [...prev, newMessage]);
    setInputMessage("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    setIsLoading(true);

    setTimeout(() => {
      inputRef.current?.focus();
    }, 10);

    try {
      const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      const baseUrl = isLocal ? "http://localhost:8000" : "https://myagentic-apps.fastapicloud.dev";
      const endpoint = `${baseUrl}/v1/agent/chat`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
        },
        body: JSON.stringify({
          user_id: "user-aimer-1",
          session_id: sessionId,
          messages: [
            {
              role: "user",
              content: userText,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");

      const aiResponseId = Date.now() + 1;
      let aiText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunkStr = decoder.decode(value, { stream: true });

          const lines = chunkStr.split("\n");
          for (const line of lines) {
            if (line.startsWith("data:")) {
              const dataStr = line.slice(5).trim();
              if (dataStr === "[DONE]") continue;

              try {
                const data = JSON.parse(dataStr);
                if (data.text) {
                  aiText += data.text;
                } else if (data.error) {
                  console.error("Stream Error:", data.error);
                } else if (typeof data === "string") {
                  aiText += data;
                }
              } catch {
                aiText += dataStr;
              }
            } else if (line.trim() !== "") {
              aiText += line;
            }
          }

          if (aiText.trim() !== "") {
            setIsLoading(false);

            const parsedProducts = parseProductsFromResponse(aiText);
            const isStreamingProducts = aiText.includes("[PRODUCTS:");
            const cleanText = cleanTextFromProducts(aiText);

            setMessages((prev) => {
              const exists = prev.some(msg => msg.id === aiResponseId);
              const isOldFormatFinished = parsedProducts.length > 0;
              const isLoadingProducts = isStreamingProducts && !isOldFormatFinished;

              if (!exists) {
                return [...prev, {
                  id: aiResponseId,
                  sender: "ai",
                  text: cleanText,
                  rawText: aiText,
                  products: isOldFormatFinished ? parsedProducts : undefined,
                  productsLoading: isLoadingProducts ? true : undefined,
                  timestamp: new Date().toLocaleTimeString(locale, {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                }];
              } else {
                return prev.map(msg =>
                  msg.id === aiResponseId
                    ? {
                      ...msg,
                      text: cleanText,
                      rawText: aiText,
                      products: isOldFormatFinished ? parsedProducts : msg.products,
                      productsLoading: isOldFormatFinished ? false : (isLoadingProducts ? true : msg.productsLoading),
                    }
                    : msg
                );
              }
            });
          }
        }
      }

      if (aiText.trim() === "") {
        setIsLoading(false);
      } else {
        // ─── STREAM SELESAI: Pemicu Fetch Batch jika format ID-Only ────────────
        const productIds = extractProductIdsFromResponse(aiText);
        if (productIds.length > 0) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiResponseId
                ? { ...msg, productsLoading: true }
                : msg
            )
          );

          try {
            const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
            const baseUrl = isLocal ? "http://localhost:8000" : "https://myagentic-apps.fastapicloud.dev";

            const batchResponse = await fetch(`${baseUrl}/v1/products/batch?ids=${productIds.join(",")}`);
            if (batchResponse.ok) {
              const data = await batchResponse.json();
              if (data.items && Array.isArray(data.items)) {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === aiResponseId
                      ? { ...msg, products: data.items, productsLoading: false }
                      : msg
                  )
                );
              } else {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === aiResponseId
                      ? { ...msg, productsLoading: false }
                      : msg
                  )
                );
              }
            } else {
              throw new Error("Failed to fetch batch products");
            }
          } catch (err) {
            console.error("Batch fetch error:", err);
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiResponseId
                  ? { ...msg, productsLoading: false }
                  : msg
              )
            );
          }
        }
      }
    } catch (error) {
      setIsLoading(false);
      console.error("Error communicating with AI:", error);
      const errorMsg: Message = {
        id: Date.now() + 1,
        sender: "ai",
        text: t.connectionError,
        timestamp: new Date().toLocaleTimeString(locale, {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="relative w-screen h-screen flex justify-center overflow-hidden">
      {/* ============================================================
          Aurora Animated Background
      ============================================================ */}
      <div className="absolute inset-0 overflow-hidden bg-gradient-to-b from-slate-50 via-slate-100/80 to-slate-200/60">
        <div className="absolute inset-0">
          {/* Aurora Layer 1 */}
          <motion.div
            className="absolute inset-0"
            style={{
              backgroundImage: `
              repeating-linear-gradient(
                90deg,
                transparent 0px,
                transparent 10px,
                rgba(99, 102, 241, 0.05) 10px,
                rgba(99, 102, 241, 0.15) 12px,
                rgba(79, 70, 229, 0.2) 15px,
                rgba(99, 102, 241, 0.15) 18px,
                rgba(99, 102, 241, 0.05) 20px,
                transparent 20px,
                transparent 50px
              )
            `,
              filter: "blur(3px)",
              transform: "skewY(-10deg)",
              willChange: "opacity, transform",
            }}
            animate={{ x: [-80, 80, -80], opacity: [0.5, 0.75, 0.5] }}
            transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* Aurora Layer 2 */}
          <motion.div
            className="absolute inset-0"
            style={{
              backgroundImage: `
              repeating-linear-gradient(
                95deg,
                transparent 0px,
                transparent 14px,
                rgba(168, 85, 247, 0.05) 14px,
                rgba(168, 85, 247, 0.15) 16px,
                rgba(147, 51, 234, 0.2) 19px,
                rgba(168, 85, 247, 0.15) 22px,
                rgba(168, 85, 247, 0.05) 24px,
                transparent 24px,
                transparent 60px
              )
            `,
              filter: "blur(4px)",
              transform: "skewY(8deg)",
              willChange: "opacity, transform",
            }}
            animate={{ x: [100, -120, 100], opacity: [0.4, 0.65, 0.4] }}
            transition={{ duration: 34, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* Aurora Layer 3 */}
          <motion.div
            className="absolute inset-0"
            style={{
              backgroundImage: `
              repeating-linear-gradient(
                88deg,
                transparent 0px,
                transparent 12px,
                rgba(56, 189, 248, 0.05) 12px,
                rgba(56, 189, 248, 0.15) 14px,
                rgba(2, 132, 199, 0.2) 17px,
                rgba(56, 189, 248, 0.15) 20px,
                rgba(56, 189, 248, 0.05) 22px,
                transparent 22px,
                transparent 55px
              )
            `,
              filter: "blur(3px)",
              transform: "skewY(-5deg)",
              willChange: "opacity, transform",
            }}
            animate={{ x: [-60, 110, -60], opacity: [0.45, 0.65, 0.45] }}
            transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* Aurora Layer 4 */}
          <motion.div
            className="absolute inset-0"
            style={{
              backgroundImage: `
              repeating-linear-gradient(
                92deg,
                transparent 0px,
                transparent 16px,
                rgba(244, 114, 182, 0.05) 16px,
                rgba(244, 114, 182, 0.15) 18px,
                rgba(219, 39, 119, 0.2) 21px,
                rgba(244, 114, 182, 0.15) 24px,
                rgba(244, 114, 182, 0.05) 26px,
                transparent 26px,
                transparent 65px
              )
            `,
              filter: "blur(4px)",
              transform: "skewY(12deg)",
              willChange: "opacity, transform",
            }}
            animate={{ x: [70, -90, 70], opacity: [0.4, 0.6, 0.4] }}
            transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* Soft Glow Top */}
          <motion.div
            className="absolute inset-0"
            style={{
              background: "radial-gradient(ellipse at 50% 15%, rgba(94, 234, 212, 0.12) 0%, transparent 55%)",
              filter: "blur(90px)",
            }}
            animate={{ opacity: [0.3, 0.55, 0.3] }}
            transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* Soft Glow Bottom */}
          <motion.div
            className="absolute inset-0"
            style={{
              background: "radial-gradient(ellipse at 50% 85%, rgba(167, 139, 250, 0.14) 0%, transparent 55%)",
              filter: "blur(100px)",
            }}
            animate={{ opacity: [0.2, 0.4, 0.2] }}
            transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      </div>

      {/* Main Chat App Container */}
      <div className="relative z-10 w-full max-w-4xl h-screen flex flex-col backdrop-blur-3xl border-x shadow-2xl bg-white/60 border-slate-200/50 shadow-[0_0_40px_rgba(0,0,0,0.05)]">

        {/* Header */}
        <header className="px-4 py-3 sm:px-6 sm:py-5 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white/50">
          {/* Brand */}
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="relative flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-50 border border-indigo-200 shadow-[0_0_15px_rgba(99,102,241,0.1)] overflow-hidden">
              <Avatar className="w-full h-full rounded-none">
                <AvatarImage src="/images/Luna.png" className="object-cover" />
                <AvatarFallback className="bg-transparent rounded-none">
                  <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600" />
                </AvatarFallback>
              </Avatar>
            </div>
            <div>
              <h1 className="text-sm sm:text-xl font-bold tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-600">
                {t.brandName}
              </h1>
              <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1">
                <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)] animate-pulse" />
                <span className="text-[10px] sm:text-xs font-semibold tracking-wide uppercase text-indigo-600">
                  {t.agentOnline}
                </span>
              </div>
            </div>
          </div>

          {/* Language Toggle */}
          <button
            id="lang-toggle-btn"
            onClick={toggleLang}
            title="Switch language / Ganti bahasa"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-slate-100/80 hover:bg-indigo-50 hover:border-indigo-200 transition-all duration-300 shadow-sm group"
          >
            <Globe className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-500 transition-colors" />
            <span className="text-[11px] sm:text-xs font-bold tracking-widest text-slate-600 group-hover:text-indigo-600 transition-colors uppercase">
              {lang === "id" ? "ID" : "EN"}
            </span>
            <span className="hidden sm:inline text-[10px] text-slate-400 group-hover:text-indigo-400 transition-colors font-medium">
              → {t.langToggleLabel}
            </span>
          </button>
        </header>

        {/* Chat Area */}
        <div
          className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 sm:py-8 space-y-6 sm:space-y-8 scroll-smooth"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
        >
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              lang={lang}
              onAction={handleProductAction}
            />
          ))}

          {/* Quick Prompts — shown only when only welcome message visible */}
          {messages.length === 1 && !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2"
            >
              {quickPrompts.slice(0, 4).map((qp, idx) => {
                const colorKey = qp.color in PROMPT_COLORS ? qp.color : "indigo";
                const cardCls = PROMPT_COLORS[colorKey];
                const iconCls = ICON_COLORS[colorKey] ?? ICON_COLORS.indigo;
                return (
                  <motion.button
                    key={qp.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + idx * 0.08 }}
                    onClick={() => handleSendMessage(qp.prompt)}
                    className={`text-left px-5 py-4 rounded-2xl bg-gradient-to-br transition-all duration-300 group border ${cardCls}`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`p-2 rounded-lg group-hover:scale-110 transition-transform ${iconCls}`}>
                        {qp.icon}
                      </div>
                      <span className="font-semibold text-sm text-slate-800">
                        {qp.title}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-slate-600">
                      {qp.description}
                    </p>
                  </motion.button>
                );
              })}
            </motion.div>
          )}

          {/* Loading Indicator */}
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-4 max-w-[80%]"
            >
              <div className="flex-shrink-0 mt-1">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-100 border-indigo-200 to-slate-50 border flex items-center justify-center shadow-lg overflow-hidden">
                  <Avatar className="w-full h-full rounded-none">
                    <AvatarImage src="/images/Luna.png" className="object-cover" />
                    <AvatarFallback className="bg-transparent rounded-none">
                      <Sparkles className="w-5 h-5 text-indigo-600" />
                    </AvatarFallback>
                  </Avatar>
                </div>
              </div>
              <div className="px-5 py-4 rounded-2xl rounded-tl-none border shadow-xl backdrop-blur-md flex items-center gap-3 h-[52px] bg-white border-indigo-100 shadow-sm">
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
        <div className="px-3 sm:px-6 pb-2 pt-1 sm:pb-3 sm:pt-2 shrink-0 bg-gradient-to-t from-white/80 to-transparent">
          <div className="relative group">
            {/* Glow effect behind input */}
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-200/50 via-purple-200/50 to-indigo-200/50 rounded-[24px] blur-md opacity-70 group-focus-within:opacity-100 transition duration-500" />

            <div className="relative flex items-center gap-1.5 sm:gap-3 backdrop-blur-xl border rounded-[20px] p-1.5 sm:p-2 shadow-2xl transition-all duration-300 bg-white/90 border-slate-200 focus-within:border-indigo-400 focus-within:bg-white">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                className="hidden"
              />
              <button
                onClick={handleFileClick}
                className="p-2 sm:p-3 rounded-xl transition-colors text-slate-400 hover:text-indigo-600 hover:bg-slate-100"
                title={t.attachFile}
              >
                <Paperclip className="w-5 h-5" />
              </button>

              <textarea
                ref={inputRef}
                value={inputMessage}
                onChange={(e) => {
                  setInputMessage(e.target.value);
                  if (inputRef.current) {
                    inputRef.current.style.height = "auto";
                    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
                  }
                }}
                onKeyDown={handleKeyDown}
                placeholder={t.inputPlaceholder}
                rows={1}
                className="flex-1 bg-transparent border-none shadow-none focus-visible:outline-none focus:outline-none focus:ring-0 text-[14px] sm:text-[15px] px-2 py-2 sm:py-3.5 resize-none h-10 sm:h-12 overflow-y-auto no-scrollbar text-slate-800 placeholder:text-slate-400"
              />

              <button
                id="send-message-btn"
                onClick={handleSendMessage}
                disabled={!inputMessage.trim() || isLoading}
                className={`p-2.5 sm:p-3.5 rounded-xl flex items-center justify-center transition-all duration-300 ${inputMessage.trim() && !isLoading
                  ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_15px_rgba(79,70,229,0.3)] hover:shadow-[0_0_20px_rgba(79,70,229,0.5)] hover:scale-105 active:scale-95"
                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
                  }`}
              >
                <Send className="w-5 h-5 ml-0.5" />
              </button>
            </div>

            <div className="text-center mt-4">
              <span className="text-[11px] text-slate-500/70 font-medium tracking-wide">
                {t.disclaimer}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatMessage({
  message,
  lang,
  onAction,
}: {
  message: Message;
  lang: Lang;
  onAction: (action: "check_stock" | "view_specs" | "booking", product: Product) => void;
}) {
  const isUser = message.sender === "user";
  const t = translations[lang];

  const renderSearchingIndicator = () => {
    if (isUser || !message.rawText) return null;
    const match = message.rawText.match(/\[PENELUSURAN:\s*(.*?)\]/i);
    if (!match) return null;
    const query = match[1].trim();
    return (
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-2.5 rounded-2xl border mb-3 backdrop-blur-md shadow-sm no-prose",
          "bg-indigo-50/50 border-indigo-100/50 text-indigo-950"
        )}
      >
        <div className="relative flex items-center justify-center w-5 h-5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-indigo-400" />
          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-indigo-600" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">{t.searchingLabel}</span>
          <span className="text-xs font-semibold truncate leading-tight">{t.searchingText(query)}</span>
        </div>
      </div>
    );
  };

  const displayProducts: Product[] = message.products ?? [];

  const renderMessageContent = (text: string): ReactNode => {
    const processFormatting = (content: string) => {
      const parts = content.split(/(\*\*.*?\*\*)/g);
      return parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          const boldText = part.slice(2, -2);
          if (isUser) {
            return <strong key={i} className="font-extrabold text-white">{boldText}</strong>;
          }
          return (
            <strong
              key={i}
              className="font-bold tracking-normal px-1.5 py-0.5 rounded mx-0.5 inline-block border text-indigo-950 bg-indigo-50/30 border-indigo-100/20"
            >
              {boldText}
            </strong>
          );
        }
        return part;
      });
    };

    const renderTextSegment = (segmentText: string) => {
      const lines = segmentText.split("\n");
      return lines.map((line, idx) => {
        if (line.trim().startsWith("###") || line.trim().startsWith("##") || line.trim().startsWith("#")) {
          const title = line.replace(/^#+\s+/, "");
          return (
            <div key={idx} className={cn(
              "flex items-center gap-2 mt-2 mb-1 pb-0.5 border-b font-extrabold tracking-tight text-[15px] sm:text-base",
              !isUser ? "text-indigo-700 border-indigo-100/50" : "text-white border-white/20"
            )}>
              <span className={cn("w-1 h-3.5 rounded-full", !isUser ? "bg-indigo-600" : "bg-white/60")} />
              {processFormatting(title)}
            </div>
          );
        }

        if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
          const content = line.trim().substring(2);
          const indent = line.search(/\S/);
          return (
            <div key={idx} className="flex items-start gap-2 my-0.5 pl-1" style={{ paddingLeft: `${indent * 4 + 4}px` }}>
              <span className={cn(
                "w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 shadow-[0_0_8px_rgba(0,0,0,0.1)]",
                !isUser ? "bg-indigo-500" : "bg-white/80"
              )} />
              <span className="leading-snug text-sm sm:text-[15px]">{processFormatting(content)}</span>
            </div>
          );
        }

        const numMatch = line.trim().match(/^(\d+)\.\s+(.*)$/);
        if (numMatch) {
          const num = numMatch[1];
          const content = numMatch[2];
          const indent = line.search(/\S/);
          return (
            <div key={idx} className="flex items-start gap-2 my-1 pl-1" style={{ paddingLeft: `${indent * 4 + 4}px` }}>
              <span className={cn(
                "flex items-center justify-center w-[18px] h-[18px] rounded-full text-[9px] font-extrabold mt-0.5 shrink-0 shadow-sm",
                !isUser
                  ? "bg-indigo-50 text-indigo-600 border border-indigo-100"
                  : "bg-white/20 text-white border border-white/30"
              )}>
                {num}
              </span>
              <span className="leading-snug text-sm sm:text-[15px]">{processFormatting(content)}</span>
            </div>
          );
        }

        if (line.trim() === "") {
          return <div key={idx} className="h-0.5" />;
        }
        return (
          <p key={idx} className="text-sm sm:text-[15px] leading-snug mb-1 whitespace-pre-wrap">
            {processFormatting(line)}
          </p>
        );
      });
    };

    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const parts: ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const textBefore = text.substring(lastIndex, match.index);
        parts.push(<div key={`text-${lastIndex}`}>{renderTextSegment(textBefore)}</div>);
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
            customStyle={{ margin: 0, padding: "1rem", fontSize: "14px", background: "transparent" }}
          >
            {code}
          </SyntaxHighlighter>
        </div>
      );

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      const textAfter = text.substring(lastIndex);
      parts.push(<div key={`text-${lastIndex}`}>{renderTextSegment(textAfter)}</div>);
    }

    return parts.length > 0 ? <>{parts}</> : <div className="w-full">{renderTextSegment(text)}</div>;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-2 sm:gap-4 w-full ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar */}
      <div className="flex-shrink-0 mt-1">
        {isUser ? (
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-gradient-to-br border flex items-center justify-center shadow-lg from-slate-100 to-slate-200 border-slate-300">
            <Avatar className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl">
              <AvatarImage src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop" />
              <AvatarFallback className="bg-transparent font-medium text-xs sm:text-sm text-slate-600">U</AvatarFallback>
            </Avatar>
          </div>
        ) : (
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-gradient-to-br border flex items-center justify-center overflow-hidden from-indigo-50 to-indigo-100/50 border-indigo-200 shadow-sm">
            <Avatar className="w-full h-full rounded-none">
              <AvatarImage src="/images/Luna.png" className="object-cover" />
              <AvatarFallback className="bg-transparent rounded-none">
                <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600" />
              </AvatarFallback>
            </Avatar>
          </div>
        )}
      </div>

      {/* Message Content */}
      <div className={`flex flex-col max-w-[88%] sm:max-w-[80%] ${isUser ? "items-end" : "items-start"} min-w-0 w-full`}>
        <div className="flex items-center gap-2 mb-1 px-1">
          {isUser ? (
            <>
              <span className="text-[10px] sm:text-[11px] font-medium text-slate-400">{message.timestamp}</span>
              <span className="text-xs sm:text-[13px] font-semibold tracking-wide text-slate-700">{t.you}</span>
            </>
          ) : (
            <>
              <span className="text-xs sm:text-[13px] font-semibold tracking-wide text-indigo-600">
                {t.aiLabel}
              </span>
              <span className="text-[10px] sm:text-[11px] font-medium text-slate-400">{message.timestamp}</span>
            </>
          )}
        </div>

        <div
          className={`px-3.5 sm:px-5 py-3 sm:py-4 rounded-[16px] sm:rounded-[20px] shadow-xl backdrop-blur-md ${isUser
            ? "rounded-tr-sm bg-indigo-600 text-white shadow-[0_4px_15px_rgba(79,70,229,0.15)]"
            : "rounded-tl-sm bg-white border border-indigo-100 text-slate-700 shadow-sm"
            }`}
        >
          {message.image && (
            <div className="mb-4 overflow-hidden rounded-xl border border-white/10">
              <img src={message.image} alt="Attachment" className="w-full max-w-sm h-auto object-cover" />
            </div>
          )}
          <div className={`prose prose-p:leading-relaxed max-w-none text-sm sm:text-[15px] ${!isUser ? "prose-slate text-slate-700" : "prose-invert text-white/95"}`}>
            {renderSearchingIndicator()}
            {renderMessageContent(message.text)}
          </div>
        </div>

        {/* Skeleton Loader */}
        {message.productsLoading && (
          <div
            className="mt-4 flex gap-3 sm:gap-4 overflow-x-auto pb-4 pt-1 w-full max-w-full"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="w-[260px] sm:w-[290px] h-[340px] sm:h-[380px] shrink-0 rounded-2xl border p-4 flex flex-col justify-between backdrop-blur-md animate-pulse bg-white/40 border-indigo-50/50"
              >
                <div className="flex flex-col gap-3">
                  <div className="w-16 h-4 rounded-full bg-slate-200" />
                  <div className="w-full h-[120px] sm:h-[140px] rounded-xl flex items-center justify-center bg-slate-50">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-slate-100" />
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="w-3.5 h-3.5 rounded-full bg-slate-200" />
                    <div className="w-12 h-3 rounded bg-slate-200" />
                  </div>
                  <div className="w-3/4 h-5 rounded bg-slate-200" />
                  <div className="w-1/2 h-6 rounded bg-indigo-100/50" />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 h-8 sm:h-9 rounded-xl bg-slate-100" />
                  <div className="flex-1 h-8 sm:h-9 rounded-xl bg-indigo-100" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Product Cards Carousel */}
        {displayProducts.length > 0 && !message.productsLoading && (
          <div
            className="mt-4 flex gap-3 sm:gap-4 overflow-x-auto pb-4 pt-1 w-full max-w-full"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {displayProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                mode="agent"
                onAction={onAction}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}