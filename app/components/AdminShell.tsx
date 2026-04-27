import Link from "next/link";
import { adminPath } from "@/lib/paths";
import { getAdminSessionUser } from "@/lib/auth";

type Props = {
  title: string;
  description: string;
  section: "dashboard" | "banners" | "accounts" | "posts" | "partners";
  partnerSubsection?: "list" | "points" | "test-order";
  children: React.ReactNode;
};

const navItems = [
  { href: "/dashboard", key: "dashboard", label: "Dashboard" },
  { href: "/accounts", key: "accounts", label: "Accounts" },
] as const;

const partnerNavItems = [
  { href: "/partners?tab=list", key: "list", label: "Partner List" },
  { href: "/partners?tab=points", key: "points", label: "Point Adjustment" },
  { href: "/partners?tab=test-order", key: "test-order", label: "Test Orders" },
] as const;

const contentNavItems = [
  { href: "/banners", key: "banners", label: "Banners" },
  { href: "/posts", key: "posts", label: "Posts" },
] as const;

export default async function AdminShell({
  title,
  description,
  section,
  partnerSubsection = "list",
  children,
}: Props) {
  const currentAdmin = await getAdminSessionUser();
  const currentRoleGroup = readRoleGroup(currentAdmin?.app_metadata, currentAdmin?.user_metadata);

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <aside style={sidebarStyle}>
          <div>
            <div style={eyebrowStyle}>Independent Admin</div>
            <h1 style={brandStyle}>MIR Partner Admin</h1>
            <p style={sidebarCopyStyle}>
              Manage public site content, homepage banners, and admin users from one console.
            </p>
          </div>

          <nav style={navStyle}>
            {navItems.map((item) => {
              const active = item.key === section;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    ...navItemStyle,
                    ...(active ? activeNavItemStyle : null),
                  }}
                >
                  {item.label}
                </Link>
              );
            })}

            <div style={navGroupStyle}>
              <div style={navGroupTitleStyle}>MIR Partner</div>
              <div style={subNavStyle}>
                {partnerNavItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      ...subNavItemStyle,
                      ...(section === "partners" && item.key === partnerSubsection
                        ? activeNavItemStyle
                        : null),
                    }}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>

            <div style={navGroupStyle}>
              <div style={navGroupTitleStyle}>Content</div>
              <div style={subNavStyle}>
                {contentNavItems.map((item) => {
                  const active = item.key === section;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      style={{
                        ...subNavItemStyle,
                        ...(active ? activeNavItemStyle : null),
                      }}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </nav>

          <div style={currentAdminStyle}>
            <div style={eyebrowStyle}>Signed in</div>
            <div style={currentEmailStyle}>
              {formatEmail(currentAdmin?.email ?? "-").map((part, index) => (
                <span key={`${part}-${index}`} style={emailLineStyle}>
                  {part}
                </span>
              ))}
            </div>
            <div style={currentRoleStyle}>{currentRoleGroup}</div>
          </div>

          <form action={adminPath("/api/auth/logout")} method="post">
            <button type="submit" style={logoutButtonStyle}>
              Log out
            </button>
          </form>
        </aside>

        <section style={contentStyle}>
          <header style={headerStyle}>
            <div style={eyebrowStyle}>Console</div>
            <h2 style={titleStyle}>{title}</h2>
            <p style={descriptionStyle}>{description}</p>
          </header>

          {children}
        </section>
      </div>
    </main>
  );
}

function formatEmail(email: string) {
  if (!email.includes("@")) {
    return [email];
  }

  const [name, domain] = email.split("@");
  return [name, domain ? `@${domain}` : ""].filter(Boolean);
}

function readRoleGroup(appMetadata: unknown, userMetadata: unknown) {
  const appValue =
    appMetadata && typeof appMetadata === "object"
      ? (appMetadata as Record<string, unknown>).role_group
      : undefined;
  const userValue =
    userMetadata && typeof userMetadata === "object"
      ? (userMetadata as Record<string, unknown>).role_group
      : undefined;
  const raw = String(appValue || userValue || "content_manager").trim();
  const allowed = new Set(["super_admin", "ops_manager", "content_manager", "analyst"]);
  return allowed.has(raw) ? raw : "content_manager";
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  padding: "24px",
  background:
    "radial-gradient(circle at top, rgba(124,58,237,0.12) 0%, rgba(10,10,14,1) 32%, rgba(6,6,10,1) 100%)",
  color: "white",
};

const shellStyle: React.CSSProperties = {
  maxWidth: "1440px",
  margin: "0 auto",
  display: "grid",
  gridTemplateColumns: "260px minmax(0, 1fr)",
  gap: "20px",
  alignItems: "start",
};

const sidebarStyle: React.CSSProperties = {
  position: "sticky",
  top: "24px",
  padding: "22px",
  borderRadius: "24px",
  background: "rgba(16,16,24,0.82)",
  border: "1px solid rgba(124,58,237,0.18)",
  display: "grid",
  gap: "20px",
};

const eyebrowStyle: React.CSSProperties = {
  color: "#c084fc",
  fontWeight: 700,
  fontSize: "12px",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const brandStyle: React.CSSProperties = {
  marginTop: "10px",
  marginBottom: "8px",
  fontSize: "34px",
};

const sidebarCopyStyle: React.CSSProperties = {
  margin: 0,
  color: "#9ca3af",
  lineHeight: 1.7,
  fontSize: "14px",
};

const navStyle: React.CSSProperties = {
  display: "grid",
  gap: "8px",
};

const navGroupStyle: React.CSSProperties = {
  display: "grid",
  gap: "8px",
  paddingTop: "10px",
  marginTop: "4px",
  borderTop: "1px solid rgba(255,255,255,0.06)",
};

const navGroupTitleStyle: React.CSSProperties = {
  padding: "0 4px",
  color: "#9ca3af",
  fontSize: "12px",
  fontWeight: 800,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const subNavStyle: React.CSSProperties = {
  display: "grid",
  gap: "6px",
  paddingLeft: "12px",
};

const navItemStyle: React.CSSProperties = {
  display: "block",
  padding: "12px 14px",
  borderRadius: "14px",
  color: "#e5e7eb",
  textDecoration: "none",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.04)",
  fontWeight: 700,
};

const activeNavItemStyle: React.CSSProperties = {
  background: "linear-gradient(90deg, rgba(124,58,237,0.22), rgba(168,85,247,0.18))",
  border: "1px solid rgba(192,132,252,0.28)",
  color: "white",
  boxShadow: "0 0 18px rgba(124,58,237,0.16)",
};

const subNavItemStyle: React.CSSProperties = {
  ...navItemStyle,
  padding: "10px 12px",
  fontSize: "14px",
  background: "rgba(255,255,255,0.025)",
};

const logoutButtonStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "14px",
  padding: "12px 14px",
  background: "rgba(255,255,255,0.04)",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};

const currentAdminStyle: React.CSSProperties = {
  padding: "14px",
  borderRadius: "16px",
  background: "rgba(255,255,255,0.035)",
  border: "1px solid rgba(255,255,255,0.06)",
};

const currentEmailStyle: React.CSSProperties = {
  marginTop: "8px",
  color: "white",
  fontWeight: 800,
  fontSize: "14px",
};

const emailLineStyle: React.CSSProperties = {
  display: "block",
  overflowWrap: "anywhere",
  lineHeight: 1.45,
};

const currentRoleStyle: React.CSSProperties = {
  marginTop: "6px",
  color: "#d8b4fe",
  fontSize: "13px",
  fontWeight: 800,
};

const contentStyle: React.CSSProperties = {
  minWidth: 0,
};

const headerStyle: React.CSSProperties = {
  marginBottom: "20px",
};

const titleStyle: React.CSSProperties = {
  marginTop: "10px",
  marginBottom: "10px",
  fontSize: "40px",
};

const descriptionStyle: React.CSSProperties = {
  margin: 0,
  color: "#cbd5e1",
  lineHeight: 1.7,
  maxWidth: "880px",
};
