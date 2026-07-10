import { Camera, House, Layers, Search, Settings } from 'lucide-react'

export type DashboardView = 'dashboard' | 'scan' | 'library' | 'settings'

const NAV_ITEMS: { id: DashboardView; label: string; icon: typeof House }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: House },
  { id: 'scan', label: 'New scan', icon: Camera },
  { id: 'library', label: 'Library', icon: Layers },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export default function Sidebar({
  activeView,
  onSelectView,
  theme,
  onToggleTheme,
}: {
  activeView: DashboardView
  onSelectView: (view: DashboardView) => void
  theme: 'dark' | 'light'
  onToggleTheme: () => void
}) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <span className="dot" />
          TULASI.AI
        </div>

        <nav className="topbar-nav">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={activeView === id ? 'active' : ''}
              onClick={() => onSelectView(id)}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="topbar-actions">
          <div className="topbar-search">
            <Search size={14} />
            <input type="text" placeholder="Search" />
            <span className="kbd">/</span>
          </div>
          <button
            type="button"
            className={`sidebar-switch${theme === 'dark' ? ' on' : ''}`}
            onClick={onToggleTheme}
            aria-label="Toggle theme"
          >
            <span />
          </button>
        </div>
      </div>
    </header>
  )
}
