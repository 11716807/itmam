export type MessageLang = {
  code: string;
  label: string;
  rtl?: boolean;
};

/** Common languages for Abu Dhabi patient outreach. */
export const MESSAGE_LANGS: MessageLang[] = [
  { code: "en", label: "English" },
  { code: "ar", label: "Arabic", rtl: true },
  { code: "hi", label: "Hindi" },
  { code: "ur", label: "Urdu", rtl: true },
  { code: "tl", label: "Tagalog" },
  { code: "ml", label: "Malayalam" },
  { code: "bn", label: "Bengali" },
  { code: "fa", label: "Persian", rtl: true },
  { code: "fr", label: "French" },
];

export function langMeta(code: string): MessageLang {
  return MESSAGE_LANGS.find((l) => l.code === code) || { code, label: code };
}

export function isRtl(code: string): boolean {
  return Boolean(langMeta(code).rtl);
}
