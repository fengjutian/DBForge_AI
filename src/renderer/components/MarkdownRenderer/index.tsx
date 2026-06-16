import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { processStreamingMarkdown } from '../../utils/streamingMarkdown'

interface MarkdownRendererProps {
  content: string
  className?: string
  streaming?: boolean
}

export default function MarkdownRenderer({ content, className = '', streaming = false }: MarkdownRendererProps): React.ReactElement {
  const renderedContent = streaming ? processStreamingMarkdown(content) : content

  return (
    <div className={`markdown-body text-xs leading-relaxed ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="text-sm font-bold mt-3 mb-1 text-gray-900 dark:text-gray-100">{children}</h1>,
          h2: ({ children }) => <h2 className="text-xs font-bold mt-2 mb-1 text-gray-900 dark:text-gray-100">{children}</h2>,
          h3: ({ children }) => <h3 className="text-xs font-semibold mt-2 mb-0.5 text-gray-800 dark:text-gray-200">{children}</h3>,
          p: ({ children }) => <p className="mb-1.5 text-gray-700 dark:text-gray-300">{children}</p>,
          code: ({ children, className: cls }) => {
            const isBlock = cls?.includes('language-')
            if (isBlock) {
              return (
                <code className="block bg-gray-100 dark:bg-gray-800 rounded px-2 py-1.5 font-mono text-xs overflow-x-auto whitespace-pre text-gray-800 dark:text-gray-200 my-1">
                  {children}
                </code>
              )
            }
            return (
              <code className="bg-gray-100 dark:bg-gray-800 rounded px-1 py-0.5 font-mono text-xs text-green-700 dark:text-green-300">
                {children}
              </code>
            )
          },
          pre: ({ children }) => <pre className="my-1.5 rounded overflow-hidden">{children}</pre>,
          ul: ({ children }) => <ul className="list-disc list-inside mb-1.5 space-y-0.5 text-gray-700 dark:text-gray-300">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside mb-1.5 space-y-0.5 text-gray-700 dark:text-gray-300">{children}</ol>,
          li: ({ children }) => <li className="text-xs">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-green-400 pl-2 my-1 text-gray-500 dark:text-gray-400 italic">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-1.5">
              <table className="text-xs border-collapse w-full">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-green-600 text-white dark:bg-green-700">{children}</thead>,
          th: ({ children }) => <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 font-semibold text-left">{children}</th>,
          td: ({ children }) => <td className="border border-gray-300 dark:border-gray-600 px-2 py-1">{children}</td>,
          strong: ({ children }) => <strong className="font-semibold text-gray-900 dark:text-gray-100">{children}</strong>,
          em: ({ children }) => <em className="italic text-gray-600 dark:text-gray-400">{children}</em>,
          hr: () => <hr className="my-2 border-gray-200 dark:border-gray-700" />,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer"
              className="text-green-600 dark:text-green-400 hover:underline">
              {children}
            </a>
          ),
        }}
      >
        {renderedContent}
      </ReactMarkdown>
      {streaming && (
        <span className="inline-block w-1.5 h-3.5 bg-green-500 animate-pulse ml-0.5 align-middle rounded-sm" />
      )}
    </div>
  )
}
