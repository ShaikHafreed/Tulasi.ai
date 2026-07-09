import { Camera, House, Layers, PanelLeft, Search, Settings } from 'lucide-react'

export type DashboardView = 'dashboard' | 'scan' | 'library' | 'settings'

const NAV_ITEMS: { id: DashboardView; label: string; icon: typeof House }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: House },
  { id: 'scan', label: 'New scan', icon: Camera },
  { id: 'library', label: 'Library', icon: Layers },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export default function Sidebar({
  collapsed,
  onToggleCollapsed,
  activeView,
  onSelectView,
  theme,
  onToggleTheme,
}: {
  collapsed: boolean
  onToggleCollapsed: () => void
  activeView: DashboardView
  onSelectView: (view: DashboardView) => void
  theme: 'dark' | 'light'
  onToggleTheme: () => void
}) {
  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="sidebar-inner">
        <header className="sidebar-header">
          <div className="brand">
            <span className="dot" />
            {!collapsed && 'TULASI.AI'}
          </div>
          <button type="button" className="collapse-btn" onClick={onToggleCollapsed} aria-label="Toggle sidebar">
            <PanelLeft size={17} />
          </button>
        </header>

        {!collapsed && (
          <div className="sidebar-search">
            <Search size={15} />
            <input type="text" placeholder="Search" />
            <span className="kbd">/</span>
          </div>
        )}

        <ul className="sidebar-nav">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button
                type="button"
                className={activeView === id ? 'active' : ''}
                onClick={() => onSelectView(id)}
                title={collapsed ? label : undefined}
              >
                <Icon size={17} />
                {!collapsed && <span>{label}</span>}
              </button>
            </li>
          ))}
        </ul>

        <div className="sidebar-theme">
          <button
            type="button"
            className={`sidebar-switch${theme === 'dark' ? ' on' : ''}`}
            onClick={onToggleTheme}
            aria-label="Toggle theme"
          >
            <span />
          </button>
          {!collapsed && <span style={{ fontSize: 11 }}>{theme === 'dark' ? 'Night' : 'Day'}</span>}
        </div>
      </div>
    </aside>
  )
}
