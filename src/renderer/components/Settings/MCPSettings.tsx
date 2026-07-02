// ============================================================
// MCPSettings — MCP Server configuration in Settings
// ============================================================

import React, { useState, useEffect } from 'react'
import { Server, ExternalLink, Check, Copy, Terminal } from 'lucide-react'

export default function MCPSettings(): React.ReactElement {
  const [claudeInstalled, setClaudeInstalled] = useState(false)
  const [cursorInstalled, setCursorInstalled] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI.mcp.status().then((s: unknown) => {
      // status is just { running: boolean } for now
    }).catch(() => {})
  }, [])

  const installFor = async (target: 'claude' | 'cursor') => {
    try {
      const result = await window.electronAPI.mcp.installConfig(target)
      if ((result as { success: boolean }).success) {
        if (target === 'claude') setClaudeInstalled(true)
        if (target === 'cursor') setCursorInstalled(true)
      }
    } catch {
      // ignore
    }
  }

  const copyCommand = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="space-y-5">
      {/* Description */}
      <div className="px-4 py-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
        <div className="flex items-start gap-2">
          <Server className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <div>
            <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100">MCP Server</h4>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
              MCP (Model Context Protocol) 允许 AI Agent（如 Claude、Cursor）直接读取数据库 schema 并执行查询。
              启动后，Agent 可以列出数据库、查看表结构、执行只读 SQL。
            </p>
          </div>
        </div>
      </div>

      {/* Start command */}
      <div>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
          <Terminal className="w-4 h-4" />
          启动命令
        </h4>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-800 text-xs font-mono text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 select-all">
            dbforge --mcp
          </code>
          <button
            onClick={() => copyCommand('dbforge --mcp', 'cmd')}
            className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="复制"
          >
            {copied === 'cmd' ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-400" />}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          在终端中运行此命令启动 MCP Server（纯 stdio 模式，无 GUI）
        </p>
      </div>

      {/* One-click config */}
      <div>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">一键配置 AI 客户端</h4>

        <div className="space-y-2">
          {/* Claude Desktop */}
          <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <ExternalLink className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Claude Desktop</div>
                <div className="text-xs text-gray-400">Anthropic Claude 桌面应用</div>
              </div>
            </div>
            <button
              onClick={() => installFor('claude')}
              disabled={claudeInstalled}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors
                ${claudeInstalled
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                  : 'bg-orange-600 hover:bg-orange-700 text-white'
                } disabled:cursor-default`}
            >
              {claudeInstalled ? (<><Check className="w-3 h-3 inline mr-1" />已配置</>) : '安装配置'}
            </button>
          </div>

          {/* Cursor */}
          <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <ExternalLink className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Cursor</div>
                <div className="text-xs text-gray-400">Cursor AI 编辑器</div>
              </div>
            </div>
            <button
              onClick={() => installFor('cursor')}
              disabled={cursorInstalled}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors
                ${cursorInstalled
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                  : 'bg-purple-600 hover:bg-purple-700 text-white'
                } disabled:cursor-default`}
            >
              {cursorInstalled ? (<><Check className="w-3 h-3 inline mr-1" />已配置</>) : '安装配置'}
            </button>
          </div>
        </div>
      </div>

      {/* Manual config */}
      <div>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">手动配置</h4>
        <p className="text-xs text-gray-400 mb-2">
          将以下配置添加到对应客户端的 MCP 配置文件中：
        </p>
        <pre className="px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-800 text-xs font-mono text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 overflow-x-auto">
{`{
  "mcpServers": {
    "dbforge": {
      "command": "dbforge",
      "args": ["--mcp"]
    }
  }
}`}
        </pre>
      </div>
    </div>
  )
}
