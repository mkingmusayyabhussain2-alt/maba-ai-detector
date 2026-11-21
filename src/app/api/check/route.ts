import { NextResponse } from "next/server";

export const runtime = "nodejs";
// Sightengine can be slow on large images; allow up to 60s on Vercel.
export const maxDuration = 60;

const SIGHTENGINE_URL = "https://api.sightengine.com/1.0/check.json";
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

type GeneratorScore = { name: string; percent: number };

export type CheckResult = {
  aiPercent: number;
  realPercent: number;
  verdict: string;
  generators: GeneratorScore[];
  error: string | null;
};

function verdictFor(aiPercent: number): string {
  if (aiPercent < 20) return "Lagta hai original hai";
  if (aiPercent < 50) return "Shak hai — yaqeen nahi";
  if (aiPercent < 80) return "Zyada tar AI lagti hai";
  return "AI-generated lagti hai";
}

function jsonError(message: string, status: number) {
  return NextResponse.json(
    {
      aiPercent: 0,
      realPercent: 0,
      verdict: "",
      generators: [],
      error: message,
    } satisfies CheckResult,
    { status },
  );
}

export async function POST(req: Request) {
  const apiUser = process.env.SIGHTENGINE_API_USER;
  const apiSecret = process.env.SIGHTENGINE_API_SECRET;

  // Keys live server-side only. Never log them, never return them.
  if (!apiUser || !apiSecret) {
    return jsonError(
      "API key nahi lagi — Sightengine ki key lagao",
      503,
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("Photo nahi mili — dobara upload karo", 400);
  }

  const file = form.get("media");
  const urlValue = form.get("url");
  const imageUrl =
    typeof urlValue === "string" ? urlValue.trim() : "";

  const hasFile =
    file instanceof File && file.size > 0;
  const hasUrl =
    imageUrl.length > 0 &&
    /^https?:\/\//i.test(imageUrl);

  if (!hasFile && !hasUrl) {
    return jsonError(
      "Pehle photo upload karo ya image ka link daalo",
      400,
    );
  }

  if (hasFile && file instanceof File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return jsonError(
        "Sirf JPG, PNG ya WebP photo chalegi",
        400,
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      return jsonError(
        "Photo 10 MB se bari hai — chhoti photo try karo",
        400,
      );
    }
  }

  const upstream = new FormData();
  upstream.append("models", "genai");
  upstream.append("api_user", apiUser);
  upstream.append("api_secret", apiSecret);
  if (hasFile && file instanceof File) {
    upstream.append("media", file, file.name || "image.jpg");
  } else {
    upstream.append("url", imageUrl);
  }

  let res: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55_000);
    try {
      res = await fetch(SIGHTENGINE_URL, {
        method: "POST",
        body: upstream,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return jsonError(
        "Sightengine se jawab nahi mila — dobara try karo",
        504,
      );
    }
    return jsonError(
      "Sightengine se connect nahi ho saka — dobara try karo",
      502,
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return jsonError(
      "Sightengine se ghalat jawab mila — dobara try karo",
      502,
    );
  }

  if (!res.ok) {
    const code =
      typeof data === "object" && data !== null
        ? (data as { error?: { code?: number } }).error?.code
        : undefined;
    if (res.status === 401 || res.status === 402 || code === 401) {
      return jsonError(
        "API key galat hai ya limit khatam ho gayi",
        502,
      );
    }
    if (res.status === 429) {
      return jsonError(
        "Limit khatam — thodi der baad dobara try karo",
        429,
      );
    }
    return jsonError(
      "Sightengine se jawab nahi mila — dobara try karo",
      502,
    );
  }

  const aiGenerated =
    typeof data === "object" && data !== null
      ? (data as { type?: { ai_generated?: unknown } }).type
          ?.ai_generated
      : undefined;

  if (typeof aiGenerated !== "number" || Number.isNaN(aiGenerated)) {
    return jsonError(
      "Sightengine se score nahi mila — dobara try karo",
      502,
    );
  }

  const clamped = Math.min(1, Math.max(0, aiGenerated));
  const aiPercent = Math.round(clamped * 100);

  const rawGenerators =
    typeof data === "object" && data !== null
      ? (data as { type?: { ai_generators?: unknown } }).type
          ?.ai_generators
      : undefined;

  const generators: GeneratorScore[] = [];
  if (
    rawGenerators &&
    typeof rawGenerators === "object" &&
    !Array.isArray(rawGenerators)
  ) {
    for (const [name, score] of Object.entries(
      rawGenerators as Record<string, unknown>,
    )) {
      if (typeof score === "number" && !Number.isNaN(score)) {
        generators.push({
          name,
          percent: Math.round(
            Math.min(1, Math.max(0, score)) * 100,
          ),
        });
      }
    }
    generators.sort((a, b) => b.percent - a.percent);
  }

  return NextResponse.json({
    aiPercent,
    realPercent: 100 - aiPercent,
    verdict: verdictFor(aiPercent),
    generators: generators.slice(0, 5),
    error: null,
  } satisfies CheckResult);
}
