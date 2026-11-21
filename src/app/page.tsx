"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type GeneratorScore = { name: string; percent: number };

type CheckResult = {
  aiPercent: number;
  realPercent: number;
  verdict: string;
  generators: GeneratorScore[];
  error: string | null;
};

type HistoryItem = {
  id: string;
  thumb: string;
  aiPercent: number;
  verdict: string;
  date: string;
};

const HISTORY_KEY = "maba-ai-detector-history";
const MAX_HISTORY = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function verdictColor(aiPercent: number): string {
  if (aiPercent < 20) return "text-emerald-400";
  if (aiPercent < 50) return "text-amber-400";
  return "text-accent";
}

/** Downscale an image to a small JPEG data URL so localStorage stays small. */
function makeThumbnail(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxSide = 160;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image load"));
    };
    img.src = url;
  });
}

function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is HistoryItem =>
        typeof x === "object" &&
        x !== null &&
        typeof (x as HistoryItem).id === "string" &&
        typeof (x as HistoryItem).thumb === "string" &&
        typeof (x as HistoryItem).aiPercent === "number",
    );
  } catch {
    return [];
  }
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Intentional: localStorage exists only in the browser, so history must be
  // read after mount. Lazy useState init would hydrate differently from the
  // server render, so the effect read is the correct pattern here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistory(loadHistory());
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const pickFile = useCallback((f: File | undefined | null) => {
    if (!f) return;
    if (!ACCEPTED_TYPES.includes(f.type)) {
      setError("Sirf JPG, PNG ya WebP photo chalegi");
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      setError("Photo 10 MB se bari hai — chhoti photo try karo");
      return;
    }
    setError(null);
    setResult(null);
    setImageUrl("");
    setFile(f);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(f);
    });
  }, []);

  const saveToHistory = useCallback(
    async (f: File | null, url: string, res: CheckResult) => {
      try {
        let thumb = "";
        if (f) {
          thumb = await makeThumbnail(f);
        } else if (url) {
          thumb = url;
        }
        const item: HistoryItem = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          thumb,
          aiPercent: res.aiPercent,
          verdict: res.verdict,
          date: new Date().toLocaleString("en-GB"),
        };
        setHistory((prev) => {
          const next = [item, ...prev].slice(0, MAX_HISTORY);
          try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
          } catch {
            // localStorage full or unavailable — history is best-effort only.
          }
          return next;
        });
      } catch {
        // Thumbnail failure must never break the result display.
      }
    },
    [],
  );

  const checkNow = useCallback(async () => {
    const url = imageUrl.trim();
    if (!file && !url) {
      setError("Pehle photo upload karo ya image ka link daalo");
      return;
    }
    if (!file && url && !/^https?:\/\//i.test(url)) {
      setError("Link sahi nahi hai — https:// se shuru hona chahiye");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const body = new FormData();
      if (file) body.append("media", file);
      else body.append("url", url);
      const res = await fetch("/api/check", { method: "POST", body });
      const data: CheckResult = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      setResult(data);
      void saveToHistory(file, url, data);
    } catch {
      setError("Server se jawab nahi mila — dobara try karo");
    } finally {
      setLoading(false);
    }
  }, [file, imageUrl, saveToHistory]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      // ignore
    }
  }, []);

  const hasInput = Boolean(file || imageUrl.trim());

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
      {/* Header */}
      <header className="text-center">
        <p className="text-sm font-semibold tracking-widest text-accent uppercase">
          MABA AI Detector
        </p>
        <h1 className="mt-2 text-3xl font-extrabold leading-tight sm:text-4xl">
          Photo AI hai ya Original?
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-zinc-400">
          Photo upload karo — hum batayenge wo kitne percent AI-generated
          hai aur kitne percent original.
        </p>
      </header>

      {/* Upload card */}
      <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
        <div
          role="button"
          tabIndex={0}
          aria-label="Photo upload karo"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            pickFile(e.dataTransfer.files?.[0]);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-10 text-center transition ${
            dragOver
              ? "border-accent bg-accent/10"
              : "border-zinc-700 hover:border-accent/70"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Upload ki hui photo"
              className="max-h-64 max-w-full rounded-lg object-contain"
            />
          ) : (
            <>
              <span className="text-4xl" aria-hidden="true">
                📷
              </span>
              <p className="mt-3 font-semibold">
                Photo yahan drag karo ya click kar ke chuno
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                JPG, PNG ya WebP — zyada se zyada 10 MB
              </p>
            </>
          )}
        </div>

        {file && (
          <p className="mt-3 text-center text-sm text-zinc-400">
            {file.name} — {(file.size / 1024 / 1024).toFixed(2)} MB
            <button
              type="button"
              className="ml-3 font-semibold text-accent hover:underline"
              onClick={() => {
                setFile(null);
                setPreviewUrl((old) => {
                  if (old) URL.revokeObjectURL(old);
                  return null;
                });
                setResult(null);
              }}
            >
              Hatao
            </button>
          </p>
        )}

        <div className="my-5 flex items-center gap-3 text-sm text-zinc-500">
          <span className="h-px flex-1 bg-line" />
          ya image ka link daalo
          <span className="h-px flex-1 bg-line" />
        </div>

        <input
          type="url"
          inputMode="url"
          placeholder="https://example.com/photo.jpg"
          value={imageUrl}
          onChange={(e) => {
            setImageUrl(e.target.value);
            if (e.target.value.trim()) {
              setFile(null);
              setPreviewUrl((old) => {
                if (old) URL.revokeObjectURL(old);
                return null;
              });
              setResult(null);
            }
          }}
          className="w-full rounded-lg border border-line bg-ink px-4 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-accent"
        />

        <button
          type="button"
          onClick={checkNow}
          disabled={loading || !hasInput}
          className="mt-5 w-full rounded-lg bg-accent px-5 py-3.5 text-base font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Check ho raha hai…" : "Check Karo"}
        </button>

        {error && (
          <p className="mt-4 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-center text-sm font-medium text-red-300">
            {error}
          </p>
        )}
      </section>

      {/* Result */}
      {result && !result.error && (
        <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
          <h2
            className={`text-center text-2xl font-extrabold ${verdictColor(result.aiPercent)}`}
          >
            {result.verdict}
          </h2>

          <div className="mt-6 space-y-5">
            <div>
              <div className="flex justify-between text-sm font-semibold">
                <span>AI-generated</span>
                <span className="text-accent">{result.aiPercent}%</span>
              </div>
              <div className="mt-2 h-4 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${result.aiPercent}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm font-semibold">
                <span>Original (asli)</span>
                <span className="text-emerald-400">{result.realPercent}%</span>
              </div>
              <div className="mt-2 h-4 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${result.realPercent}%` }}
                />
              </div>
            </div>
          </div>

          {result.generators.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-zinc-300">
                Kis AI tool se bani lagti hai:
              </h3>
              <ul className="mt-2 space-y-2">
                {result.generators.map((g) => (
                  <li
                    key={g.name}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="text-zinc-300">{g.name}</span>
                    <span className="flex flex-1 items-center gap-2">
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
                        <span
                          className="block h-full rounded-full bg-accent/80"
                          style={{ width: `${g.percent}%` }}
                        />
                      </span>
                      <span className="w-10 text-right font-semibold">
                        {g.percent}%
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-200">
            Ye ek probability hai, 100% yaqeen nahi — detector kabhi kabhi
            real photo ko bhi AI keh sakta hai.
          </p>
        </section>
      )}

      {/* History */}
      {history.length > 0 && (
        <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Pehle ki checks</h2>
            <button
              type="button"
              onClick={clearHistory}
              className="text-sm font-semibold text-accent hover:underline"
            >
              Clear karo
            </button>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Ye history sirf tumhare browser mein save hoti hai.
          </p>
          <ul className="mt-4 space-y-3">
            {history.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-lg border border-line bg-ink px-3 py-2"
              >
                {item.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.thumb}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-zinc-800 text-lg">
                    🖼️
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {item.verdict}
                  </span>
                  <span className="block text-xs text-zinc-500">
                    {item.date}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-bold text-accent">
                  AI {item.aiPercent}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* How it works */}
      <section className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
        <h2 className="text-lg font-bold">Kaise kaam karta hai?</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-zinc-300">
          <li>Tum photo upload karte ho ya us ka link daalte ho.</li>
          <li>
            Photo Sightengine ko bheji jati hai — wo photo ke pixels ko
            analyze karta hai, sirf naam ya metadata ko nahi.
          </li>
          <li>
            Sightengine batata hai ke photo kitne percent AI-generated lagti
            hai aur kis AI tool se bani ho sakti hai.
          </li>
          <li>Tum ko AI % aur Original % dono dikhaye jate hain.</li>
        </ol>
        <p className="mt-4 rounded-lg bg-ink px-4 py-3 text-sm text-zinc-400">
          Free plan: mahine mein lag bhag 400 checks. Limit khatam hone par
          dobara agle mahine check kar sakte ho.
        </p>
      </section>

      <footer className="pb-4 text-center text-xs text-zinc-600">
        MABA AI Detector — Sightengine AI detection ke saath
      </footer>
    </div>
  );
}
