const cache = new Map<string, string>();
const CACHE_MAX = 300;

export async function translateToMyanmar(text: string): Promise<string> {
  if (!text) return "";

  const cached = cache.get(text);
  if (cached) return cached;

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=my&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Translation request failed");
    const data = await res.json() as any[][];
    const translated = data[0]
      ?.map((chunk: any[]) => chunk[0])
      .filter(Boolean)
      .join("") || text;
    // Evict oldest entry if at capacity
    if (cache.size >= CACHE_MAX) {
      const [oldest] = cache.keys();
      cache.delete(oldest);
    }
    cache.set(text, translated);
    return translated;
  } catch {
    return text;
  }
}
