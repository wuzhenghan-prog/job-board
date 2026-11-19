const safeMarkdownPattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;

function externalLink(target: string): boolean {
  try {
    return new URL(target).protocol === "https:";
  } catch {
    return false;
  }
}

export default function AiMarkdown({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  return (
    <div className="ai-markdown">
      {lines.map((line, index) => {
        if (!line.trim()) return <div className="ai-spacer" key={index} />;
        if (line.startsWith("### ")) return <h4 key={index}>{line.slice(4)}</h4>;
        if (line.startsWith("## ")) return <h3 key={index}>{line.slice(3)}</h3>;
        if (line.startsWith("# ")) return <h2 key={index}>{line.slice(2)}</h2>;
        if (line.startsWith("- ")) {
          return (
            <div className="ai-list-line" key={index}>
              <span aria-hidden="true">·</span>
              <span>{renderInline(line.slice(2))}</span>
            </div>
          );
        }
        return <p key={index}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string) {
  return text.split(safeMarkdownPattern).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    const link = part.match(/^\[([^\]]+)\]\((https:[^)]+)\)$/);
    if (link && externalLink(link[2])) {
      return (
        <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer">
          {link[1]}
        </a>
      );
    }
    return part;
  });
}
