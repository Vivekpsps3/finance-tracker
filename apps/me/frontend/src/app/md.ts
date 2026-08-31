export function md(src: string): string {
  const fences: string[] = [];
  let s = src
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/```[\w]*\n([\s\S]*?)```/g, (_, code) => {
      fences.push(`<pre><code>${code}</code></pre>`);
      return `\0${fences.length - 1}\0`;
    });
  s = s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(?:^[-*] .+(?:\n|$))+/gm, (block) =>
      `<ul>${block.trim().split('\n').map((l) => `<li>${l.replace(/^[-*] /, '')}</li>`).join('')}</ul>\n`)
    .replace(/(?:^\d+\. .+(?:\n|$))+/gm, (block) =>
      `<ol>${block.trim().split('\n').map((l) => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('')}</ol>\n`)
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" rel="noopener" target="_blank">$1</a>')
    .replace(/\0(\d+)\0/g, (_, i) => fences[+i]);
  return s;
}
