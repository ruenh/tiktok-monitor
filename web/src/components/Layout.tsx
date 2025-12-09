import { NavLink, Outlet } from "react-router-dom";
import "./Layout.css";

const navItems = [
  { path: "/", label: "Dashboard", icon: "📊" },
  { path: "/authors", label: "Authors", icon: "👥" },
  { path: "/history", label: "History", icon: "📜" },
  { path: "/settings", label: "Settings", icon: "⚙️" },
  { path: "/logs", label: "Logs", icon: "📋" },
];

function Layout() {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>TikTok Monitor</h2>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
              end={item.path === "/"}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
