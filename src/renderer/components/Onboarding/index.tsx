import React, { useState } from 'react'
import { Check, Database, Plug, Bot, Save } from 'lucide-react'
import { useSettingsStore } from '../../store/settingsStore'
import type { AIProvider } from '../../../shared/types'

interface Props {
  onComplete: () => void
}

const STEPS = ['欢迎', 'AI 配置', '添加连接'] as const
type Step = 0 | 1 | 2

export default function Onboarding({ onComplete }: Props): React.ReactElement {
  const { config, updateAIConfig } = useSettingsStore()
  const [step, setStep] = useState<Step>(0)

  const handleSkip = async () => {
    await window.electronAPI.settings.set({ onboardingCompleted: true })
    onComplete()
  }

  const handleNext = () => {
    if (step < 2) setStep((step + 1) as Step)
    else handleSkip()
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-[520px] p-8">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold
                ${i === step ? 'bg-green-600 text-white' : i < step ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-400'}`}>
                {i < step ? <><Check className="w-3 h-3 inline" /></> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 w-12 ${i < step ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step content */}
        {step === 0 && (
          <div className="text-center space-y-4">
            <div className="text-5xl mb-4 text-green-600"><Database className="w-12 h-12 inline" /></div>
            <h1 className="text-2xl font-bold">欢迎使用 DBForge AI</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
              DBForge AI 是一款跨平台桌面数据库管理工具，集成 AI 能力，让数据库操作更简单高效。
            </p>
            <div className="grid grid-cols-3 gap-3 mt-4 text-xs text-gray-500">
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-center">
                <div className="text-2xl mb-1 text-green-600"><Plug className="w-6 h-6 inline" /></div>
                <div>多连接管理</div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-center">
                <div className="text-2xl mb-1 text-green-600"><Bot className="w-6 h-6 inline" /></div>
                <div>AI 生成 SQL</div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-center">
                <div className="text-2xl mb-1"><Save className="w-6 h-6 inline text-green-600" /></div>
                <div>备份恢复</div>
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-center">配置 AI 助手</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center">配置 AI 提供商以启用自然语言转 SQL 功能（可跳过，稍后在设置中配置）</p>
            {config && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">AI 提供商</label>
                  <select className={sel} value={config.ai.provider}
                    onChange={e => updateAIConfig({ provider: e.target.value as AIProvider })}>
                    <option value="openai">OpenAI</option>
                    <option value="groq">Groq</option>
                    <option value="claude">Claude</option>
                    <option value="deepseek">DeepSeek</option>
                    <option value="ollama">Ollama (本地)</option>
                  </select>
                </div>
                {config.ai.provider !== 'ollama' && (
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">API Key</label>
                    <input className={inp} type="password" placeholder="输入 API Key..."
                      onChange={e => updateAIConfig({ apiKey: e.target.value })} />
                  </div>
                )}
                {config.ai.provider === 'ollama' && (
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Ollama 地址</label>
                    <input className={inp} value={config.ai.baseUrl ?? 'http://localhost:11434'}
                      onChange={e => updateAIConfig({ baseUrl: e.target.value })} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 text-center">
            <div className="text-4xl text-green-600"><Plug className="w-8 h-8 inline" /></div>
            <h2 className="text-xl font-bold">添加数据库连接</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              点击完成后，在左侧"连接管理"面板中添加你的第一个 MySQL 连接。
            </p>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-sm text-green-700 dark:text-green-300 text-left">
              <p className="font-medium mb-1">快速开始：</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>点击左侧"连接管理"面板的"+ 新建"按钮</li>
                <li>填写数据库连接信息</li>
                <li>点击"测试连接"验证配置</li>
                <li>保存并激活连接</li>
              </ol>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between mt-8">
          <button onClick={handleSkip} className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            跳过引导
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button onClick={() => setStep((step - 1) as Step)}
                className="text-sm px-4 py-2 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">
                上一步
              </button>
            )}
            <button onClick={handleNext}
              className="text-sm px-6 py-2 rounded bg-green-600 text-white hover:bg-green-700 font-medium">
              {step === 2 ? '完成' : '下一步'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const sel = 'w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none'
const inp = 'w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-green-500'
