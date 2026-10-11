/** "0E 01 FF" → bytes. Whitespace separated two-digit hex, as in protocol/vectors. */
export function fromHex(hex: string): Uint8Array {
  const parts = hex.trim().split(/\s+/).filter(Boolean);
  return Uint8Array.from(parts, (p) => {
    if (!/^[0-9a-fA-F]{2}$/.test(p)) throw new SyntaxError(`bad hex byte "${p}"`);
    return parseInt(p, 16);
  });
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
}

/** v1 C-array text ("0x81,0x13,\n...") → bytes. */
export function fromCArray(text: string): Uint8Array {
  return Uint8Array.from(text.matchAll(/0x([0-9a-fA-F]{1,2})/g), (m) => parseInt(m[1], 16));
}
