import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownMessageProps {
  content: string;
}

/**
 * Renders assistant markdown (headings, lists, tables, links, emphasis) with
 * Tailwind styling tuned for the dark chat surface. Links open in a new tab.
 */
export function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <div className="text-sm leading-relaxed font-sans space-y-3">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-base font-bold text-white mt-2 mb-1">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-sm font-bold text-cyan-300 mt-3 mb-1 border-b border-slate-700/50 pb-1">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold text-slate-100 mt-2 mb-1">{children}</h3>
          ),
          p: ({ children }) => <p className="text-slate-200">{children}</p>,
          ul: ({ children }) => (
            <ul className="list-disc list-outside pl-5 space-y-1 text-slate-200">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-outside pl-5 space-y-1 text-slate-200">{children}</ol>
          ),
          li: ({ children }) => <li className="marker:text-cyan-500/70">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-white">{children}</strong>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 underline decoration-cyan-500/40 hover:decoration-cyan-400"
            >
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="bg-slate-800/80 text-cyan-200 px-1.5 py-0.5 rounded text-xs font-mono">
              {children}
            </code>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border border-slate-700 rounded">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-slate-700 bg-slate-800/60 px-2 py-1 text-left text-slate-200">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-slate-700 px-2 py-1 text-slate-300">{children}</td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-cyan-500/40 pl-3 text-slate-400 italic">
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
