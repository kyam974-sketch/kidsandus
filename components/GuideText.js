export function normalizeGuideText(text) {
  return String(text || '').replace(/\\r\\n|\\n|\\r/g, '\n').replace(/\r\n?/g, '\n');
}

export default function GuideText({ text, className = '', lessonPlan = false }) {
  const lines = normalizeGuideText(text).split('\n');
  const blocks = [];
  let pending = [];
  const flush = () => { if (pending.length) { blocks.push({ type: 'text', lines: pending }); pending = []; } };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (lessonPlan && /^(?:\d+[.\s]*[–—-]|BONUS\s*$|ACTIVITY \d+:)/.test(line.trim())) {
      flush(); blocks.push({ type: 'heading', lines: [line] });
    } else if (lessonPlan && /^>\s+/.test(line.trim())) {
      flush(); blocks.push({ type: 'subheading', lines: [line.replace(/^>\s*/, '')] });
    } else pending.push(line);
  }
  flush();
  return <div className={`guide-text ${className}`}>{blocks.map((block, index) => {
    const value = block.lines.join('\n');
    if (block.type === 'heading') return <h4 className="guide-activity-title" key={index}>{value}</h4>;
    if (block.type === 'subheading') return <h5 className="guide-part-title" key={index}>{value}</h5>;
    return <div className="guide-prose" key={index}>{value}</div>;
  })}</div>;
}
