import React, { useState, useRef, useEffect, useCallback } from 'react'

// ── Menu item types ───────────────────────────────────────────
interface MenuItem {
  label: string
  shortcut?: string
  action?: () => void
  separator?: true
}

interface MenuGroup {
  label: string
  items: MenuItem[]
}

// ── Props ─────────────────────────────────────────────────────
interface MenuBarProps {
  onNewQuery?: () => void
  onOpenSettings?: () => void
  onToggleAI?: () => void
  aiPanelOpen?: boolean
}

// ── MenuBar ──────────────────────────────────────────────────
function MenuBar({
  onNewQuery,
  onOpenSettings,
  onToggleAI,
  aiPanelOpen
}: MenuBarProps): React.ReactElement {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu when clicking outside
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setOpenMenu(null)
    }
  }, [])

  useEffect(() => {
    if (openMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [openMenu, handleClickOutside])

  const handleMenuClick = (label: string) => {
    setOpenMenu(prev => (prev === label ? null : label))
  }

  const handleItemClick = (item: MenuItem) => {
    setOpenMenu(null)
    if (item.action) item.action()
  }

  // ── Menu definitions ──────────────────────────────────────────
  const menus: MenuGroup[] = [
    {
      label: '文件',
      items: [
        { label: '新建查询', shortcut: 'Ctrl+N', action: onNewQuery },
        { label: '打开', shortcut: 'Ctrl+O' },
        { label: '', separator: true },
        { label: '退出', shortcut: 'Ctrl+Q', action: () => window.electronAPI.window.close() }
      ]
    },
    {
      label: '编辑',
      items: [
        { label: '撤销', shortcut: 'Ctrl+Z' },
        { label: '重做', shortcut: 'Ctrl+Shift+Z' },
        { label: '', separator: true },
        { label: '复制', shortcut: 'Ctrl+C' },
        { label: '粘贴', shortcut: 'Ctrl+V' }
      ]
    },
    {
      label: '查看',
      items: [
        {
          label: 'AI 面板',
          shortcut: aiPanelOpen ? '✓ 已开启' : '',
          action: onToggleAI
        }
      ]
    },
    {
      label: '帮助',
      items: [
        { label: '设置', shortcut: 'Ctrl+,', action: onOpenSettings },
        { label: '', separator: true },
        { label: '关于 DBForge AI' }
      ]
    }
  ]

  return (
    <div
      ref={menuRef}
      className="flex items-center h-7 flex-shrink-0 select-none
        bg-[#2d2d2d] dark:bg-[#2d2d2d] bg-gray-100
        border-b border-[#3c3c3c] dark:border-[#3c3c3c] border-gray-200
        text-[12px]"
    >
      {menus.map(menu => (
        <div key={menu.label} className="relative">
          {/* Menu trigger */}
          <button
            onClick={() => handleMenuClick(menu.label)}
            className={`
              px-3 h-full flex items-center whitespace-nowrap
              transition-colors duration-75
              ${openMenu === menu.label
                ? 'bg-[#094771] dark:bg-[#094771] bg-green-100 text-white dark:text-white text-gray-800'
                : 'text-gray-300 dark:text-gray-300 text-gray-600 hover:bg-[#3c3c3c] dark:hover:bg-[#3c3c3c] hover:bg-gray-200'
              }
            `}
          >
            {menu.label}
          </button>

          {/* Dropdown */}
          {openMenu === menu.label && (
            <div
              className="absolute top-full left-0 min-w-[200px] z-50
                bg-[#252526] dark:bg-[#252526] bg-white
                border border-[#3c3c3c] dark:border-[#3c3c3c] border-gray-200
                shadow-xl py-1"
            >
              {menu.items.map((item, idx) => {
                if (item.separator) {
                  return (
                    <div
                      key={idx}
                      className="h-px bg-[#3c3c3c] dark:bg-[#3c3c3c] bg-gray-200 my-1 mx-2"
                    />
                  )
                }
                return (
                  <button
                    key={item.label}
                    onClick={() => handleItemClick(item)}
                    className="w-full flex items-center justify-between px-4 py-1.5
                      text-gray-300 dark:text-gray-300 text-gray-700
                      hover:bg-[#094771] dark:hover:bg-[#094771] hover:bg-green-100
                      hover:text-white dark:hover:text-white
                      text-[12px] text-left"
                  >
                    <span>{item.label}</span>
                    {item.shortcut && (
                      <span className="text-gray-500 dark:text-gray-500 text-gray-400 text-[11px] ml-8">
                        {item.shortcut}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ))}

      {/* Spacer so menu bar fills the row */}
      <div className="flex-1" />
    </div>
  )
}

export default MenuBar
