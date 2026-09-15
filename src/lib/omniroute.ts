export async function createDailyDigest(prompt: string): Promise<string> {
  const base = process.env.OMNIROUTE_URL?.replace(/\/$/, "") ?? "http://192.168.31.7:20128/v1";
  const key = process.env.OMNIROUTE_API_KEY;

  if (!key) {
    return "OmniRoute API key not configured yet. Set OMNIROUTE_API_KEY to enable digests.";
  }

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OMNIROUTE_MODEL ?? "auto",
      messages: [
        {
          role: "system",
          content:
            "You write ultra-short Telegram updates for a parent about kids' hotspot devices. Output ONLY 1–2 lines starting with • . No headings, no markdown bold, no preamble. Max ~25 words per line. Flag over-cap or pause clearly.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 120,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OmniRoute failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return data.choices?.[0]?.message?.content?.trim() || "No summary returned.";
}
