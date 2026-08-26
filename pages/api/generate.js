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

function normalizeJsonForPrompt(jsonText, promptText) {
  if (!jsonText) return jsonText;

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (_) {
    return jsonText;
  }

  // The Planner explicitly asks for a JSON array. Models sometimes wrap the
  // array in { activities: [...] } / { data: [...] }. Unwrap only for calls
  // that clearly request an array, so Follow-up object responses are untouched.
  const expectsArray = /json\s+array|array\s+of\s+(activities|objects|strings)|return\s+only\s+a\s+json\s+array/i.test(promptText || '');
  if (!expectsArray || Array.isArray(parsed)) return JSON.stringify(parsed);

  if (parsed && typeof parsed === 'object') {
    const preferredKeys = ['activities', 'lesson', 'lesson_plan', 'items', 'results', 'data', 'notes'];
    for (const key of preferredKeys) {
      if (Array.isArray(parsed[key])) return JSON.stringify(parsed[key]);
    }

    // Last-resort normalization: if exactly one object property is an array,
    // use it. This avoids rejecting harmless wrapper objects.
    const arrays = Object.values(parsed).filter(Array.isArray);
    if (arrays.length === 1) return JSON.stringify(arrays[0]);
  }

  return JSON.stringify(parsed);
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
    const promptText = JSON.stringify(req.body?.messages || '');
    const expectsJson = /json/i.test(promptText);
    let validJson = extractJson(originalText);

    if (expectsJson) {
      if (!validJson && originalText) {
        const wantsArray = /json\s+array|return\s+only\s+a\s+json\s+array/i.test(promptText);
        const repairBody = {
          model: req.body?.model || 'claude-sonnet-4-6',
          max_tokens: Math.min(Number(req.body?.max_tokens) || 8000, 8000),
          messages: [
            {
              role: 'user',
              content: `Convert the following response into strictly valid JSON${wantsArray ? ' whose top level is an array' : ''}. Preserve all information and wording. Do not add commentary, markdown, code fences, explanations, or any text outside the JSON. Fix only syntax/formatting errors.\n\nRESPONSE TO REPAIR:\n${originalText}`,
            },
          ],
        };

        const repaired = await callAnthropic(repairBody);
        const repairedText = (repaired.content || []).map((b) => b.text || '').join('').trim();
        validJson = extractJson(repairedText);

        if (!validJson) {
          return res.status(502).json({ error: 'AI returned invalid JSON after automatic repair.' });
        }
      }

      if (validJson) {
        const normalized = normalizeJsonForPrompt(validJson, promptText);
        data.content = [{ type: 'text', text: normalized }];
      }
    }

    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
