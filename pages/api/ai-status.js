export default function handler(req, res) {
  res.status(200).json({
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
  });
}
