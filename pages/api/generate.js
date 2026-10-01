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

function ensureFollowUpStartsWithName(jsonText) {
  if (!jsonText) return jsonText;

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (_) {
    return jsonText;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return jsonText;

  const startWithName = (studentKey, rawText) => {
    const text = String(rawText || '').trim();
    if (!text) return text;

    const firstName = String(studentKey || '').trim().split(/\s+/)[0] || String(studentKey || '').trim();
    const lowerText = text.toLocaleLowerCase('it-IT');
    const lowerFirstName = firstName.toLocaleLowerCase('it-IT');
    const lowerFullName = String(studentKey || '').trim().toLocaleLowerCase('it-IT');

    if (lowerText === lowerFirstName || lowerText.startsWith(`${lowerFirstName} `) || lowerText.startsWith(`${lowerFirstName},`) || lowerText.startsWith(`${lowerFirstName}:`) ||
        lowerText === lowerFullName || lowerText.startsWith(`${lowerFullName} `) || lowerText.startsWith(`${lowerFullName},`) || lowerText.startsWith(`${lowerFullName}:`)) {
      return text;
    }

    const firstChar = text.charAt(0);
    const naturalContinuation = firstChar ? firstChar.toLocaleLowerCase('it-IT') + text.slice(1) : text;
    return `${firstName} ${naturalContinuation}`.trim();
  };

  const fixed = {};
  for (const [studentName, value] of Object.entries(parsed)) {
    if (typeof value === 'string') {
      fixed[studentName] = startWithName(studentName, value);
      continue;
    }

    if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.note === 'string') {
      fixed[studentName] = { ...value, note: startWithName(studentName, value.note) };
      continue;
    }

    fixed[studentName] = value;
  }

  return JSON.stringify(fixed);
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

const FOLLOWUP_STYLE = `FOLLOW-UP STYLE — IMPORTANT
Write internal follow-up notes in natural, idiomatic British English, using simple classroom language. The separate assessment fields are consecutive sentences of ONE coherent paragraph. Include the child's first name ONCE, at the beginning of the first non-empty assessment field; never repeat the name in later fields. Avoid guessing gender: singular they is appropriate when pronouns are not established by the teacher's evidence. Every sentence must have a clear grammatical subject; never omit the child as subject or make chatting/the activity the subject of settling or understanding. Cover every selected assessment distinctly, including My Way when assessed, without inflating the rating or inventing details. Do not reduce the note to a generic overall verdict. Aim for a compact but informative paragraph, usually around 60-100 words when evidence supports it. Explain the assessed engagement, learning response and conduct in the context of the actual lesson activities and the teacher observations, rather than merely translating the emojis into "learning was excellent" or "behaviour was good". Use observations explicitly naming the student even when they appear in the group note. Never invent incidents, mastery or difficulties to make a note richer. Keep it concrete and fluent, without formulaic repetition or literal translations. Respect the requested JSON structure. This instruction applies only to internal follow-ups; Term Reports remain in Italian.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const originalPromptText = JSON.stringify(req.body?.messages || '');
  const isFollowUp = /INTERNAL follow-up judgments|individual judgments grounded in the concrete activities/i.test(originalPromptText);
  const requestedModel = req.body?.model || 'claude-sonnet-4-6';
  const wantsOpenAI = isFollowUp || /^gpt-/i.test(requestedModel);
  const openAIConfigured = Boolean(process.env.OPENAI_API_KEY);
  const useOpenAI = wantsOpenAI && openAIConfigured;
  const effectiveModel = useOpenAI
    ? (isFollowUp ? 'gpt-5.6-terra' : requestedModel)
    : (wantsOpenAI ? 'claude-sonnet-4-6' : requestedModel);

  const baseMessages = req.body?.messages || [];
  const effectiveBody = {
    ...req.body,
    model: effectiveModel,
    ...(useOpenAI ? { reasoning_effort: req.body?.reasoning_effort || (isFollowUp ? 'low' : undefined) } : {}),
    messages: isFollowUp
      ? [...baseMessages, { role: 'user', content: FOLLOWUP_STYLE }]
      : baseMessages,
  };

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
          ...(useOpenAI ? { reasoning_effort: effectiveBody?.reasoning_effort || 'low' } : {}),
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
        let normalized = normalizeJsonForPrompt(validJson, promptText);
        if (isFollowUp) normalized = ensureFollowUpStartsWithName(normalized);
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
