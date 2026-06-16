import React from 'react'
import {
  Plus,
  Database,
  Bot,
  Settings,
  Zap,
  FileText
} from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { useConnectionStore } from '../../store/connectionStore'

interface WelcomePageProps {
  onOpenSettings: () => void
  onToggleAI: () => void
}

interface QuickAction {
  icon: React.ReactNode
  label: string
  color: string
  action: () => void
}

export default function WelcomePage({ onOpenSettings, onToggleAI }: WelcomePageProps): React.ReactElement {
  const { addTab } = useEditorStore()
  const { connections } = useConnectionStore()

  const quickActions: QuickAction[] = [
    {
      icon: <Plus className="w-6 h-6" />,
      label: '新建查询',
      color: 'from-green-400 to-emerald-500',
      action: () => addTab()
    },
    {
      icon: <Database className="w-6 h-6" />,
      label: '管理连接',
      color: 'from-blue-400 to-cyan-500',
      action: onOpenSettings
    },
    {
      icon: <Bot className="w-6 h-6" />,
      label: 'AI 助手',
      color: 'from-violet-400 to-purple-500',
      action: onToggleAI
    },
    {
      icon: <Zap className="w-6 h-6" />,
      label: '快速开始',
      color: 'from-amber-400 to-orange-500',
      action: () => addTab()
    },
    {
      icon: <FileText className="w-6 h-6" />,
      label: '使用文档',
      color: 'from-rose-400 to-pink-500',
      action: () => {
        // can open external docs in future
      }
    },
    {
      icon: <Settings className="w-6 h-6" />,
      label: '设置',
      color: 'from-slate-400 to-gray-500',
      action: onOpenSettings
    }
  ]

  const connectedCount = connections.filter(c => c.id).length

  return (
    <div className="flex items-center justify-center h-full bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 overflow-hidden relative">
      {/* Dot grid background pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
        style={{
          backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }}
      />

      {/* Orbital ring decorations */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[420px] h-[420px] rounded-full border border-green-200/20 dark:border-green-500/10 animate-[spin_60s_linear_infinite]" />
        <div className="absolute w-[340px] h-[340px] rounded-full border border-blue-200/20 dark:border-blue-500/10 animate-[spin_40s_linear_infinite_reverse]" />
        <div className="absolute w-[260px] h-[260px] rounded-full border border-purple-200/20 dark:border-purple-500/10 animate-[spin_30s_linear_infinite]" />
      </div>

      {/* Central bubble */}
      <div className="relative z-10 flex flex-col items-center">
        <button
          onClick={() => addTab()}
          className="group relative w-40 h-40 rounded-full bg-gradient-to-br from-green-400 to-emerald-600
                     flex items-center justify-center
                     shadow-[0_0_60px_-10px_rgba(16,185,129,0.5)]
                     hover:shadow-[0_0_80px_-5px_rgba(16,185,129,0.7)]
                     hover:scale-105 active:scale-95
                     transition-all duration-500 cursor-pointer
                     animate-[float_6s_ease-in-out_infinite]"
        >
          {/* Inner ring */}
          <div className="absolute inset-2 rounded-full border-2 border-white/20 group-hover:border-white/30 transition-colors" />
          {/* Icon + text */}
          <div className="flex flex-col items-center gap-1.5 z-10">
            <Plus className="w-10 h-10 text-white drop-shadow-lg" strokeWidth={1.5} />
            <span className="text-white font-semibold text-sm tracking-wide drop-shadow-md">
              新建查询
            </span>
            <span className="text-white/60 text-[10px] tracking-wider">
              Ctrl + N
            </span>
          </div>
        </button>

        {/* Welcome text below central bubble */}
        <div className="mt-6 text-center space-y-1">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
            欢迎使用 DBForge
          </h2>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            {connectedCount > 0
              ? `已连接 ${connectedCount} 个数据库，开始你的查询之旅`
              : '连接数据库，开始高效的数据查询与管理'}
          </p>
        </div>
      </div>

      {/* Surrounding small bubbles */}
      {quickActions.map((action, index) => {
        // Calculate positions in a circle around the center
        const total = quickActions.length
        const angle = (index / total) * 2 * Math.PI - Math.PI / 2
        const radius = 200 // px from center
        const x = Math.cos(angle) * radius
        const y = Math.sin(angle) * radius

        return (
          <button
            key={action.label}
            onClick={action.action}
            className={`absolute z-10 w-16 h-16 rounded-full bg-gradient-to-br ${action.color}
                       flex items-center justify-center
                       shadow-lg hover:shadow-xl
                       hover:scale-110 active:scale-95
                       transition-all duration-300 cursor-pointer
                       group`}
            style={{
              left: `calc(50% + ${x}px - 32px)`,
              top: `calc(50% + ${y}px - 32px)`
            }}
            title={action.label}
          >
            <div className="text-white/90 group-hover:text-white transition-colors">
              {action.icon}
            </div>
            {/* Tooltip label */}
            <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap
                           opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
              {action.label}
            </span>
          </button>
        )
      })}

      {/* Tailwind custom animations injected via style tag */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes spin_reverse {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
      `}</style>
    </div>
  )
}
