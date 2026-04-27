"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AcceptInvitePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let mounted = true;

    const subscription = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setHasSession(Boolean(session));
      setCheckingSession(false);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setHasSession(Boolean(data.session));
      setCheckingSession(false);
    });

    return () => {
      mounted = false;
      subscription.data.subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!hasSession) {
      setMessage("邀请链接已失效或尚未完成验证，请重新打开邮件中的邀请链接。");
      return;
    }

    if (password.length < 8) {
      setMessage("密码至少需要 8 位。");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("两次输入的密码不一致。");
      return;
    }

    setSaving(true);

    const { error } = await supabase.auth.updateUser({ password });

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main style={pageStyle}>
      <form onSubmit={handleSubmit} style={cardStyle}>
        <div style={eyebrowStyle}>Admin Invitation</div>
        <h1 style={headingStyle}>设置管理员密码</h1>
        <p style={copyStyle}>
          请为该管理员账户设置登录密码。完成后将自动进入管理后台。
        </p>

        {checkingSession ? (
          <div style={noticeStyle}>正在验证邀请链接...</div>
        ) : !hasSession ? (
          <div style={errorStyle}>邀请链接无效或已过期，请联系 Super Admin 重新发送邀请。</div>
        ) : null}

        <input
          type="password"
          value={password}
          placeholder="新密码"
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
          disabled={!hasSession || saving}
        />
        <input
          type="password"
          value={confirmPassword}
          placeholder="确认新密码"
          onChange={(e) => setConfirmPassword(e.target.value)}
          style={inputStyle}
          disabled={!hasSession || saving}
        />

        <button type="submit" disabled={!hasSession || saving} style={buttonStyle}>
          {saving ? "保存中..." : "设置密码并进入后台"}
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
  maxWidth: "440px",
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

const noticeStyle: React.CSSProperties = {
  padding: "12px 14px",
  marginBottom: "14px",
  borderRadius: "14px",
  background: "rgba(255,255,255,0.05)",
  color: "#cbd5e1",
};

const errorStyle: React.CSSProperties = {
  color: "#fca5a5",
  marginTop: "14px",
  marginBottom: "14px",
  lineHeight: 1.6,
};
