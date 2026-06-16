import React, { useState, useRef } from 'react'
import { Circle } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'

export default function TabManager(): React.ReactElement {
  const { tabs, activeTabId, addTab, closeTab, renameTab, setActiveTab, reorderTabs } = useEditorStore()
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmClose, setConfirmClose] = useState<string | null>(null)
  const dragIndex = useRef<number | null>(null)

  const startRename = (id: string, title: string) => {
    setRenamingId(id); setRenameValue(title)
  }
  const commitRename = () => {
    if (renamingId && renameValue.trim()) renameTab(renamingId, renameValue.trim())
    setRenamingId(null)
  }

  const handleClose = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const tab = tabs.find(t => t.id === id)
    // preview tabs have no dirty state, close directly
    if (tab?.type === 'preview' || !tab?.isDirty) { closeTab(id) } else { setConfirmClose(id) }
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    dragIndex.current = index
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault()
    if (dragIndex.current !== null && dragIndex.current !== toIndex) {
      reorderTabs(dragIndex.current, toIndex)
    }
    dragIndex.current = null
  }

  return (
    <div className="flex items-center bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
      {tabs.map((tab, index) => (
        <div key={tab.id}
          draggable
          onDragStart={e => handleDragStart(e, index)}
          onDragOver={e => e.preventDefault()}
          onDrop={e => handleDrop(e, index)}
          onClick={() => setActiveTab(tab.id)}
          onDoubleClick={() => tab.type !== 'preview' && startRename(tab.id, tab.title)}
          className={`flex items-center gap-1 px-3 py-2 text-sm cursor-pointer border-r border-gray-200 dark:border-gray-700 min-w-[100px] max-w-[180px] flex-shrink-0 group
            ${tab.id === activeTabId
              ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border-b-2 border-b-green-500'
              : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
        >
          {renamingId === tab.id ? (
            <input
              autoFocus
              className="flex-1 text-sm bg-transparent outline-none border-b border-green-500 min-w-0"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null) }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className="flex-1 truncate">
              {tab.isDirty && <span className="text-yellow-500 mr-1"><Circle className="w-2 h-2 inline fill-yellow-500" /></span>}
              {tab.title}
            </span>
          )}
          <button
            onClick={e => handleClose(e, tab.id)}
            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs leading-none w-4 h-4 flex items-center justify-center rounded"
          >×</button>
        </div>
      ))}

      <button onClick={() => addTab()}
        className="px-3 py-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-lg leading-none flex-shrink-0">
        +
      </button>

      {/* Close confirmation */}
      {confirmClose && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-5 w-72">
            <p className="text-sm mb-4">该标签页有未保存的内容，确认关闭？</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmClose(null)}
                className="text-sm px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">取消</button>
              <button onClick={() => { closeTab(confirmClose); setConfirmClose(null) }}
                className="text-sm px-3 py-1.5 rounded bg-red-600 text-white hover:bg-red-700">关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
