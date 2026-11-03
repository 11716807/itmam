import { langMeta } from "./languages";

type TranslateInput = {
  text: string;
  from: string;
  to: string;
  patientName: string;
  findingLabel: string;
};

/** Calm canned follow-up lines when remote translate is unavailable. */
function canned(to: string, patientName: string, findingLabel: string): string | null {
  const name = patientName;
  const finding = findingLabel;
  const map: Record<string, string> = {
    en: `Hello ${name}. Your recent screening needs a short clinic review of ${finding}. This does not diagnose you. Please confirm a time in Sahhatna.`,
    ar: `مرحباً ${name}. فحصك الأخير يحتاج زيارة قصيرة لمراجعة ${finding}. هذه الرسالة ليست تشخيصاً. أكّد الموعد في صحةنا.`,
    hi: `नमस्ते ${name}. आपकी हाल की स्क्रीनिंग के लिए ${finding} की एक छोटी क्लिनिक समीक्षा ज़रूरी है। यह निदान नहीं है। कृपया صحتنا / Sahhatna में समय की पुष्टि करें।`,
    ur: `السلام علیکم ${name}۔ آپ کی حالیہ اسکریننگ کے لیے ${finding} کا مختصر کلینک جائزہ درکار ہے۔ یہ تشخیص نہیں۔ براہِ کرم صحتنا میں وقت کی تصدیق کریں۔`,
    tl: `Hello ${name}. Kailangan ng maikling clinic review para sa ${finding} mula sa screening mo. Hindi ito diagnosis. Pakikumpirma ang oras sa Sahhatna.`,
    ml: `നമസ്കാരം ${name}. നിങ്ങളുടെ സ്ക്രീനിങ്ങിന് ${finding} സംബന്ധിച്ച ചെറിയ ക്ലിനിക് അവലോകനം ആവശ്യമാണ്. ഇത് രോഗനിർണയമല്ല. Sahhatna-യിൽ സമയം സ്ഥിരീകരിക്കുക.`,
    bn: `নমস্কার ${name}। আপনার সাম্প্রতিক স্ক্রিনিং-এর জন্য ${finding}-এর সংক্ষিপ্ত ক্লিনিক পর্যালোচনা দরকার। এটি রোগ নির্ণয় নয়। অনুগ্রহ করে Sahhatna-তে সময় নিশ্চিত করুন।`,
    fa: `سلام ${name}. غربالگری اخیر شما نیاز به یک بررسی کوتاه بالینی برای ${finding} دارد. این تشخیص نیست. لطفاً زمان را در صحتنا تأیید کنید.`,
    fr: `Bonjour ${name}. Votre dépistage récent nécessite une courte revue clinique de ${finding}. Ceci n'est pas un diagnostic. Veuillez confirmer un créneau dans Sahhatna.`,
  };
  return map[to] || null;
}

async function remoteTranslate(input: TranslateInput): Promise<string | null> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 5000);
  try {
    const response = await fetch("/api/itmam-translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pack: {
          text: input.text,
          from: langMeta(input.from).label,
          to: langMeta(input.to).label,
          fromCode: input.from,
          toCode: input.to,
        },
      }),
      signal: timeout.signal,
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { text?: string };
    return body.text?.trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function translateMessage(input: TranslateInput): Promise<{ text: string; source: "remote" | "local" }> {
  if (!input.text.trim()) {
    return { text: "", source: "local" };
  }
  if (input.from === input.to) {
    return { text: input.text, source: "local" };
  }

  const remote = await remoteTranslate(input);
  if (remote) return { text: remote, source: "remote" };

  const local = canned(input.to, input.patientName, input.findingLabel);
  if (local) return { text: local, source: "local" };

  return { text: input.text, source: "local" };
}
