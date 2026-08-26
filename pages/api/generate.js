function extractJson(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/```json|```/gi, '').trim();

  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch (_) {}

  const arrayStart = cleaned.indexOf('[');
  const arrayEnd = cleaned.lastIndexOf(']');
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    const candidate = cleaned.slice(arrayStart, arrayEnd + 1);
    try {
      JSON.parse(candidate);
      return candidate;
    } catch (_) {}
  }

  const objectStart = cleaned.indexOf('{');
  const objectEnd = cleaned.lastIndexOf('}');
  if (objectStart !== -1 && objectEnd > objectStart) {
    const candidate = cleaned.slice(objectStart, objectEnd + 1);
    try {
      JSON.parse(candidate);
      return candidate;
    } catch (_) {}
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const callAnthropic = async (body) => {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok) {
      const message = data?.error?.message || `Anthropic error ${response.status}`;
      throw new Error(message);
    }
    return data;
  };

  try {
    const data = await callAnthropic(req.body);
    const originalText = (data.content || []).map((b) => b.text || '').join('').trim();
    const validJson = extractJson(originalText);

    // Most calls to this endpoint ask for structured JSON. If the model added
    // commentary or emitted slightly malformed JSON, repair it server-side so
    // the Planner/Follow-up does not fail on JSON.parse in the browser.
    const promptText = JSON.stringify(req.body?.messages || '');
    const expectsJson = /json/i.test(promptText);

    if (expectsJson) {
      if (validJson) {
        data.content = [{ type: 'text', text: validJson }];
      } else if (originalText) {
        const repairBody = {
          model: req.body?.model || 'claude-sonnet-4-6',
          max_tokens: Math.min(Number(req.body?.max_tokens) || 8000, 8000),
          messages: [
            {
              role: 'user',
              content: `Convert the following response into strictly valid JSON. Preserve all information and wording. Do not add commentary, markdown, code fences, explanations, or any text outside the JSON. Fix only syntax/formatting errors.\n\nRESPONSE TO REPAIR:\n${originalText}`,
            },
          ],
        };

        const repaired = await callAnthropic(repairBody);
        const repairedText = (repaired.content || []).map((b) => b.text || '').join('').trim();
        const repairedJson = extractJson(repairedText);

        if (!repairedJson) {
          return res.status(502).json({ error: 'AI returned invalid JSON after automatic repair.' });
        }

        data.content = [{ type: 'text', text: repairedJson }];
      }
    }

    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
