"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    const sessionRes = await fetch("/api/admin/users", {
      cache: "no-store",
    });

    if (sessionRes.status === 401) {
      await supabase.auth.signOut();
      setMessage("该账号不是管理员账号。请使用由超级管理员创建的账号登录。");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main style={pageStyle}>
      <form onSubmit={handleLogin} style={cardStyle}>
        <div style={eyebrowStyle}>Admin Login</div>
        <h1 style={headingStyle}>管理后台登录</h1>
        <p style={copyStyle}>该站点仅供运营和管理员使用，与前台用户账户体系独立。</p>

        <input
          type="email"
          value={email}
          placeholder="管理员邮箱"
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
        <input
          type="password"
          value={password}
          placeholder="密码"
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />

        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? "登录中..." : "登录"}
        </button>

        {message ? <p style={errorStyle}>{message}</p> : null}
      </form>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: "24px",
  background:
    "radial-gradient(circle at top, rgba(124,58,237,0.18) 0%, rgba(10,10,14,1) 35%, rgba(6,6,10,1) 100%)",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "420px",
  padding: "32px",
  borderRadius: "24px",
  background: "rgba(16,16,24,0.86)",
  border: "1px solid rgba(124,58,237,0.18)",
  boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
};

const eyebrowStyle: React.CSSProperties = {
  color: "#c084fc",
  fontWeight: 700,
  fontSize: "12px",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const headingStyle: React.CSSProperties = {
  marginTop: "10px",
  marginBottom: "10px",
  fontSize: "34px",
};

const copyStyle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: "22px",
  color: "#a1a1aa",
  lineHeight: 1.7,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  marginBottom: "12px",
  borderRadius: "14px",
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(0,0,0,0.28)",
  color: "white",
};

const buttonStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: "14px",
  border: "none",
  background: "linear-gradient(90deg, #7c3aed, #a855f7)",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};

const errorStyle: React.CSSProperties = {
  color: "#fca5a5",
  marginTop: "14px",
  marginBottom: 0,
};
