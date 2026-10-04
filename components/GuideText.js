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
    // Long diagram-label runs remain available without interrupting instructions.
    if (lessonPlan && /^\d+(?:\s+\d+)*$/.test(line.trim())) {
      let end = index;
      while (end < lines.length && /^(?:[\d\s?]+|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY|January|March|May|July|August|September|What’s the Date\?|\? What’s the date today\?.*|Story 1: The Puppy 15|P&P S1: The Puppy \| Day \d+)$/.test(lines[end].trim())) end++;
      if (end - index >= 10) {
        flush(); blocks.push({ type: 'diagram', lines: lines.slice(index, end) }); index = end - 1; continue;
      }
    }
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
    if (block.type === 'diagram') return <details className="guide-diagram-labels" key={index}><summary>Etichette delle immagini — numeri e calendari</summary><div className="guide-prose">{value}</div></details>;
    return <div className="guide-prose" key={index}>{value}</div>;
  })}</div>;
}
