// Format Alpha Vantage earnings call transcript data into markdown.
// Input: AV API response { transcript: [{ speaker, title, content }], symbol, quarter }
// Output: Markdown string

export function formatAlphaVantageTranscript(data) {
  if (typeof data.transcript === 'string') {
    return `# Earnings Call Transcript\n\n${data.transcript}`;
  }

  if (Array.isArray(data.transcript) && data.transcript.length > 0) {
    const lines = [];
    lines.push(`# Earnings Call Transcript`);
    if (data.symbol) lines.push(`**${data.symbol}** — ${data.quarter || ''}`);
    lines.push('');

    // Extract unique participants with titles
    const participants = new Map();
    for (const seg of data.transcript) {
      if (seg.speaker && seg.title && !participants.has(seg.speaker)) {
        participants.set(seg.speaker, seg.title);
      }
    }
    if (participants.size > 0) {
      lines.push('## Participants');
      lines.push('');
      for (const [name, title] of participants) {
        lines.push(`- **${name}** — ${title}`);
      }
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    for (const seg of data.transcript) {
      const speaker = seg.speaker || 'Unknown';
      const title = seg.title || '';
      const content = seg.content || seg.text || seg.speech || '';
      lines.push(`**${speaker}** *(${title})*:`);
      lines.push('');
      lines.push(content);
      lines.push('');
    }

    return lines.join('\n');
  }

  return `# Earnings Call Transcript\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
}
