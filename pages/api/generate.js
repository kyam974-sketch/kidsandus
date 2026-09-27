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

  const expectsArray = /json\s+array|array\s+of\s+(activities|objects|strings)|return\s+only\s+a\s+json\s+array/i.test(promptText || '');
  if (!expectsArray || Array.isArray(parsed)) return JSON.stringify(parsed);

  if (parsed && typeof parsed === 'object') {
    const preferredKeys = ['activities', 'lesson', 'lesson_plan', 'items', 'results', 'data', 'notes'];
    for (const key of preferredKeys) {
      if (Array.isArray(parsed[key])) return JSON.stringify(parsed[key]);
    }

    const arrays = Object.values(parsed).filter(Array.isArray);
    if (arrays.length === 1) return JSON.stringify(arrays[0]);
  }

  return JSON.stringify(parsed);
}

function textFromMessages(messages) {
  return (messages || []).map((message) => {
    const role = message?.role || 'user';
    const content = message?.content;
    if (typeof content === 'string') return `${role.toUpperCase()}:\n${content}`;
    if (Array.isArray(content)) {
      const text = content
        .filter((part) => part?.type === 'text' && part?.text)
        .map((part) => part.text)
        .join('\n');
      return text ? `${role.toUpperCase()}:\n${text}` : '';
    }
    return '';
  }).filter(Boolean).join('\n\n');
}

function openAIOutputText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  return (data?.output || [])
    .flatMap((item) => item?.content || [])
    .map((part) => part?.text || part?.output_text || '')
    .join('')
    .trim();
}

const FOLLOWUP_STYLE = `\n\nITALIAN STYLE OVERRIDE — IMPORTANT\nWrite the judgments in idiomatic, natural Italian as if I, the teacher, had written them myself. When an observation is attributed to the teacher, use first-person singular (for example “ho notato…”, “ho visto…”, “durante l’attività ho osservato…”) and NEVER detached formulas such as “l’insegnante segnala/osserva/rileva”. Avoid bureaucratic or translated-sounding Italian. When referring to songs used in class, normally say “le canzoni”, “cantare”, “seguire la canzone”, etc.; do not use “il canto” as an artificial substitute for “songs”. Prefer simple classroom language over nominalisations. Do not overuse “ha dimostrato”, “evidenzia”, “mostra” or similar report clichés. Keep the result warm, professional, concrete and believable.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const originalPromptText = JSON.stringify(req.body?.messages || '');
  const isFollowUp = /INTERNAL follow-up judgments|individual judgments grounded in the concrete activities/i.test(originalPromptText);
  const requestedModel = req.body?.model || 'claude-sonnet-4-6';
  const effectiveModel = isFollowUp ? 'gpt-5.6-terra' : requestedModel;
  const useOpenAI = /^gpt-/i.test(effectiveModel);
  const effectiveBody = isFollowUp
    ? {
        ...req.body,
        model: effectiveModel,
        reasoning_effort: req.body?.reasoning_effort || 'low',
        messages: [
          ...(req.body?.messages || []),
          { role: 'user', content: FOLLOWUP_STYLE },
        ],
      }
    : { ...req.body, model: effectiveModel };

  const callAnthropic = async (body) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('Anthropic API key not configured');

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
    return { data, text: (data.content || []).map((b) => b.text || '').join('').trim() };
  };

  const callOpenAI = async (body) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OpenAI API key not configured');

    const input = textFromMessages(body?.messages);
    if (!input) throw new Error('OpenAI request has no text input');

    const requestBody = {
      model: body?.model || 'gpt-5.6-terra',
      input,
      max_output_tokens: Math.min(Number(body?.max_tokens) || 4000, 12000),
    };
    if (body?.reasoning_effort) requestBody.reasoning = { effort: body.reasoning_effort };

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    if (!response.ok) {
      const message = data?.error?.message || `OpenAI error ${response.status}`;
      throw new Error(message);
    }
    return { data, text: openAIOutputText(data) };
  };

  const callProvider = useOpenAI ? callOpenAI : callAnthropic;

  try {
    const first = await callProvider(effectiveBody);
    const originalText = first.text;
    const promptText = JSON.stringify(effectiveBody?.messages || '');
    const expectsJson = /json/i.test(promptText);
    let validJson = extractJson(originalText);

    if (expectsJson) {
      if (!validJson && originalText) {
        const wantsArray = /json\s+array|return\s+only\s+a\s+json\s+array/i.test(promptText);
        const repairBody = {
          model: effectiveModel,
          max_tokens: Math.min(Number(effectiveBody?.max_tokens) || 8000, 8000),
          reasoning_effort: effectiveBody?.reasoning_effort || 'low',
          messages: [
            {
              role: 'user',
              content: `Convert the following response into strictly valid JSON${wantsArray ? ' whose top level is an array' : ''}. Preserve all information and wording. Do not add commentary, markdown, code fences, explanations, or any text outside the JSON. Fix only syntax/formatting errors.\n\nRESPONSE TO REPAIR:\n${originalText}`,
            },
          ],
        };

        const repaired = await callProvider(repairBody);
        validJson = extractJson(repaired.text);

        if (!validJson) {
          return res.status(502).json({ error: 'AI returned invalid JSON after automatic repair.' });
        }
      }

      if (validJson) {
        const normalized = normalizeJsonForPrompt(validJson, promptText);
        return res.status(200).json({
          provider: useOpenAI ? 'openai' : 'anthropic',
          model: effectiveModel,
          content: [{ type: 'text', text: normalized }],
        });
      }
    }

    return res.status(200).json({
      provider: useOpenAI ? 'openai' : 'anthropic',
      model: effectiveModel,
      content: [{ type: 'text', text: originalText }],
    });
  } catch (e) {
    res.status(500).json({ error: { message: e.message } });
  }
}
