import { Avatar, AvatarFallback, AvatarImage } from "./components/ui/avatar";
import { Send, Sparkles, Globe, HelpCircle, User, LogOut, ChevronRight, MessageSquare, ShoppingBag, Cpu, Download, History, RefreshCw } from "lucide-react";
import { useState, useRef, useEffect, lazy, Suspense, useMemo } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import ProductCard, { Product } from "./components/ui/ProductCard";
import { cn } from "./components/ui/utils";
import { translations, type Lang } from "../i18n/translations";
import { auth, googleProvider } from "./utils/firebase";
const ProductCatalog = lazy(() => import("./components/ProductCatalog"));
import { signInWithPopup } from "firebase/auth";

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
        specs: typeof p.specs === "object" && p.specs !== null
          ? Object.fromEntries(
              Object.entries(p.specs).map(([k, v]) => [k, String(v ?? "-")])
            )
          : {},
        tags: Array.isArray(p.tags) ? (p.tags as string[]) : ["Toko IRIN Celluler"],
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
 * Helper to clean a specific bracketed tag (like [PRODUCTS:... or [PENELUSURAN:...)
 * by finding balanced brackets while handling potential quoted strings inside.
 */
function removeBracketedTag(text: string, prefix: string): string {
  let index = text.indexOf(prefix);
  while (index !== -1) {
    let bracketCount = 1;
    let inString = false;
    let escaped = false;
    let i = index + prefix.length;
    
    for (; i < text.length; i++) {
      const char = text[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
      } else {
        if (char === '"') {
          inString = true;
        } else if (char === '[') {
          bracketCount++;
        } else if (char === ']') {
          bracketCount--;
          if (bracketCount === 0) {
            i++; // include the closing bracket
            break;
          }
        }
      }
    }
    // Remove the block from index to i
    text = text.slice(0, index) + text.slice(i);
    index = text.indexOf(prefix);
  }
  return text;
}

/**
 * Hapus blok [PRODUCTS:{...}] atau [PRODUCTS:id1,id2,id3] dari teks agar tidak muncul mentah di chat bubble.
 */
export function cleanTextFromProducts(text: string): string {
  let cleaned = removeBracketedTag(text, "[PRODUCTS:");
  cleaned = removeBracketedTag(cleaned, "[PENELUSURAN:");
  return cleaned.trimEnd();
}

export const parseProductsFromText = parseProductsFromResponse; // backward compat alias

interface PendingAction {
  action_id: string;
  tool_name: string;
  tool_args: Record<string, any>;
  session_id: string;
  admin_role: string;
  risk_level: "critical" | "high" | "moderate";
  summary: {
    operation: string;
    tool_name: string;
    collection: string;
    risk_level: string;
    filter?: string;
    hapus_semua?: boolean;
    update?: string;
    update_semua?: boolean;
    dokumen?: string;
    jumlah_dokumen?: number | string;
    keyword?: string;
    limit?: number;
    platform?: string;
    detail?: string;
  };
  affected_count: number;
  created_at: string;
  expires_at: string;
  ttl_seconds: number;
  status: string;
}

interface Message {
  id: number;
  sender: "user" | "ai";
  text: string;
  timestamp: string;
  image?: string;
  products?: Product[];
  productsLoading?: boolean;
  rawText?: string;
  confirmationRequired?: PendingAction;
  actionResult?: { status: string; message: string } | null;
}

interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  avatar_url?: string;
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

// Build fallback quick prompts based on current language (outside component for stability)
function buildFallbackPrompts(currentLang: Lang): QuickPrompt[] {
  return [
    {
      id: "gaming",
      icon: "🎮",
      title: translations[currentLang].quickPrompts.gaming.title,
      description: translations[currentLang].quickPrompts.gaming.description,
      prompt: translations[currentLang].quickPrompts.gaming.prompt,
      color: "indigo",
    },
    {
      id: "compare",
      icon: "⚖️",
      title: translations[currentLang].quickPrompts.compare.title,
      description: translations[currentLang].quickPrompts.compare.description,
      prompt: translations[currentLang].quickPrompts.compare.prompt,
      color: "emerald",
    },
    {
      id: "audio",
      icon: "🎧",
      title: translations[currentLang].quickPrompts.audio.title,
      description: translations[currentLang].quickPrompts.audio.description,
      prompt: translations[currentLang].quickPrompts.audio.prompt,
      color: "violet",
    },
    {
      id: "power",
      icon: "⚡",
      title: translations[currentLang].quickPrompts.power.title,
      description: translations[currentLang].quickPrompts.power.description,
      prompt: translations[currentLang].quickPrompts.power.prompt,
      color: "rose",
    },
  ];
}

const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const baseUrl = isLocal ? "http://localhost:8000" : "https://linaagent.fastapicloud.dev";

export default function App() {
  // ─── Language State (persisted in localStorage) ──────────────────────────
  const [lang, setLang] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem("irin-lang");
      return (saved === "id" || saved === "en") ? saved : "id";
    } catch {
      return "id";
    }
  });

  const t = translations[lang];
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = location.pathname === "/catalog" ? "catalog" : "chat";
  const setActiveTab = (tab: "chat" | "catalog") => {
    navigate(tab === "catalog" ? "/catalog" : "/");
  };
  const [isLandingOpen, setIsLandingOpen] = useState<boolean>(() => {
    try {
      const saved = sessionStorage.getItem("irin-landing-dismissed");
      return saved !== "true";
    } catch {
      return true;
    }
  });

  const dismissLanding = () => {
    setIsLandingOpen(false);
    try {
      sessionStorage.setItem("irin-landing-dismissed", "true");
    } catch { /* noop */ }
  };

  const toggleLang = () => {
    const next: Lang = lang === "id" ? "en" : "id";
    setLang(next);
    try { localStorage.setItem("irin-lang", next); } catch { /* noop */ }
  };

  const [sessionId] = useState(() => "session-" + Math.random().toString(36).substring(2, 15) + "-" + Date.now());

  // ─── Guest & Logged In User State ───────────────────────────────────────
  const [guestUserId] = useState(() => {
    try {
      let id = localStorage.getItem("irin-guest-user-id");
      if (!id) {
        id = "guest-" + Math.random().toString(36).substring(2, 11) + "-" + Date.now();
        localStorage.setItem("irin-guest-user-id", id);
      }
      return id;
    } catch {
      return "guest-fallback-" + Date.now();
    }
  });

  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem("irin-user-profile");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // ─── Auth Modal State ───────────────────────────────────────────────────
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authPhone, setAuthPhone] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // ─── Complete Profile Modal State ───────────────────────────────────────
  const [isCompleteProfileOpen, setIsCompleteProfileOpen] = useState(false);
  const [completeName, setCompleteName] = useState("");
  const [completePhone, setCompletePhone] = useState("");
  const [completePassword, setCompletePassword] = useState("");
  const [completeProfileError, setCompleteProfileError] = useState("");
  const [completeProfileLoading, setCompleteProfileLoading] = useState(false);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    const endpoint = authMode === "login" ? `${baseUrl}/v1/auth/login` : `${baseUrl}/v1/auth/register`;

    try {
      const body = authMode === "login" 
        ? { email: authEmail, password: authPassword }
        : { name: authName, email: authEmail, phone: authPhone, password: authPassword };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Authentication failed");
      }

      // Success
      const loggedUser = data.user;
      const token = data.access_token;
      setUser(loggedUser);
      localStorage.setItem("irin-user-profile", JSON.stringify(loggedUser));
      if (token) {
        localStorage.setItem("irin-auth-token", token);
      }

      // Trigger session migration
      try {
        await fetch(`${baseUrl}/v1/auth/migrate-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            temp_session_id: sessionId,
            user_id: loggedUser.id
          })
        });
      } catch (err) {
        console.error("Session migration failed:", err);
      }

      setIsAuthModalOpen(false);
      setAuthEmail("");
      setAuthPassword("");
      setAuthName("");
      setAuthPhone("");

      // Check if profile is incomplete (missing WhatsApp/phone)
      if (!loggedUser.phone || !loggedUser.phone.trim()) {
        setCompleteName(loggedUser.name || "");
        setCompletePhone("");
        setCompleteProfileError("");
        setIsCompleteProfileOpen(true);
      }
    } catch (err: any) {
      setAuthError(err.message || "Something went wrong");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("irin-user-profile");
    localStorage.removeItem("irin-auth-token");
    window.location.reload();
  };

  const handleGoogleLogin = async () => {
    setAuthError("");
    setAuthLoading(true);

    // Safety timeout fallback
    const safetyTimeout = setTimeout(() => {
      setAuthLoading(false);
    }, 30000);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();

      const authResponse = await fetch(`${baseUrl}/v1/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: idToken })
      });

      const data = await authResponse.json();
      if (!authResponse.ok) {
        throw new Error(data.detail || "Google Login failed");
      }

      const loggedUser = data.user;
      const token = data.access_token;
      
      setUser(loggedUser);
      localStorage.setItem("irin-user-profile", JSON.stringify(loggedUser));
      if (token) {
        localStorage.setItem("irin-auth-token", token);
      }

      try {
        await fetch(`${baseUrl}/v1/auth/migrate-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            temp_session_id: sessionId,
            user_id: loggedUser.id
          })
        });
      } catch (err) {
        console.error("Session migration failed:", err);
      }

      setIsAuthModalOpen(false);

      // Check if profile is incomplete (missing WhatsApp/phone)
      if (!loggedUser.phone || !loggedUser.phone.trim()) {
        setCompleteName(loggedUser.name || "");
        setCompletePhone("");
        setCompleteProfileError("");
        setIsCompleteProfileOpen(true);
      }
    } catch (err: any) {
      if (err.code === "auth/popup-closed-by-user" || err.message?.includes("closed-by-user")) {
        setAuthError(lang === "id" ? "Masuk dengan Google dibatalkan oleh pengguna." : "Google Sign-In was cancelled by user.");
      } else if (err.code === "auth/cancelled-popup-request" || err.message?.includes("cancelled-popup-request")) {
        setAuthError(lang === "id" ? "Proses masuk dibatalkan." : "Sign-in request cancelled.");
      } else {
        setAuthError(err.message || "Google Login failed");
      }
    } finally {
      clearTimeout(safetyTimeout);
      setAuthLoading(false);
    }
  };

  const handleCompleteProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCompleteProfileError("");
    setCompleteProfileLoading(true);

    try {
      if (!user) {
        throw new Error("Sesi pengguna tidak aktif.");
      }

      const phoneClean = completePhone.trim();
      if (!phoneClean) {
        throw new Error(lang === "id" ? "Nomor WhatsApp wajib diisi." : "WhatsApp number is required.");
      }

      if (!/^\+628\d{8,14}$/.test(phoneClean)) {
        throw new Error(
          lang === "id"
            ? "Nomor WhatsApp harus diawali dengan +628 (pola Indonesia) dan berisi 9 hingga 15 digit angka (Contoh: +628123456789)."
            : "WhatsApp number must start with +628 (Indonesian pattern) and contain 9 to 15 digits (Example: +628123456789)."
        );
      }

      if (!completeName.trim()) {
        throw new Error(lang === "id" ? "Nama lengkap wajib diisi." : "Full name is required.");
      }

      if (!completePassword.trim() || completePassword.trim().length < 6) {
        throw new Error(
          lang === "id"
            ? "Kata sandi wajib diisi dan terdiri dari minimal 6 karakter."
            : "Password is required and must be at least 6 characters long."
        );
      }

      const response = await fetch(`${baseUrl}/v1/auth/update-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          phone: phoneClean,
          name: completeName.trim() || undefined,
          password: completePassword.trim() || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Gagal memperbarui profil.");
      }

      const updatedUser = data.user;
      setUser(updatedUser);
      localStorage.setItem("irin-user-profile", JSON.stringify(updatedUser));

      setIsCompleteProfileOpen(false);
      setCompletePhone("");
      setCompleteName("");
      setCompletePassword("");
    } catch (err: any) {
      setCompleteProfileError(err.message || "Something went wrong");
    } finally {
      setCompleteProfileLoading(false);
    }
  };

  // ─── Quick Prompts: fetch dari API ──────────────────────────────────────────
  const [quickPrompts, setQuickPrompts] = useState<QuickPrompt[]>(() => buildFallbackPrompts("id"));

  // Sync quick prompts when language changes
  useEffect(() => {
    // Immediately set to fallback prompts for optimal UI responsiveness
    setQuickPrompts(buildFallbackPrompts(lang));

    fetch(`${baseUrl}/v1/agent/quick-prompts?lang=${lang}`)
      .then(res => res.ok ? res.json() : Promise.reject(res.status))
      .then(data => {
        if (Array.isArray(data?.prompts) && data.prompts.length > 0) {
          setQuickPrompts(data.prompts);
        }
      })
      .catch(() => {
        // Fallback is already set
      });
  }, [lang]);

  const buildWelcomeMessage = (currentLang: Lang): Message => ({
    id: 1,
    sender: "ai",
    text: translations[currentLang].welcomeMessage,
    timestamp: new Date().toLocaleTimeString(currentLang === "id" ? "id-ID" : "en-US", { hour: "2-digit", minute: "2-digit" }),
  });

  const [messages, setMessages] = useState<Message[]>(() => [buildWelcomeMessage("id")]);

  const pendingBookingProduct = useMemo(() => {
    if (!user) return null;
    let rejectedProduct: string | null = null;
    let userAskedAgain = false;
    
    // Look backwards through messages
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.sender === "ai") {
        const text = msg.text.toLowerCase();
        if (text.includes("fitur booking") && (text.includes("login") || text.includes("masuk"))) {
          const match = msg.text.match(/proses booking \**([^*]+?)\** dengan cepat/i) || msg.text.match(/proses booking (.*?) dengan cepat/i);
          if (match && match[1]) {
            rejectedProduct = match[1].trim();
            break;
          }
        }
      } else if (msg.sender === "user") {
        if (msg.text.toLowerCase().includes("booking")) {
          userAskedAgain = true;
        }
      }
    }
    
    return userAskedAgain ? null : rejectedProduct;
  }, [messages, user]);

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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Action handler for Product Card buttons
  const handleProductAction = (action: "check_stock" | "view_specs" | "booking", product: Product) => {
    const currentT = translations[lang];
    if (action === "check_stock") {
      handleSendMessage(currentT.checkStockPrompt(product.name));
    } else if (action === "view_specs") {
      handleSendMessage(currentT.viewSpecsPrompt(product.name));
    } else if (action === "booking") {
      handleSendMessage(currentT.bookingPrompt(product.name));
    }
  };

  const handleCatalogProductAction = (action: "check_stock" | "view_specs" | "booking", product: Product) => {
    setActiveTab("chat");
    setTimeout(() => {
      handleProductAction(action, product);
    }, 100);
  };

  const handleResolveHITL = (messageId: number, result: { status: string; message: string }) => {
    setMessages(prev => prev.map(msg => msg.id === messageId ? { ...msg, actionResult: result } : msg));
    if (result.status === "executed") {
      handleSendMessage(lang === "id" ? "setuju" : "confirm");
    } else {
      handleSendMessage(lang === "id" ? "batal" : "cancel");
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);



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

    const isMobile = window.innerWidth < 768 || /Mobi|Android|iPhone/i.test(navigator.userAgent);
    if (!isMobile) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 10);
    }

    try {
      const endpoint = `${baseUrl}/v1/agent/chat`;

      const token = localStorage.getItem("irin-auth-token");
      const headersInit: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
      };
      if (token) {
        headersInit["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: headersInit,
        body: JSON.stringify({
          user_id: user ? user.id : guestUserId,
          session_id: sessionId,
          lang: lang,
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
      let currentConfirmation: PendingAction | undefined = undefined;

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
                } else if (data.confirmation_required) {
                  currentConfirmation = data.confirmation_required;
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
                  confirmationRequired: currentConfirmation,
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
                      confirmationRequired: currentConfirmation || msg.confirmationRequired,
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
          Premium Minimalist Tech Grid Background (Apple/Samsung Style)
      ============================================================ */}
      <div 
        className="absolute inset-0 overflow-hidden bg-gradient-to-b from-[#f8fafc] via-[#f1f5f9] to-[#e2e8f0]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(99, 102, 241, 0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99, 102, 241, 0.015) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
          backgroundPosition: "center top"
        }}
      >
        {/* Soft elegant radial ambient light behind the main container */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(circle at 50% 30%, rgba(99, 102, 241, 0.04) 0%, transparent 70%)"
          }}
        />

        {/* CSS Aurora / Mesh Gradient (Hidden on Mobile) */}
        <div className="hidden sm:block absolute inset-0 pointer-events-none opacity-40">
          <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-indigo-400 mix-blend-multiply filter blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />
          <div className="absolute top-[20%] -right-[10%] w-[40%] h-[50%] rounded-full bg-purple-400 mix-blend-multiply filter blur-[120px] animate-pulse" style={{ animationDuration: '10s', animationDelay: '1s' }} />
          <div className="absolute -bottom-[10%] left-[20%] w-[50%] h-[40%] rounded-full bg-blue-300 mix-blend-multiply filter blur-[120px] animate-pulse" style={{ animationDuration: '12s', animationDelay: '2s' }} />
        </div>
      </div>

      {/* Main Chat App Container */}
      <div className="relative z-10 w-full max-w-4xl h-screen flex flex-col backdrop-blur-3xl border-x shadow-2xl bg-white/60 border-slate-200/50 shadow-[0_0_40px_rgba(0,0,0,0.05)]">

        {/* IRIN Cellular Store Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-3 py-2 sm:px-6 sm:py-4 flex items-center justify-between shrink-0 relative overflow-hidden border-b border-indigo-900/50">
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-400 via-transparent to-transparent"></div>
          <div className="relative z-10 flex items-center gap-2 sm:gap-4">
            <div className="w-8 h-8 sm:w-12 sm:h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg sm:rounded-xl shadow-[0_0_20px_rgba(99,102,241,0.4)] flex items-center justify-center border border-indigo-400/50">
              <Sparkles className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-white font-extrabold text-[13px] sm:text-xl tracking-tight flex items-center gap-2">
                IRIN Cellular
                <span className="bg-indigo-500/30 text-indigo-200 text-[10px] px-2 py-0.5 rounded-full border border-indigo-500/30 hidden sm:inline-flex shadow-sm">Official</span>
              </h1>
              <p className="text-indigo-200/80 text-[10px] sm:text-xs font-medium tracking-wide">Premium Gadget & Authorized Reseller</p>
            </div>
          </div>
          <div className="hidden sm:flex relative z-10 items-center gap-4 text-indigo-100 text-xs font-semibold">
            <div className="flex items-center gap-1.5 bg-black/20 px-3 py-1.5 rounded-full backdrop-blur-sm border border-white/10 shadow-inner">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span>
              Toko Buka
            </div>
          </div>
        </div>

        {/* Agent Header */}
        <header className="relative z-20 px-3 py-2 sm:px-6 sm:py-4 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white/70 backdrop-blur-md">
          {/* Brand */}
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="relative flex items-center justify-center w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-50 border border-indigo-200 shadow-[0_0_15px_rgba(99,102,241,0.1)] overflow-hidden">
              <Avatar className="w-full h-full rounded-none">
                <AvatarImage src="/images/Lina.png" className="object-cover" />
                <AvatarFallback className="bg-transparent rounded-none">
                  <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600" />
                </AvatarFallback>
              </Avatar>
            </div>
            <div>
              <h1 className="text-sm sm:text-xl font-bold tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-600">
                {t.aiHeader}
              </h1>
              <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1">
                <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)] animate-pulse" />
                <span className="text-[10px] sm:text-xs font-semibold tracking-wide uppercase text-indigo-600">
                  {t.agentOnline}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
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

            {/* Help / Guide Button */}
            <button
              onClick={() => setIsHelpOpen(true)}
              title="Help / Panduan Penggunaan"
              className="flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 bg-slate-100/80 hover:bg-indigo-50 hover:border-indigo-200 transition-all duration-300 shadow-sm group shrink-0"
            >
              <HelpCircle className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-500 transition-colors" />
            </button>

            {/* Auth Button */}
            {user ? (
              <div className="relative shrink-0" ref={profileRef}>
                {/* Profile Avatar Button */}
                <button
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold shadow-sm shrink-0 select-none cursor-pointer transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500 overflow-hidden"
                >
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" />
                  ) : (
                    user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
                  )}
                </button>

                {/* Profile Dropdown Popover */}
                {isProfileOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-100 rounded-2xl shadow-xl p-4 space-y-3.5 z-50 animate-in fade-in slide-in-from-top-2 duration-250">
                    {/* User Info Header */}
                    <div className="flex items-center gap-3 text-left">
                      {user.avatar_url ? (
                        <img src={user.avatar_url} alt={user.name} className="w-9 h-9 rounded-full object-cover shadow-inner shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-inner shrink-0 bg-indigo-600">
                          {user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1 text-left">
                        <p className="text-xs font-bold text-slate-800 truncate">
                          {user.name}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {user.email}
                        </p>
                      </div>
                    </div>

                    <div className="border-t border-slate-100" />

                    {/* Role Status Badge */}
                    <div className="space-y-1 text-left">
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Role Aktif</span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100/50 uppercase tracking-wide">
                        {user.role === "superadmin" ? "🛡️ Superadmin" : user.role === "sales" ? "💼 Sales" : `👤 ${user.role}`}
                      </span>
                    </div>

                    <div className="border-t border-slate-100" />

                    {/* Booking History Button */}
                    <button
                      onClick={() => {
                        setIsProfileOpen(false);
                        setActiveTab("chat");
                        setTimeout(() => {
                          handleSendMessage(lang === "id" ? "Tolong cek riwayat booking saya" : "Please check my booking history");
                        }, 100);
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100/80 rounded-xl transition-all cursor-pointer text-center"
                    >
                      <History className="w-3.5 h-3.5 text-indigo-500" />
                      {lang === "id" ? "Riwayat Booking" : "Booking History"}
                    </button>

                    <div className="border-t border-slate-100" />

                    {/* Logout Button */}
                    <button
                      onClick={() => {
                        handleLogout();
                        setIsProfileOpen(false);
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100/80 rounded-xl transition-all cursor-pointer text-center"
                    >
                      <LogOut className="w-3.5 h-3.5 text-rose-500" />
                      {t.logoutBtn} (Logout)
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => {
                  setAuthMode("login");
                  setIsAuthModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100 hover:border-indigo-300 text-indigo-600 transition-all duration-300 shadow-sm text-xs font-bold active:scale-95 cursor-pointer mr-1 group"
              >
                <User className="w-3.5 h-3.5 text-indigo-500 group-hover:text-indigo-600" />
                <span>{t.loginBtn}</span>
              </button>
            )}
          </div>
        </header>

        {/* Tab Navigation */}
        <div className="px-2 py-1.5 sm:px-4 sm:py-2 border-b border-slate-200 bg-white/30 backdrop-blur-md shrink-0 flex gap-2">
          {/* iOS-Style Sliding Active Pill */}
          <div className="flex-1 flex relative bg-slate-100/70 p-1 rounded-2xl border border-slate-200/50">
            <button
              onClick={() => setActiveTab("chat")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-1.5 px-2 sm:py-2.5 sm:px-4 rounded-xl text-[11px] sm:text-sm font-bold relative z-10 transition-colors duration-300 cursor-pointer focus:outline-none",
                activeTab === "chat" ? "text-white" : "text-slate-600 hover:text-slate-800"
              )}
            >
              {activeTab === "chat" && (
                <motion.div
                  layoutId="activeTabBackground"
                  className="absolute inset-0 bg-indigo-600 rounded-xl shadow-md -z-10"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <MessageSquare className="w-3.5 h-3.5" />
              <span>{t.chatTab}</span>
            </button>
            <button
              onClick={() => setActiveTab("catalog")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-1.5 px-2 sm:py-2.5 sm:px-4 rounded-xl text-[11px] sm:text-sm font-bold relative z-10 transition-colors duration-300 cursor-pointer focus:outline-none",
                activeTab === "catalog" ? "text-white" : "text-slate-600 hover:text-slate-800"
              )}
            >
              {activeTab === "catalog" && (
                <motion.div
                  layoutId="activeTabBackground"
                  className="absolute inset-0 bg-indigo-600 rounded-xl shadow-md -z-10"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>{t.catalogTab}</span>
            </button>
          </div>
        </div>

        {/* Tab Content Wrapper with Transition Animation */}
        <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="flex-1 flex flex-col min-h-0 w-full"
          >
            <>
              {/* Chat Area Container - visually toggled */}
              <div className={`flex-1 flex flex-col min-h-0 w-full ${activeTab === "chat" ? "flex" : "hidden"}`}>
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
                      onSendMessage={handleSendMessage}
                      onResolveHITL={handleResolveHITL}
                      user={user}
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
                            <AvatarImage src="/images/Lina.png" className="object-cover" />
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

                {/* Pending Booking Quick Prompt */}
                {pendingBookingProduct && (
                  <div className="px-3 sm:px-6 pb-2 pt-1 flex justify-center shrink-0">
                    <motion.button
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => handleSendMessage(lang === "id" ? `Tolong lanjutkan proses booking untuk ${pendingBookingProduct}` : `Please resume booking process for ${pendingBookingProduct}`)}
                      className="px-4 py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 text-sm font-medium rounded-full shadow-sm transition-colors flex items-center gap-2 border border-indigo-200"
                    >
                      <Sparkles className="w-4 h-4 text-indigo-500" />
                      {lang === "id" 
                        ? `Lanjutkan booking ${pendingBookingProduct}` 
                        : `Resume booking ${pendingBookingProduct}`}
                    </motion.button>
                  </div>
                )}

                {/* Input Area */}
                <div className="px-3 sm:px-6 pb-2 pt-1 sm:pb-3 sm:pt-2 shrink-0 bg-gradient-to-t from-white/80 to-transparent">
                  <div className="relative group">
                    {/* Glow effect behind input */}
                    <div className="absolute -inset-1 bg-gradient-to-r from-indigo-200/50 via-purple-200/50 to-indigo-200/50 rounded-[24px] blur-md opacity-70 group-focus-within:opacity-100 transition duration-500" />

                    <div className="relative flex items-center gap-1.5 sm:gap-3 backdrop-blur-xl border rounded-[20px] p-1.5 sm:p-2 shadow-2xl transition-all duration-300 bg-white/90 border-slate-200 focus-within:border-indigo-400 focus-within:bg-white">
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
                        className="flex-1 bg-transparent border-none shadow-none focus-visible:outline-none focus:outline-none focus:ring-0 text-[14px] sm:text-[15px] pl-3 sm:pl-4 pr-2 py-2 sm:py-3.5 resize-none h-10 sm:h-12 overflow-y-auto no-scrollbar text-slate-800 placeholder:text-slate-400"
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

                    <div className="text-center mt-1.5 sm:mt-3.5">
                      <span className="text-[10px] sm:text-[11px] text-slate-500/70 font-medium tracking-wide leading-tight sm:leading-normal">
                        {t.disclaimer}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Catalog Area Container - visually toggled */}
              <div className={`flex-1 flex flex-col min-h-0 w-full ${activeTab === "catalog" ? "flex" : "hidden"}`}>
                <Suspense fallback={
                <div className="flex items-center justify-center h-full min-h-[400px]">
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                    <p className="mt-4 text-slate-500 font-medium">Memuat Katalog...</p>
                  </div>
                </div>
              }>
                  <ProductCatalog lang={lang} onProductAction={handleCatalogProductAction} isActive={activeTab === "catalog"} />
                </Suspense>
              </div>
            </>
          </motion.div>
        </div>

        {/* Thin Footer for IRIN Cellular */}
        <footer className="shrink-0 border-t border-slate-200 bg-white/80 backdrop-blur-md px-4 py-2 flex flex-col sm:flex-row items-center justify-between gap-1 sm:gap-4 z-50 text-[10px] sm:text-xs text-slate-500 font-medium">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-indigo-700">© {new Date().getFullYear()} IRIN Cellular.</span>
            <span>All rights reserved.</span>
          </div>
          <div className="flex items-center gap-3">
            <a href="#" className="hover:text-indigo-600 transition-colors">Syarat & Ketentuan</a>
            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
            <a href="#" className="hover:text-indigo-600 transition-colors">Kebijakan Privasi</a>
            <span className="hidden sm:inline-block w-1 h-1 rounded-full bg-slate-300"></span>
            <span className="hidden sm:flex items-center gap-1"><Sparkles className="w-3 h-3 text-amber-500" /> Authorized Store</span>
          </div>
        </footer>
      </div>

      {/* ============================================================
          Premium Help Modal Dialog (Bilingual & Responsive)
      ============================================================ */}
      {isHelpOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-white/90 backdrop-blur-xl border border-indigo-100 shadow-2xl rounded-3xl overflow-hidden p-6 sm:p-8"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4 border-b pb-3 border-indigo-50/50">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5.5 h-5.5 text-indigo-600" />
                <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-800">
                  {t.helpTitle}
                </h2>
              </div>
              <button 
                onClick={() => setIsHelpOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {/* Intro */}
            <p className="text-sm text-slate-600 mb-6 font-medium leading-relaxed">
              {t.helpIntro}
            </p>

            {/* Features List */}
            <div className="flex-1 overflow-y-auto space-y-5 pr-1.5 scrollbar-thin">
              {/* Rec */}
              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0 text-lg">
                  📱
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-800 mb-0.5">{t.helpFeatures.rec.title}</h3>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{t.helpFeatures.rec.desc}</p>
                </div>
              </div>

              {/* Card */}
              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0 text-lg">
                  ⚙️
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-800 mb-0.5">{t.helpFeatures.card.title}</h3>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{t.helpFeatures.card.desc}</p>
                </div>
              </div>

              {/* Search */}
              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0 text-lg">
                  🌐
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-800 mb-0.5">{t.helpFeatures.search.title}</h3>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{t.helpFeatures.search.desc}</p>
                </div>
              </div>

              {/* Book */}
              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0 text-lg">
                  🛍️
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-800 mb-0.5">{t.helpFeatures.book.title}</h3>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{t.helpFeatures.book.desc}</p>
                </div>
              </div>
            </div>

            {/* Footer Button */}
            <div className="mt-6 pt-4 border-t border-indigo-50/50 flex justify-end">
              <button
                onClick={() => setIsHelpOpen(false)}
                className="px-5 py-2.5 sm:px-6 sm:py-3 rounded-xl bg-indigo-600 text-white font-bold text-xs sm:text-sm hover:bg-indigo-500 shadow-md shadow-indigo-100 hover:shadow-lg transition-all duration-300"
              >
                {t.helpClose}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ============================================================
          Premium Auth Modal Dialog (Bilingual & Glassmorphic)
      ============================================================ */}
      {isAuthModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-md bg-white/95 backdrop-blur-xl border border-indigo-100 shadow-2xl rounded-3xl overflow-hidden p-6 sm:p-8"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6 border-b pb-3 border-indigo-50/50">
              <div className="flex items-center gap-2">
                <User className="w-5.5 h-5.5 text-indigo-600 animate-pulse" />
                <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-800">
                  {authMode === "login" ? t.loginTitle : t.registerTitle}
                </h2>
              </div>
              <button 
                onClick={() => {
                  setIsAuthModalOpen(false);
                  setAuthError("");
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Error Message */}
            {authError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-semibold">
                {authError}
              </div>
            )}

            {/* Google Sign-In Button Container */}
            <div className="mt-2 mb-4">
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={authLoading}
                className="w-full flex justify-center items-center gap-3 h-[46px] rounded-xl border border-slate-200 bg-white shadow-sm transition hover:bg-slate-50 active:scale-[0.98] cursor-pointer"
              >
                {authLoading ? (
                  <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <img src="/google.svg" alt="Google" className="w-5 h-5 object-contain" />
                    <span className="text-sm font-bold text-slate-700">{t.loginBtn} {lang === "id" ? "dengan Google" : "with Google"}</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ============================================================
          Premium Lengkapi Profil Modal Dialog (Glassmorphic)
      ============================================================ */}
      {isCompleteProfileOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-md bg-white/95 backdrop-blur-xl border border-indigo-100 shadow-2xl rounded-3xl overflow-hidden p-6 sm:p-8"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4 border-b pb-3 border-indigo-50/50">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5.5 h-5.5 text-indigo-600 animate-bounce" />
                <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-800">
                  {lang === "id" ? "Lengkapi Profil Anda" : "Complete Your Profile"}
                </h2>
              </div>
            </div>

            <p className="text-xs text-slate-500 mb-4 leading-relaxed font-medium">
              {lang === "id" 
                ? "Selamat! Akun Anda aktif. Silakan lengkapi data penting berikut agar asisten Lina dapat memproses booking produk ke WhatsApp Anda secara otomatis tanpa perlu menanyakan data Anda berulang kali di masa mendatang. 😊"
                : "Welcome! Your account is active. Please complete the following details so Lina can automatically book products for you in the future without asking for details repeatedly. 😊"}
            </p>

            {/* Error Message */}
            {completeProfileError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-semibold">
                {completeProfileError}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleCompleteProfileSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400">
                  {lang === "id" ? "Alamat Email (Otomatis dari Google)" : "Email Address (Auto from Google)"}
                </label>
                <input
                  type="email"
                  disabled
                  readOnly
                  value={user?.email || ""}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-slate-100/80 text-sm text-slate-400 cursor-not-allowed select-none focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600">
                  {lang === "id" ? "Nama Lengkap" : "Full Name"}
                </label>
                <input
                  type="text"
                  required
                  value={completeName}
                  onChange={(e) => setCompleteName(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-indigo-400 focus:outline-none text-sm text-slate-800 transition-all duration-200 shadow-sm"
                  placeholder="e.g. Amamiya Kun"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600">
                  {lang === "id" ? "Nomor WhatsApp Aktif" : "Active WhatsApp Number"}
                </label>
                <div className="flex items-center gap-0 w-full">
                  <span className="bg-slate-100 border border-slate-200 border-r-0 rounded-l-xl px-4 h-11 flex items-center text-sm text-slate-500 font-bold select-none">
                    +62
                  </span>
                  <input
                    type="text"
                    required
                    value={(() => {
                      let clean = completePhone.trim();
                      if (clean.startsWith("+62")) return clean.substring(3);
                      if (clean.startsWith("62")) return clean.substring(2);
                      if (clean.startsWith("0")) return clean.substring(1);
                      return clean;
                    })()}
                    onChange={(e) => {
                      const cleanVal = e.target.value.replace(/[^0-9]/g, "");
                      setCompletePhone(cleanVal ? `+62${cleanVal}` : "");
                    }}
                    onKeyDown={(e) => {
                      if (["e", "E", "+", "-", ".", ","].includes(e.key)) {
                        e.preventDefault();
                      }
                    }}
                    className="flex-1 h-11 px-4 rounded-r-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-indigo-400 focus:outline-none text-sm text-slate-800 transition-all duration-200 shadow-sm"
                    placeholder="8123456789"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600">
                  {lang === "id" ? "Buat Kata Sandi" : "Create Password"}
                </label>
                <input
                  type="password"
                  required
                  value={completePassword}
                  onChange={(e) => setCompletePassword(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-indigo-400 focus:outline-none text-sm text-slate-800 transition-all duration-200 shadow-sm"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={completeProfileLoading}
                className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all duration-300 disabled:opacity-50 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
              >
                {completeProfileLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (lang === "id" ? "Simpan & Mulai Percakapan" : "Save & Start Chat")}
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {isLandingOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-slate-900/50 backdrop-blur-md overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full md:w-[95%] lg:w-[92%] xl:w-[90%] max-w-7xl h-auto my-auto bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 shadow-2xl rounded-none overflow-hidden flex flex-col md:flex-row transition-all duration-500"
          >
            {/* Top Accent Line decoration (Minimalist and elegant) */}
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-indigo-500/90 z-25" />

            {/* Corner crosshairs for a technical/minimalist blueprint aesthetic */}
            <div className="absolute top-2 left-2 text-slate-300/40 dark:text-slate-700/40 font-mono text-[10px] pointer-events-none select-none hidden md:block">┌ IRIN CELLULER ┐</div>
            <div className="absolute bottom-2 right-2 text-slate-300/40 dark:text-slate-700/40 font-mono text-[10px] pointer-events-none select-none hidden md:block">└ v0.0.1 ┘</div>

            {/* Left Column: Slogan & Visual Cover (Apple/Samsung Aesthetic) - Hidden on Mobile */}
            <div className="relative w-full md:w-[38%] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8 sm:p-10 lg:p-12 lg:py-16 hidden md:flex flex-col justify-between overflow-hidden text-white border-r border-slate-800 shrink-0 rounded-none animate-fade-in">
              {/* Mesh background effects (reduced opacity for softer feel) */}
              <div className="absolute inset-0 opacity-10 mix-blend-overlay bg-[radial-gradient(circle_at_30%_30%,#818cf8,transparent_50%),radial-gradient(circle_at_70%_70%,#c084fc,transparent_50%)]" />
              <div 
                className="absolute inset-0 opacity-[0.03] pointer-events-none"
                style={{
                  backgroundImage: `
                    linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px)
                  `,
                  backgroundSize: "20px 20px"
                }}
              />
              
              {/* Brand Top */}
              <div className="relative z-10 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-none bg-white/5 border border-white/10 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-indigo-300 animate-pulse" />
                </div>
                <span className="font-bold tracking-[0.2em] text-xs sm:text-sm text-slate-300 uppercase">{t.brandName}</span>
              </div>

              {/* Center: Glowing Aura & Slogan */}
              <div className="relative z-10 my-10 flex flex-col items-center md:items-start text-center md:text-left">
                {/* Geometric square wrapper with avatar */}
                <div className="relative w-28 h-28 sm:w-32 sm:h-32 lg:w-36 lg:h-36 flex items-center justify-center bg-slate-900/60 border border-slate-800 shadow-[0_0_20px_rgba(99,102,241,0.03)] mb-8">
                  <div className="absolute inset-1 border border-slate-850" />
                  <div className="absolute -inset-1.5 border border-dashed border-slate-800/30 animate-pulse" />
                  <Avatar className="w-20 h-20 sm:w-24 sm:h-24 lg:w-28 lg:h-28 rounded-none border border-slate-800 overflow-hidden shadow-inner">
                    <AvatarImage src="/images/Lina.png" className="object-cover" />
                    <AvatarFallback className="bg-indigo-950/50">
                      <Sparkles className="w-10 h-10 text-indigo-300" />
                    </AvatarFallback>
                  </Avatar>
                </div>

                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-300 bg-indigo-500/10 border border-indigo-400/20 px-3.5 py-1.5 rounded-none mb-4 inline-block">
                  {lang === "id" ? "Asisten AI Lina" : "AI Consultant Lina"}
                </span>

                <h2 className="text-3xl sm:text-4xl lg:text-[40px] font-light leading-tight tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-slate-100 via-slate-200 to-indigo-200">
                  {t.landing.slogan}
                </h2>
                
                <p className="text-sm sm:text-base text-slate-350/90 font-normal mt-4 max-w-xs leading-relaxed">
                  {t.landing.subSlogan}
                </p>
              </div>

              {/* Footer text */}
              <div className="relative z-10 text-xs text-slate-500 font-semibold tracking-[0.1em] uppercase flex items-center gap-1.5 justify-center md:justify-start">
                <span className="w-1 h-1 bg-slate-600" />
                Powered by Gemini AI
              </div>
            </div>

            {/* Right Column: Greetings, Features, Actions */}
            <div className="w-full md:w-[62%] p-4 sm:p-8 md:p-12 lg:p-14 lg:py-16 flex flex-col justify-between bg-white dark:bg-slate-900 rounded-none relative">
              {/* Header Right: Language Selector & Auth Quick Actions */}
              <div className="flex items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-2 md:pb-4 mb-3 md:mb-6">
                {/* Language Switcher (Sharp corners) */}
                <button
                  onClick={toggleLang}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-none border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition duration-300 text-xs font-semibold text-slate-650 dark:text-slate-355 cursor-pointer animate-fade-in"
                >
                  <Globe className="w-3.5 h-3.5 text-slate-550" />
                  <span>{lang === "id" ? "ID" : "EN"}</span>
                  <span className="text-slate-455 font-normal">→</span>
                  <span className="text-indigo-500 dark:text-indigo-400">{lang === "id" ? "EN" : "ID"}</span>
                </button>

                {/* Login or user profile state */}
                {user ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{user.name}</span>
                    <span className="text-[10px] text-indigo-500 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded-none uppercase tracking-wider">{user.role}</span>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setAuthMode("login");
                      setIsAuthModalOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-none border border-slate-200 dark:border-slate-800 bg-slate-50/50 hover:bg-slate-100/50 text-slate-700 dark:text-slate-300 transition text-xs font-semibold active:scale-95 cursor-pointer"
                  >
                    <User className="w-3.5 h-3.5 text-slate-550" />
                    <span>{t.loginBtn}</span>
                  </button>
                )}
              </div>

              {/* Body: Welcoming Description & Features Grid */}
              <div className="flex-1 space-y-3.5 md:space-y-8">
                {/* Mobile-only header (hidden on desktop) */}
                <div className="flex items-center gap-2.5 md:hidden p-2.5 rounded-none bg-slate-50 dark:bg-slate-900/60 border border-slate-150 dark:border-slate-800">
                  <Avatar className="w-10 h-10 rounded-none border border-slate-300 dark:border-slate-800 overflow-hidden shadow-inner shrink-0">
                    <AvatarImage src="/images/Lina.png" className="object-cover" />
                    <AvatarFallback className="bg-indigo-950/50">
                      <Sparkles className="w-5 h-5 text-indigo-300" />
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">{t.landing.slogan}</h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">{t.landing.subSlogan}</p>
                  </div>
                </div>

                <div>
                  <h3 className="hidden md:block text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-800 dark:text-slate-200">
                    {lang === "id" ? "Selamat Datang di IRIN Celluler!" : "Welcome to IRIN Celluler!"}
                  </h3>
                  <p className="text-[13px] sm:text-base lg:text-[17px] text-slate-500 dark:text-slate-400 mt-0.5 md:mt-3 font-normal leading-relaxed">
                    <span className="md:hidden">
                      {lang === "id" 
                        ? "Temukan gadget dan aksesoris impian Anda bersama Lina. Dapatkan rekomendasi akurat dan sistem booking WhatsApp otomatis!" 
                        : "Find your dream gadget with Lina. Get accurate recommendations and automated WhatsApp booking!"}
                    </span>
                    <span className="hidden md:inline">{t.landing.description}</span>
                  </p>
                </div>

                {/* Features Highlight (Premium Minimalist design with sharp corners and thin borders) - Hidden on Mobile */}
                <div className="hidden md:block space-y-3.5">
                  <h4 className="text-xs lg:text-sm font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">
                    {t.landing.featuresTitle}
                  </h4>

                  {/* Feature 1 */}
                  <div className="flex items-start gap-3.5 p-3.5 border border-slate-150 dark:border-slate-800/80 bg-slate-50/20 dark:bg-slate-900/20 hover:bg-slate-50 dark:hover:bg-slate-850/50 transition duration-300 rounded-none">
                    <div className="w-12 h-12 rounded-none border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center shrink-0 text-slate-600 dark:text-slate-355">
                      <MessageSquare className="w-5.5 h-5.5" />
                    </div>
                    <div>
                      <h5 className="text-sm sm:text-base font-bold text-slate-850 dark:text-slate-200">{t.landing.feature1Title}</h5>
                      <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{t.landing.feature1Desc}</p>
                    </div>
                  </div>

                  {/* Feature 2 */}
                  <div className="flex items-start gap-3.5 p-3.5 border border-slate-150 dark:border-slate-800/80 bg-slate-50/20 dark:bg-slate-900/20 hover:bg-slate-50 dark:hover:bg-slate-850/50 transition duration-300 rounded-none">
                    <div className="w-12 h-12 rounded-none border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center shrink-0 text-slate-600 dark:text-slate-355">
                      <Cpu className="w-5.5 h-5.5" />
                    </div>
                    <div>
                      <h5 className="text-sm sm:text-base font-bold text-slate-850 dark:text-slate-200">{t.landing.feature2Title}</h5>
                      <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{t.landing.feature2Desc}</p>
                    </div>
                  </div>

                  {/* Feature 3 */}
                  <div className="flex items-start gap-3.5 p-3.5 border border-slate-150 dark:border-slate-800/80 bg-slate-50/20 dark:bg-slate-900/20 hover:bg-slate-50 dark:hover:bg-slate-850/50 transition duration-300 rounded-none">
                    <div className="w-12 h-12 rounded-none border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center shrink-0 text-slate-600 dark:text-slate-355">
                      <ShoppingBag className="w-5.5 h-5.5" />
                    </div>
                    <div>
                      <h5 className="text-sm sm:text-base font-bold text-slate-850 dark:text-slate-200">{t.landing.feature3Title}</h5>
                      <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{t.landing.feature3Desc}</p>
                    </div>
                  </div>
                </div>

                {/* Mobile-only compact features grid (shows icons and titles side-by-side to save space) */}
                <div className="grid grid-cols-3 gap-2 md:hidden">
                  <div className="flex flex-col items-center text-center p-1.5 border border-slate-150 dark:border-slate-800/60 bg-slate-50/20 dark:bg-slate-900/20 rounded-none">
                    <MessageSquare className="w-4 h-4 text-indigo-500 mb-1" />
                    <span className="text-[9.5px] tracking-tight font-bold text-slate-700 dark:text-slate-300 leading-tight">{t.landing.feature1Title}</span>
                  </div>
                  <div className="flex flex-col items-center text-center p-1.5 border border-slate-150 dark:border-slate-800/60 bg-slate-50/20 dark:bg-slate-900/20 rounded-none">
                    <Cpu className="w-4 h-4 text-indigo-500 mb-1" />
                    <span className="text-[9.5px] tracking-tight font-bold text-slate-700 dark:text-slate-300 leading-tight">{t.landing.feature2Title}</span>
                  </div>
                  <div className="flex flex-col items-center text-center p-1.5 border border-slate-150 dark:border-slate-800/60 bg-slate-50/20 dark:bg-slate-900/20 rounded-none">
                    <ShoppingBag className="w-4 h-4 text-indigo-500 mb-1" />
                    <span className="text-[9.5px] tracking-tight font-bold text-slate-700 dark:text-slate-300 leading-tight">{t.landing.feature3Title}</span>
                  </div>
                </div>

                {/* Quick Start Topics Selector */}
                <div className="pt-0.5 md:pt-2">
                  <h4 className="text-[10px] md:text-xs lg:text-sm font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500 mb-1.5 md:mb-4">
                    {t.landing.quickStartTitle}
                  </h4>
                  <div className="grid grid-cols-2 gap-2.5 md:gap-3">
                    {quickPrompts.slice(0, 2).map((qp) => (
                      <button
                        key={qp.id}
                        onClick={() => {
                          dismissLanding();
                          handleSendMessage(qp.prompt);
                        }}
                        className="text-left p-2 sm:p-3 md:p-3.5 rounded-none border border-slate-150 dark:border-slate-850/80 bg-slate-50/40 dark:bg-slate-900/40 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 hover:border-slate-250 dark:hover:border-slate-700 transition duration-200 cursor-pointer group active:scale-[0.99]"
                      >
                        <div className="flex items-center gap-1.5 md:gap-2 mb-1 sm:mb-1.5">
                          <span className="text-xs sm:text-base shrink-0">{qp.icon}</span>
                          <span className="text-[11px] sm:text-sm font-bold text-slate-750 dark:text-slate-300 truncate group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors">
                            {qp.title}
                          </span>
                        </div>
                        <p className="text-[10px] sm:text-xs text-slate-405 dark:text-slate-500 truncate font-normal leading-none">{qp.description}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Call-to-action Button */}
              <div className="mt-4 md:mt-10 pt-3 md:pt-5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center md:justify-end gap-4">
                {/* Premium Monochrome CTA Button with sharp corners (centered and height-reduced on mobile) */}
                <button
                  onClick={dismissLanding}
                  className="w-full md:w-auto mx-auto md:mx-0 md:ml-auto px-5 py-2 md:px-8 md:py-2.5 rounded-none bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-slate-200 text-white dark:text-slate-900 font-bold text-xs sm:text-sm border border-slate-800 dark:border-slate-200 shadow-sm transition-all duration-300 active:scale-95 flex items-center justify-center gap-2 cursor-pointer group"
                >
                  <span>{t.landing.startBtn}</span>
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function CustomerHITLCard({
  action,
  result,
  onResolve,
  lang
}: {
  action: PendingAction;
  result: { status: string; message: string } | null;
  onResolve: (res: { status: string; message: string }) => void;
  lang: string;
}) {
  const [timeLeft, setTimeLeft] = useState(action.ttl_seconds);
  const [isExpired, setIsExpired] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const expiresAt = new Date(action.expires_at).getTime();
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        setIsExpired(true);
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [action.expires_at]);

  const handleDecision = async (decision: "approve" | "reject") => {
    setIsProcessing(true);
    try {
      const response = await fetch(`${baseUrl}/v1/admin/confirm-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action_id: action.action_id, decision })
      });
      if (response.ok) {
        onResolve({
          status: decision === "approve" ? "executed" : "cancelled",
          message: decision === "approve" 
            ? (lang === "id" ? "Booking berhasil dikonfirmasi oleh sistem (HITL)!" : "Booking successfully approved by system (HITL)!")
            : (lang === "id" ? "Booking dibatalkan." : "Booking cancelled.")
        });
      } else {
        const errData = await response.json();
        alert(errData.detail || "Gagal memproses aksi.");
      }
    } catch (err) {
      console.error(err);
      alert("Error memproses aksi.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (result) {
    const isSuccess = result.status === "executed";
    return (
      <div className={`mt-3 p-4 rounded-2xl border-2 transition-all duration-500 no-prose ${
        isSuccess ? "border-emerald-200 bg-emerald-50/80 text-emerald-800" : "border-slate-200 bg-slate-50/80 text-slate-600"
      }`}>
        <div className="flex items-center gap-2 mb-1.5 font-bold text-xs uppercase tracking-wider">
          {isSuccess ? "✅ Booking Terkonfirmasi" : "❌ Booking Dibatalkan"}
        </div>
        <p className="text-xs leading-relaxed opacity-90">{result.message}</p>
      </div>
    );
  }

  if (isExpired) {
    return (
      <div className="mt-3 p-4 rounded-2xl border-2 border-red-100 bg-red-50/50 text-red-700 text-xs no-prose">
        ⏰ {lang === "id" ? "Batas waktu konfirmasi (HITL) telah habis." : "Confirmation time window has expired."}
      </div>
    );
  }

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="mt-3 rounded-2xl border-2 border-indigo-100 bg-indigo-50/30 overflow-hidden shadow-md no-prose">
      <div className="px-4 py-2.5 bg-indigo-100/50 border-b border-indigo-100 flex items-center justify-between text-xs">
        <span className="font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
          🔑 {lang === "id" ? "Konfirmasi Diperlukan" : "Confirmation Required"}
        </span>
        <span className="font-mono text-indigo-700 flex items-center gap-1">
          ⏱️ {formatTime(timeLeft)}
        </span>
      </div>
      <div className="p-4 space-y-3">
        <div className="text-xs text-indigo-950 font-medium">
          {lang === "id" 
            ? "Apakah Anda ingin melanjutkan konfirmasi pemesanan ini?" 
            : "Do you want to confirm this booking reservation?"}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleDecision("reject")}
            disabled={isProcessing}
            className="flex-1 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          >
            {lang === "id" ? "Batalkan" : "Cancel"}
          </button>
          <button
            onClick={() => handleDecision("approve")}
            disabled={isProcessing}
            className="flex-1 py-2 text-xs font-bold rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 transition-all active:scale-95 cursor-pointer disabled:opacity-50 shadow-md shadow-indigo-200 flex items-center justify-center gap-1"
          >
            {isProcessing ? (
              <RefreshCw size={12} className="animate-spin" />
            ) : "👍"}
            {isProcessing ? (lang === "id" ? "Memproses..." : "Processing...") : (lang === "id" ? "Konfirmasi" : "Confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatMessage({
  message,
  lang,
  onAction,
  onSendMessage,
  onResolveHITL,
  user,
}: {
  message: Message;
  lang: Lang;
  onAction: (action: "check_stock" | "view_specs" | "booking", product: Product) => void;
  onSendMessage: (text: string) => void;
  onResolveHITL: (messageId: number, result: { status: string; message: string }) => void;
  user?: UserProfile | null;
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
      const parts: React.ReactNode[] = [];
      const linkRegex = /\[([\s\S]*?)\]\((https?:\/\/[^\)]+)\)/g;
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      let keyCounter = 0;

      const formatBold = (text: string) => {
        const boldParts = text.split(/(\*\*.*?\*\*)/g);
        return boldParts.map((part, i) => {
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

      while ((match = linkRegex.exec(content)) !== null) {
        if (match.index > lastIndex) {
          parts.push(<span key={`text-${keyCounter++}`}>{formatBold(content.substring(lastIndex, match.index))}</span>);
        }

        const linkText = match[1];
        const linkUrl = match[2];
        const isDownload = linkText.toLowerCase().includes("download");

        if (isDownload) {
          parts.push(
            <a
              key={`link-${keyCounter++}`}
              href={linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2.5 my-1 rounded-xl font-bold text-xs sm:text-sm tracking-wide transition-all duration-300 active:scale-95 cursor-pointer shadow-md shadow-indigo-500/10 decoration-transparent",
                !isUser
                  ? "bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-600 text-white border border-indigo-600/15"
                  : "bg-white text-indigo-600 hover:bg-slate-50 border border-white"
              )}
            >
              <Download className="w-3.5 h-3.5 shrink-0 animate-bounce" style={{ animationDuration: '2s' }} />
              <span>{linkText}</span>
            </a>
          );
        } else {
          parts.push(
            <a
              key={`link-${keyCounter++}`}
              href={linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "underline font-bold transition-all duration-200 hover:opacity-80",
                !isUser ? "text-indigo-600 hover:text-indigo-700" : "text-white hover:text-slate-100"
              )}
            >
              {linkText}
            </a>
          );
        }

        lastIndex = match.index + match[0].length;
      }

      if (lastIndex < content.length) {
        parts.push(<span key={`text-${keyCounter++}`}>{formatBold(content.substring(lastIndex))}</span>);
      }

      return parts;
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
              {user ? (
                <>
                  {user.avatar_url && <AvatarImage src={user.avatar_url} />}
                  <AvatarFallback className="bg-transparent font-medium text-xs sm:text-sm text-slate-600">
                    {user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                  </AvatarFallback>
                </>
              ) : (
                <>
                  <AvatarImage src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop" />
                  <AvatarFallback className="bg-transparent font-medium text-xs sm:text-sm text-slate-600">U</AvatarFallback>
                </>
              )}
            </Avatar>
          </div>
        ) : (
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-gradient-to-br border flex items-center justify-center overflow-hidden from-indigo-50 to-indigo-100/50 border-indigo-200 shadow-sm">
            <Avatar className="w-full h-full rounded-none">
              <AvatarImage src="/images/Lina.png" className="object-cover" />
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
            {message.confirmationRequired && (
              <CustomerHITLCard
                action={message.confirmationRequired}
                result={message.actionResult ?? null}
                lang={lang}
                onResolve={(res) => onResolveHITL(message.id, res)}
              />
            )}
            {(() => {
              if (isUser) return null;
              if (message.confirmationRequired) return null;
              const bkMatch = message.text.match(/BK-\d{8}-[A-Z0-9]{4}/i);
              if (!bkMatch) return null;
              const bookingCode = bkMatch[0];
              return (
                <div className="mt-3 pt-3 border-t border-slate-100/50 flex flex-wrap gap-2 no-prose">
                  <button
                    onClick={() => onSendMessage(
                      lang === "id"
                        ? `Tolong bantu hubungi admin untuk verifikasi manual booking ${bookingCode} (Human in the Loop)`
                        : `Please contact admin for manual verification of booking ${bookingCode} (Human in the Loop)`
                    )}
                    className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-all duration-300 active:scale-95 cursor-pointer border border-indigo-100"
                  >
                    🤝 {lang === "id" ? "Minta Verifikasi Manual (HITL)" : "Request Manual Review (HITL)"}
                  </button>
                </div>
              );
            })()}
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
                lang={lang}
                onAction={onAction}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}