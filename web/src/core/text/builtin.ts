/** Single-line fonts shipped in public/fonts (SIL Open Font License, see public/fonts/OFL.txt). */
export const BUILTIN_FONTS = [
  { key: "ems-readability", label: "EMS Readability", file: "EMSReadability.svg" },
  { key: "ems-readability-italic", label: "EMS Readability Italic", file: "EMSReadabilityItalic.svg" },
  { key: "ems-tech", label: "EMS Tech", file: "EMSTech.svg" },
  { key: "ems-osmotron", label: "EMS Osmotron", file: "EMSOsmotron.svg" },
] as const;

export const DEFAULT_FONT = "ems-readability";

export const isBuiltinFont = (key: string) => BUILTIN_FONTS.some((f) => f.key === key);
