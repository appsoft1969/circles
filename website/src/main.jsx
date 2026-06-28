import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronRight,
  ClipboardList,
  Coffee,
  Download,
  ExternalLink,
  Filter,
  Gift,
  Link,
  LogOut,
  Loader2,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Mic2,
  Package,
  Plus,
  ReceiptText,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Split,
  Store,
  Smartphone,
  UserCircle,
  UserPlus,
  Users,
  Utensils,
} from "lucide-react";
import "./styles.css";

const templateMeta = {
  group_buy: { label: "團購", icon: Package, accent: "green", description: "商品、數量、付款、取貨" },
  interest_check: { label: "意願調查", icon: Users, accent: "blue", description: "電影、吃飯、球賽、票券先問人數" },
  claim: { label: "領取登記", icon: Gift, accent: "green", description: "免費票券、名額、好康領取" },
  member_sale: { label: "圈內小市集", icon: Store, accent: "rose", description: "成員自售、限量、面交" },
  meal_order: { label: "訂餐", icon: Utensils, accent: "blue", description: "便當、外食、到餐領取" },
  drink_order: { label: "訂飲料", icon: Coffee, accent: "teal", description: "甜度、冰塊、加料" },
  activity: { label: "活動 / KTV", icon: Mic2, accent: "orange", description: "參加統計、訂金、AA" },
  poll: { label: "投票", icon: ClipboardList, accent: "gray", description: "時間、地點、選項" },
  expense_split: { label: "費用分攤", icon: Split, accent: "gray", description: "誰付、誰欠、誰結清" },
};

const interestConversionTargets = [
  { id: "activity", label: "正式活動", description: "出席、集合、訂金或 AA" },
  { id: "poll", label: "轉成投票", description: "決定時間、地點或方案" },
  { id: "claim", label: "領取登記", description: "票券、名額、好康分配" },
];

const paymentLabels = {
  unpaid: "未付款",
  review: "待確認",
  paid: "已付款",
  not_required: "免付款",
};

const fulfillmentLabels = {
  pending: "待處理",
  picked_up: "已領取",
  attending: "參加",
  maybe: "待確認",
  completed: "完成",
};

const membershipRoleLabels = {
  owner: "圈主",
  admin: "管理",
  member: "成員",
  guest: "訪客",
};

function money(value) {
  return `NT$${Number(value || 0).toLocaleString("zh-TW")}`;
}

function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

async function api(path, options) {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || response.statusText);
  }
  return response.json();
}

function canUseNativeShare(shareData) {
  if (!navigator.share) return false;
  if (!navigator.canShare) return true;
  try {
    return navigator.canShare(shareData);
  } catch {
    return true;
  }
}

async function shareLinkWithFallback({ url, title, text, linkLabel, setToast }) {
  const shareData = {
    title,
    text,
    url,
  };

  await navigator.clipboard?.writeText(url).catch(() => {});

  if (canUseNativeShare(shareData)) {
    try {
      await navigator.share(shareData);
      setToast(`已開啟分享選單，${linkLabel}也已複製`);
      return;
    } catch (error) {
      if (error?.name === "AbortError") {
        setToast(`${linkLabel}已複製`);
        return;
      }
    }
  }

  setToast(`${linkLabel}已複製，可貼到聊天群`);
}

function shareTaskLink(task, setToast) {
  return shareLinkWithFallback({
    url: `${window.location.origin}/join/${task.shareToken}`,
    title: `填寫 ${task.title} | 圈內 InCircle`,
    text: `請填寫「${task.title}」，圈內會自動整理名單與統計。`,
    linkLabel: "填單連結",
    setToast,
  });
}

function shareCircleInvite(invite, setToast) {
  return shareLinkWithFallback({
    url: `${window.location.origin}/invite/${invite.code}`,
    title: `加入 ${invite.circleName} | 圈內 InCircle`,
    text: `邀請你加入「${invite.circleName}」，之後圈內事項、統計與公告都會放在這裡。`,
    linkLabel: "邀請連結",
    setToast,
  });
}

function App() {
  const [state, setState] = useState({ loading: true, circles: [], tasks: [], session: null, authProviders: [] });
  const [route, setRoute] = useState({ name: "dashboard" });
  const [toast, setToast] = useState("");

  async function loadAppData() {
    const [data, session, auth] = await Promise.all([
      api("/api/bootstrap"),
      api("/api/session"),
      api("/api/auth/providers"),
    ]);
    return {
      ...data,
      session,
      authProviders: auth.providers ?? [],
      loading: false,
    };
  }

  async function refresh() {
    const data = await loadAppData();
    setState(data);
  }

  useEffect(() => {
    async function load() {
      const data = await loadAppData();
      const joinMatch = window.location.pathname.match(/^\/join\/([^/]+)/);
      if (joinMatch) {
        const shared = await api(`/api/share/${joinMatch[1]}`);
        const tasks = upsertTask(data.tasks, shared.task);
        setState({ ...data, tasks });
        setRoute({ name: "join", taskId: shared.task.id });
        return;
      }
      const inviteMatch = window.location.pathname.match(/^\/invite\/([^/]+)/);
      if (inviteMatch) {
        setState(data);
        setRoute({ name: "circleInvite", inviteCode: inviteMatch[1] });
        return;
      }
      setState(data);
    }

    load().catch((error) => setState((current) => ({ ...current, loading: false, error: error.message })));
  }, []);

  const selectedTask = useMemo(() => {
    if (route.taskId) return state.tasks.find((task) => task.id === route.taskId);
    return state.tasks[0];
  }, [route.taskId, state.tasks]);

  function go(name, extra = {}) {
    setRoute({ name, ...extra });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function updateTask(task) {
    setState((current) => ({
      ...current,
      tasks: upsertTask(current.tasks, task),
    }));
  }

  async function shareTask(task) {
    await shareTaskLink(task, setToast);
  }

  if (state.loading) {
    return (
      <Shell>
        <div className="loading">
          <Loader2 className="spin" />
          <p>載入圈內資料庫...</p>
        </div>
      </Shell>
    );
  }

  if (state.error) {
    return (
      <Shell>
        <div className="loading">
          <p>API 連線失敗：{state.error}</p>
        </div>
      </Shell>
    );
  }

  const screens = {
    dashboard: (
      <Dashboard
        circles={state.circles}
        tasks={state.tasks}
        session={state.session}
        authProviders={state.authProviders}
        go={go}
        shareTask={shareTask}
        refresh={refresh}
        setToast={setToast}
      />
    ),
    templates: (
      <TemplatePicker
        circles={state.circles}
        session={state.session}
        go={go}
        refresh={refresh}
        setToast={setToast}
        selectedTemplate={route.selectedTemplate ?? "group_buy"}
      />
    ),
    manage: selectedTask ? (
      <TaskManage
        task={selectedTask}
        go={go}
        shareTask={shareTask}
        setToast={setToast}
        updateTask={updateTask}
      />
    ) : null,
    join: selectedTask ? (
      <JoinTask
        task={selectedTask}
        go={go}
        refresh={refresh}
        setToast={setToast}
        updateTask={updateTask}
      />
    ) : null,
    members: (
      <CircleMembers
        circle={state.circles.find((circle) => circle.id === route.circleId)}
        circleId={route.circleId}
        session={state.session}
        go={go}
        refresh={refresh}
        setToast={setToast}
      />
    ),
    circleInvite: (
      <CircleInviteJoin
        code={route.inviteCode}
        session={state.session}
        providers={state.authProviders}
        go={go}
        refresh={refresh}
        setToast={setToast}
      />
    ),
  };

  return (
    <Shell toast={toast} clearToast={() => setToast("")}>
      {screens[route.name] ?? screens.dashboard}
    </Shell>
  );
}

function upsertTask(tasks, task) {
  if (tasks.some((item) => item.id === task.id)) {
    return tasks.map((item) => (item.id === task.id ? task : item));
  }
  return [task, ...tasks];
}

function Shell({ children, toast, clearToast }) {
  return (
    <main className="site-shell">
      <div className="app-frame">{children}</div>
      {toast ? (
        <div className="toast">
          <Check size={16} />
          <span>{toast}</span>
          <button type="button" onClick={clearToast}>關閉</button>
        </div>
      ) : null}
    </main>
  );
}

function Topbar({ title, subtitle, onBack, action }) {
  return (
    <header className="topbar">
      <div>
        {onBack ? (
          <button className="icon-button" type="button" onClick={onBack} aria-label="返回">
            <ArrowLeft size={22} />
          </button>
        ) : (
          <span className="brand-dot" />
        )}
      </div>
      <div className="topbar-title">
        <strong>{title}</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
      <div>{action}</div>
    </header>
  );
}

function Dashboard({ circles, tasks, session, authProviders, go, shareTask, refresh, setToast }) {
  const activeTasks = tasks.filter((task) => task.status === "open");
  const unpaid = tasks.reduce((sum, task) => sum + task.stats.unpaid + task.stats.review, 0);
  const templates = Object.entries(templateMeta);

  return (
    <>
      <Topbar
        title="圈內 InCircle"
        subtitle="熟人圈的生活辦事空間"
        action={<AuthStatusButton session={session} />}
      />
      <section className="hero">
        <h1>把群裡的 +1，變成清楚的名單與統計。</h1>
        <p>訂飲料、揪吃飯、團購、票券、KTV，誰要、幾份、誰付了，圈內幫你整理清楚。</p>
        <button className="primary-button" type="button" onClick={() => go("templates")}>
          <Plus size={18} />
          建立事項
        </button>
      </section>

      <AuthPanel
        session={session}
        providers={authProviders}
        go={go}
        refresh={refresh}
        setToast={setToast}
      />

      <section className="metric-grid">
        <Metric value={circles.length} label="圈子" />
        <Metric value={activeTasks.length} label="進行中" />
        <Metric value={unpaid} label="待付款/確認" alert />
        <Metric value={tasks.length} label="事項紀錄" />
      </section>

      <section className="section">
        <SectionTitle title="常用模板" action="建立事項" onClick={() => go("templates")} />
        <div className="template-grid">
          {templates.slice(0, 4).map(([key, meta]) => (
            <button className={`template-card ${meta.accent}`} type="button" key={key} onClick={() => go("templates", { selectedTemplate: key })}>
              <meta.icon size={22} />
              <strong>{meta.label}</strong>
              <span>{meta.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <SectionTitle title="進行中的事項" />
        <div className="task-list">
          {activeTasks.map((task) => (
            <TaskRow key={task.id} task={task} onOpen={() => go("manage", { taskId: task.id })} onShare={() => shareTask(task)} />
          ))}
        </div>
      </section>
    </>
  );
}

function AuthStatusButton({ session }) {
  return (
    <span className={`auth-status ${session?.authenticated ? "signed-in" : ""}`} title={session?.authenticated ? "已登入" : "未登入"}>
      {session?.authenticated ? <ShieldCheck size={22} /> : <UserCircle size={22} />}
    </span>
  );
}

function AuthPanel({ session, providers, go, refresh, setToast }) {
  const memberships = session?.memberships ?? [];
  const visibleMemberships = memberships.slice(0, 3);
  const extraMemberships = Math.max(0, memberships.length - visibleMemberships.length);

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
      await refresh();
      setToast("已登出");
    } catch (error) {
      setToast(error.message);
    }
  }

  if (session?.authenticated) {
    return (
      <section className="section auth-section">
        <div className="signed-in-card">
          <span className="signed-in-avatar"><UserCircle size={24} /></span>
          <span>
            <strong>{session.profile?.displayName || "圈內成員"}</strong>
            <small>{session.memberships?.length || 0} 個圈子 · {session.profile?.email || "未提供 Email"}</small>
          </span>
          <button className="icon-button" type="button" aria-label="登出" onClick={logout}>
            <LogOut size={19} />
          </button>
        </div>
        {memberships.length > 0 ? (
          <div className="membership-chip-list" aria-label="已加入的圈子">
            {visibleMemberships.map((membership) => (
              <button
                className="membership-chip"
                type="button"
                key={membership.id}
                onClick={() => go("members", { circleId: membership.circleId })}
              >
                {membership.circleName}
                <small>{membershipRoleLabels[membership.role] ?? membership.role}</small>
              </button>
            ))}
            {extraMemberships > 0 ? <span className="membership-chip more">+{extraMemberships}</span> : null}
          </div>
        ) : (
          <p className="auth-note">尚未加入圈子。可透過邀請連結加入，或由圈主管理成員。</p>
        )}
      </section>
    );
  }

  return (
    <section className="section auth-section">
      <div className="auth-heading">
        <Smartphone size={22} />
        <span>
          <strong>手機帳號快速登入</strong>
          <small>iPhone 用 Apple，Android 用 Google，也可用 LINE。</small>
        </span>
      </div>
      <div className="provider-list">
        {providers.map((provider) => (
          provider.configured ? (
            <a className="provider-button" href={`${provider.startUrl}?redirectAfter=/`} key={provider.id}>
              <span>{provider.shortLabel}</span>
              <small>{provider.platformHint}</small>
            </a>
          ) : (
            <button className="provider-button disabled" type="button" key={provider.id} disabled>
              <span>{provider.shortLabel}</span>
              <small>待設定</small>
            </button>
          )
        ))}
      </div>
    </section>
  );
}

function CircleMembers({ circle, circleId, session, go, refresh, setToast }) {
  const currentMembership = session?.memberships?.find((membership) => membership.circleId === circleId);
  const canManage = ["owner", "admin"].includes(currentMembership?.role);
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [inviteRole, setInviteRole] = useState("member");
  const [maxUses, setMaxUses] = useState(30);
  const [expireDays, setExpireDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const circleName = circle?.name ?? currentMembership?.circleName ?? "圈子成員";

  async function loadMembers() {
    if (!circleId) return;
    setLoading(true);
    setError("");
    try {
      const memberData = await api(`/api/circles/${circleId}/members`);
      setMembers(memberData.members ?? []);
      if (canManage) {
        const inviteData = await api(`/api/circles/${circleId}/invites`);
        setInvites(inviteData.invites ?? []);
      } else {
        setInvites([]);
      }
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMembers();
  }, [circleId, canManage]);

  async function createInvite() {
    if (busy) return;
    setBusy(true);
    try {
      const expiresAt = new Date(Date.now() + Math.max(1, Number(expireDays || 30)) * 24 * 60 * 60 * 1000).toISOString();
      const data = await api(`/api/circles/${circleId}/invites`, {
        method: "POST",
        body: JSON.stringify({
          role: inviteRole,
          maxUses: Math.max(1, Number(maxUses || 30)),
          expiresAt,
        }),
      });
      setInvites((current) => [data.invite, ...current]);
      await shareCircleInvite(data.invite, setToast);
    } catch (createError) {
      setToast(createError.message);
    } finally {
      setBusy(false);
    }
  }

  async function shareInvite(invite) {
    await shareCircleInvite(invite, setToast);
  }

  async function revokeInvite(invite) {
    try {
      const data = await api(`/api/circles/${circleId}/invites/${invite.id}`, {
        method: "PATCH",
        body: JSON.stringify({ revoked: true }),
      });
      setInvites((current) => current.filter((item) => item.id !== data.invite.id));
      setToast("邀請連結已停用");
    } catch (revokeError) {
      setToast(revokeError.message);
    }
  }

  async function updateMember(member, patch) {
    try {
      const data = await api(`/api/circles/${circleId}/members/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (data.member.status === "active") {
        setMembers((current) => current.map((item) => (item.id === data.member.id ? data.member : item)));
      } else {
        setMembers((current) => current.filter((item) => item.id !== data.member.id));
      }
      await refresh();
      setToast("成員設定已更新");
    } catch (updateError) {
      setToast(updateError.message);
    }
  }

  function canEdit(member) {
    if (!canManage || member.role === "owner") return false;
    if (member.profileId === session?.profile?.id) return false;
    if (currentMembership?.role !== "owner" && member.role === "admin") return false;
    return true;
  }

  return (
    <>
      <Topbar title="圈子成員" subtitle={circleName} onBack={() => go("dashboard")} />
      <section className="member-hero">
        <span className="member-hero-icon"><Users size={22} /></span>
        <div>
          <h1>{circleName}</h1>
          <p>{canManage ? "建立邀請連結、確認誰在圈內，必要時調整成員角色。" : "你可以查看目前圈內成員，邀請與角色調整由圈主管理。"}</p>
        </div>
      </section>

      {loading ? (
        <section className="section"><p className="empty-note">讀取成員資料...</p></section>
      ) : error ? (
        <section className="section"><p className="empty-note">無法讀取成員：{error}</p></section>
      ) : (
        <>
          {canManage ? (
            <section className="section invite-manager">
              <SectionTitle title="邀請新成員" />
              <div className="invite-form">
                <label>
                  加入後角色
                  <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
                    <option value="member">成員</option>
                    <option value="guest">訪客</option>
                  </select>
                </label>
                <label>
                  可使用次數
                  <input type="number" min="1" max="500" value={maxUses} onChange={(event) => setMaxUses(event.target.value)} />
                </label>
                <label>
                  有效天數
                  <input type="number" min="1" max="365" value={expireDays} onChange={(event) => setExpireDays(event.target.value)} />
                </label>
                <button className="primary-button" type="button" onClick={createInvite} disabled={busy}>
                  {busy ? <Loader2 className="spin" size={18} /> : <UserPlus size={18} />}
                  建立並分享邀請
                </button>
              </div>
              <div className="invite-list">
                {invites.length === 0 ? <p className="empty-note">目前沒有可用的邀請連結。</p> : null}
                {invites.map((invite) => (
                  <article className="invite-row" key={invite.id}>
                    <div>
                      <strong>{membershipRoleLabels[invite.role] ?? invite.role}邀請</strong>
                      <small>
                        {invite.usedCount}/{invite.maxUses ?? "不限"} 次 · 到期 {invite.expiresAt ? formatDateTime(invite.expiresAt) : "未設定"}
                      </small>
                    </div>
                    <button className="icon-button" type="button" aria-label="分享邀請連結" onClick={() => shareInvite(invite)}>
                      <Share2 size={18} />
                    </button>
                    <button className="secondary-button compact" type="button" onClick={() => revokeInvite(invite)}>
                      停用
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <section className="section member-list-section">
            <SectionTitle title={`成員名單 (${members.length})`} />
            <div className="member-list">
              {members.map((member) => {
                const editable = canEdit(member);
                return (
                  <article className="member-row" key={member.id}>
                    <span className="member-avatar"><UserCircle size={22} /></span>
                    <div className="member-main">
                      <strong>{member.displayName}</strong>
                      <small>{member.contactHint || member.circleName}</small>
                    </div>
                    {editable ? (
                      <select
                        value={member.role}
                        aria-label={`${member.displayName} 角色`}
                        onChange={(event) => updateMember(member, { role: event.target.value })}
                      >
                        {currentMembership?.role === "owner" ? <option value="admin">管理</option> : null}
                        <option value="member">成員</option>
                        <option value="guest">訪客</option>
                      </select>
                    ) : (
                      <span className="role-badge">{membershipRoleLabels[member.role] ?? member.role}</span>
                    )}
                    {editable ? (
                      <button
                        className="secondary-button compact danger"
                        type="button"
                        onClick={() => updateMember(member, { status: "removed" })}
                      >
                        移除
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}
    </>
  );
}

function CircleInviteJoin({ code, session, providers, go, refresh, setToast }) {
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadInvite() {
      setLoading(true);
      setError("");
      try {
        const data = await api(`/api/circle-invites/${code}`);
        setInvite(data.invite);
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setLoading(false);
      }
    }

    loadInvite();
  }, [code]);

  async function joinCircle() {
    if (joining) return;
    setJoining(true);
    try {
      const data = await api(`/api/circle-invites/${code}/join`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await refresh();
      setToast(data.alreadyMember ? "你已經在這個圈子內" : "已加入圈子");
      window.history.replaceState(null, "", "/");
      go("dashboard");
    } catch (joinError) {
      setToast(joinError.message);
    } finally {
      setJoining(false);
    }
  }

  const alreadyMember = invite && session?.memberships?.some((membership) => membership.circleId === invite.circleId);
  const redirectAfter = encodeURIComponent(`/invite/${code}`);

  return (
    <>
      <Topbar title="圈子邀請" subtitle="加入圈內" onBack={() => go("dashboard")} />
      {loading ? (
        <section className="section"><p className="empty-note">讀取邀請連結...</p></section>
      ) : error ? (
        <section className="section"><p className="empty-note">邀請連結無法使用：{error}</p></section>
      ) : (
        <>
          <section className="join-hero invite-join-hero">
            <span className="status open">邀請中</span>
            <h1>{invite.circleName}</h1>
            <p>{invite.circleDescription || "這是一個熟人圈的生活辦事空間，加入後可以一起看事項、統計、公告與討論。"}</p>
          </section>
          <section className="section invite-summary">
            <div>
              <strong>{membershipRoleLabels[invite.role] ?? invite.role}</strong>
              <small>加入後角色</small>
            </div>
            <div>
              <strong>{invite.maxUses ? `${invite.usedCount}/${invite.maxUses}` : `${invite.usedCount}`}</strong>
              <small>使用次數</small>
            </div>
            <div>
              <strong>{invite.expiresAt ? formatDateTime(invite.expiresAt) : "未設定"}</strong>
              <small>到期時間</small>
            </div>
          </section>
          {!session?.authenticated ? (
            <section className="section auth-section">
              <div className="auth-heading">
                <Smartphone size={22} />
                <span>
                  <strong>先登入，再加入圈子</strong>
                  <small>用手機常用帳號登入後，就能把你加入這個圈子。</small>
                </span>
              </div>
              <div className="provider-list">
                {providers.map((provider) => (
                  provider.configured ? (
                    <a className="provider-button" href={`${provider.startUrl}?redirectAfter=${redirectAfter}`} key={provider.id}>
                      <span>{provider.shortLabel}</span>
                      <small>{provider.platformHint}</small>
                    </a>
                  ) : (
                    <button className="provider-button disabled" type="button" key={provider.id} disabled>
                      <span>{provider.shortLabel}</span>
                      <small>待設定</small>
                    </button>
                  )
                ))}
              </div>
            </section>
          ) : (
            <div className="sticky-actions">
              <button className="primary-button green" type="button" onClick={joinCircle} disabled={joining || alreadyMember}>
                {joining ? <Loader2 className="spin" size={18} /> : <UserPlus size={18} />}
                {alreadyMember ? "已在圈內" : "加入這個圈子"}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Metric({ value, label, alert }) {
  return (
    <div className="metric">
      <strong className={alert ? "alert-text" : ""}>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function SectionTitle({ title, action, onClick }) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {action ? <button type="button" onClick={onClick}>{action}<ChevronRight size={16} /></button> : null}
    </div>
  );
}

function TaskRow({ task, onOpen, onShare }) {
  const meta = templateMeta[task.template] ?? templateMeta.group_buy;
  const Icon = meta.icon;
  return (
    <article className="task-row">
      <button type="button" onClick={onOpen} className="task-main">
        <span className={`task-icon ${meta.accent}`}><Icon size={19} /></span>
        <span>
          <strong>{task.title}</strong>
          <small>{task.circleName} · {meta.label} · {task.stats.responses} 筆回覆</small>
        </span>
      </button>
      <div className="task-stats">
        <b>{money(task.stats.totalAmount)}</b>
        <span>{task.stats.unpaid + task.stats.review} 待付款</span>
      </div>
      <button className="icon-button" type="button" aria-label="分享填單連結" onClick={onShare}>
        <Share2 size={19} />
      </button>
    </article>
  );
}

function TemplatePicker({ circles, session, go, refresh, setToast, selectedTemplate = "group_buy" }) {
  const manageableCircleIds = new Set(
    (session?.memberships ?? [])
      .filter((membership) => ["owner", "admin"].includes(membership.role))
      .map((membership) => membership.circleId),
  );
  const manageableCircles = circles.filter((circle) => manageableCircleIds.has(circle.id));
  const defaultCircle = getDefaultCircleForTemplate(manageableCircles, selectedTemplate);
  const [template, setTemplate] = useState(selectedTemplate);
  const [circleId, setCircleId] = useState(defaultCircle?.id ?? manageableCircles[0]?.id ?? "");
  const meta = templateMeta[template];

  async function createTask() {
    if (!circleId) {
      setToast("請先加入可管理的圈子");
      return;
    }
    const defaults = getTemplateDefaults(template);
    try {
      const data = await api("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ ...defaults, circleId, template }),
      });
      await refresh();
      setToast(`已建立${meta.label}`);
      go("manage", { taskId: data.task.id });
    } catch (error) {
      setToast(error.message);
    }
  }

  return (
    <>
      <Topbar title="建立事項" subtitle="選一個聊天群最常卡住的流程" onBack={() => go("dashboard")} />
      <section className="section">
        <div className="template-list">
          {Object.entries(templateMeta).map(([key, item]) => (
            <button
              className={`template-choice ${template === key ? "active" : ""}`}
              type="button"
              key={key}
              onClick={() => setTemplate(key)}
            >
              <item.icon size={22} />
              <span>
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>放在哪個圈子？</h2>
        <div className="circle-choice-list">
          {manageableCircles.length === 0 ? (
            <p className="empty-note">你目前沒有可建立事項的圈子。請先登入並加入圈子，或請圈主把你設為管理者。</p>
          ) : null}
          {manageableCircles.map((circle) => (
            <label key={circle.id} className="radio-row">
              <input type="radio" checked={circleId === circle.id} onChange={() => setCircleId(circle.id)} />
              <span>
                <strong>{circle.name}</strong>
                <small>{circle.description}</small>
              </span>
            </label>
          ))}
        </div>
      </section>

      <div className="sticky-actions">
        <button className="primary-button" type="button" onClick={createTask} disabled={!circleId}>
          <Plus size={18} />
          建立{meta.label}
        </button>
      </div>
    </>
  );
}

function getDefaultCircleForTemplate(circles, template) {
  if (["meal_order", "drink_order"].includes(template)) {
    return circles.find((circle) => circle.name.includes("辦公室")) ?? circles[0];
  }
  if (template === "member_sale") {
    return circles.find((circle) => circle.name.includes("小市集")) ?? circles[0];
  }
  if (["activity", "interest_check", "claim"].includes(template)) {
    return circles.find((circle) => circle.name.includes("下班")) ?? circles[0];
  }
  return circles[0];
}

function getTemplateDefaults(template) {
  const deadline = new Date(Date.now() + 1000 * 60 * 60 * 4).toISOString();
  const defaults = {
    group_buy: {
      title: "新的團購",
      description: "把商品、數量、付款狀態整理成一個連結。",
      deadlineAt: deadline,
      paymentInstructions: "團主確認後標記付款狀態。",
      pickupInstructions: "取貨方式由團主通知。",
      options: [{ title: "商品選項", subtitle: "規格", unitPrice: 100 }],
    },
    interest_check: {
      title: "電影/吃飯/票券意願調查",
      description: "還沒正式成立活動，先問圈內有多少人有興趣參加或領取。",
      deadlineAt: deadline,
      paymentInstructions: "目前只是意願調查，暫不收款。",
      pickupInstructions: "成行、取票或集合方式由主揪後續公告。",
      metadata: { stage: "interest", convertibleTo: ["activity", "poll"], noPayment: true },
      options: [
        { title: "我有興趣", subtitle: "可備註人數、時間或偏好", unitPrice: 0 },
        { title: "想先保留名額", subtitle: "票券、座位、餐廳人數可先估", unitPrice: 0 },
        { title: "這次先不參加", subtitle: "方便主揪估算比例", unitPrice: 0 },
      ],
    },
    claim: {
      title: "票券/好康領取登記",
      description: "適合免費票券、名額、贈品或好康分配，讓圈內人登記誰要領取。",
      deadlineAt: deadline,
      paymentInstructions: "免費領取或主揪另行公告費用。",
      pickupInstructions: "取票、面交、候補與領取方式由主揪公告。",
      metadata: { stage: "claim_registration", noPayment: true },
      options: [
        { title: "我要領取", subtitle: "確定需要票券、名額或好康", unitPrice: 0 },
        { title: "候補", subtitle: "若有多的名額再通知", unitPrice: 0 },
        { title: "我先不用", subtitle: "方便主揪統計分配", unitPrice: 0 },
      ],
    },
    member_sale: {
      title: "圈內成員自售",
      description: "圈內人偶爾販售自種蔬果、手作品或少量現貨，成員登記後再付款取貨。",
      deadlineAt: deadline,
      paymentInstructions: "付款方式由販售者通知，管理者可協助標記付款狀態。",
      pickupInstructions: "面交、公司自取或約定取貨點。",
      metadata: { sellerMode: "member", visibility: "circle_only" },
      options: [
        { title: "自種蔬菜箱", subtitle: "限量，依採收狀況出貨", unitPrice: 250, metadata: { limitedQuantity: true } },
        { title: "手作果醬", subtitle: "小瓶 180g", unitPrice: 180, metadata: { handmade: true } },
      ],
    },
    meal_order: {
      title: "今天午餐訂餐",
      description: "填完餐點與備註，截止後統一訂。",
      deadlineAt: deadline,
      paymentInstructions: "餐到後統一收款。",
      pickupInstructions: "餐點送達後自取。",
      options: [
        { title: "雞腿便當", subtitle: "可備註飯量", unitPrice: 130 },
        { title: "排骨便當", subtitle: "可備註不要辣", unitPrice: 120 },
      ],
    },
    drink_order: {
      title: "下午手搖飲",
      description: "選飲料、甜度、冰塊、加料。",
      deadlineAt: deadline,
      paymentInstructions: "飲料到後轉帳。",
      pickupInstructions: "前台自取。",
      options: [
        { title: "紅茶拿鐵", subtitle: "大杯", unitPrice: 65, metadata: { fields: ["甜度", "冰塊", "加料"] } },
        { title: "四季春青茶", subtitle: "大杯", unitPrice: 45, metadata: { fields: ["甜度", "冰塊"] } },
      ],
    },
    activity: {
      title: "週五下班 KTV",
      description: "先統計參加人數，滿 6 人就訂包廂。",
      deadlineAt: deadline,
      paymentInstructions: "現場 AA 或另收訂金。",
      pickupInstructions: "地點確認後貼回聊天群。",
      options: [
        { title: "我要參加", subtitle: "可備註可到時間", unitPrice: 0 },
        { title: "先暫定", subtitle: "晚點確認", unitPrice: 0 },
      ],
    },
    poll: {
      title: "時間地點投票",
      description: "把群裡的意見集中統計。",
      deadlineAt: deadline,
      options: [
        { title: "選項 A", subtitle: "", unitPrice: 0 },
        { title: "選項 B", subtitle: "", unitPrice: 0 },
      ],
    },
    expense_split: {
      title: "活動費用分攤",
      description: "記錄誰付、誰還沒結清。",
      deadlineAt: deadline,
      paymentInstructions: "請轉帳給墊付者。",
      options: [{ title: "分攤費用", subtitle: "每人預估", unitPrice: 500 }],
    },
  };
  return defaults[template] ?? defaults.group_buy;
}

function getInterestSummary(task) {
  return task.responses.reduce(
    (summary, response) => {
      const selectedText = response.items.map((item) => `${item.title} ${item.metadata?.intent ?? ""}`).join(" ");
      const quantity = response.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 1;
      if (selectedText.includes("not_this_time") || selectedText.includes("不參加") || response.rsvpStatus === "no") {
        summary.notThisTime += 1;
        summary.notThisTimeQuantity += quantity;
      } else {
        summary.positive += 1;
        summary.positiveQuantity += quantity;
        if (selectedText.includes("reserve") || selectedText.includes("保留")) {
          summary.reserve += 1;
          summary.reserveQuantity += quantity;
        }
      }
      return summary;
    },
    { positive: 0, positiveQuantity: 0, reserve: 0, reserveQuantity: 0, notThisTime: 0, notThisTimeQuantity: 0 },
  );
}

function localDateTimeValue(value, fallback = new Date(Date.now() + 1000 * 60 * 60 * 4)) {
  if (!value && !fallback) return "";
  const date = value ? new Date(value) : fallback;
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function localDateTimeToIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function cleanConversionBaseTitle(title) {
  return title.replace(/意願調查/g, "").replace(/[／/-]\s*$/g, "").trim() || title;
}

function buildConversionDraft(task, targetTemplate, summary) {
  const baseTitle = cleanConversionBaseTitle(task.title);
  const deadlineAt = localDateTimeValue();
  const drafts = {
    activity: {
      title: `${baseTitle}活動報名`,
      description: `由「${task.title}」轉成正式活動。原意願調查共有 ${summary.positiveQuantity} 個有興趣或保留名額。`,
      deadlineAt,
      paymentInstructions: "若需要訂金或 AA 分攤，主揪可後續公告。",
      pickupInstructions: "集合時間、地點與後續安排由主揪公告。",
      options: [
        { title: "我要參加", subtitle: "正式確認出席", unitPrice: 0 },
        { title: "先暫定", subtitle: "仍需主揪後續確認", unitPrice: 0 },
        { title: "這次不參加", subtitle: "保留紀錄方便統計", unitPrice: 0 },
      ],
    },
    poll: {
      title: `${baseTitle}時間地點投票`,
      description: `由「${task.title}」轉成投票。先把有興趣的人集中，再決定時間、地點或方案。`,
      deadlineAt,
      paymentInstructions: "投票階段暫不收款。",
      pickupInstructions: "投票結束後再公告正式安排。",
      options: [
        { title: "選項 A", subtitle: "請改成時間、地點或方案", unitPrice: 0 },
        { title: "選項 B", subtitle: "請改成時間、地點或方案", unitPrice: 0 },
      ],
    },
    claim: {
      title: `${baseTitle}領取登記`,
      description: `由「${task.title}」轉成領取登記。適合免費票券、名額、好康或贈品分配。`,
      deadlineAt,
      paymentInstructions: "免費領取或主揪另行公告費用。",
      pickupInstructions: "領取方式、取票方式或候補規則由主揪公告。",
      options: [
        { title: "我要領取", subtitle: "確定需要票券、名額或好康", unitPrice: 0 },
        { title: "候補", subtitle: "若有多的名額再通知", unitPrice: 0 },
        { title: "我先不用", subtitle: "方便主揪統計分配", unitPrice: 0 },
      ],
    },
  };
  return drafts[targetTemplate] ?? drafts.activity;
}

function optionPayload(options, { includeId = false } = {}) {
  return options
    .map((option) => ({
      ...(includeId && option.id ? { id: option.id } : {}),
      title: option.title.trim(),
      subtitle: option.subtitle.trim(),
      unitPrice: Number(option.unitPrice || 0),
    }))
    .filter((option) => option.title);
}

function buildTaskEditDraft(task) {
  return {
    title: task.title,
    description: task.description || "",
    deadlineAt: localDateTimeValue(task.deadlineAt, null),
    paymentInstructions: task.paymentInstructions || "",
    pickupInstructions: task.pickupInstructions || "",
    options: task.options.map((option) => ({
      id: option.id,
      title: option.title,
      subtitle: option.subtitle || "",
      unitPrice: option.unitPrice || 0,
    })),
  };
}

function TaskEditPanel({ task, setToast, updateTask }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(() => buildTaskEditDraft(task));

  useEffect(() => {
    setDraft(buildTaskEditDraft(task));
  }, [task.id, task.updatedAt]);

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function updateOption(index, patch) {
    setDraft((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) => (optionIndex === index ? { ...option, ...patch } : option)),
    }));
  }

  function addOption() {
    setDraft((current) => ({
      ...current,
      options: [...current.options, { title: `選項 ${current.options.length + 1}`, subtitle: "", unitPrice: 0 }],
    }));
  }

  function removeOption(index) {
    setDraft((current) => ({
      ...current,
      options: current.options.length <= 1 ? current.options : current.options.filter((_, optionIndex) => optionIndex !== index),
    }));
  }

  function cancel() {
    setDraft(buildTaskEditDraft(task));
    setEditing(false);
  }

  async function save() {
    if (saving) return;
    const options = optionPayload(draft.options, { includeId: true });
    if (!draft.title.trim() || options.length === 0) {
      setToast("請先填寫標題與至少一個選項");
      return;
    }

    setSaving(true);
    try {
      const data = await api(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: draft.title.trim(),
          description: draft.description.trim(),
          deadlineAt: localDateTimeToIso(draft.deadlineAt),
          paymentInstructions: draft.paymentInstructions.trim(),
          pickupInstructions: draft.pickupInstructions.trim(),
          options,
        }),
      });
      updateTask(data.task);
      setEditing(false);
      setToast("事項已更新");
    } catch (error) {
      setToast(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="section task-edit-section">
      <SectionTitle title="事項設定" action={editing ? "取消" : "編輯"} onClick={editing ? cancel : () => setEditing(true)} />
      {!editing ? (
        <div className="task-setting-summary">
          <span><strong>{task.options.length}</strong> 個選項</span>
          <span><strong>{task.deadlineAt ? formatDateTime(task.deadlineAt) : "未設定"}</strong> 截止</span>
        </div>
      ) : (
        <div className="conversion-editor">
          <label>
            事項標題
            <input value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} />
          </label>
          <label>
            截止時間
            <input type="datetime-local" value={draft.deadlineAt} onChange={(event) => updateDraft("deadlineAt", event.target.value)} />
          </label>
          <label>
            說明
            <textarea value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} />
          </label>
          <label>
            付款/費用說明
            <textarea value={draft.paymentInstructions} onChange={(event) => updateDraft("paymentInstructions", event.target.value)} />
          </label>
          <label>
            集合/領取說明
            <textarea value={draft.pickupInstructions} onChange={(event) => updateDraft("pickupInstructions", event.target.value)} />
          </label>
          <div className="option-editor-list">
            <div className="option-editor-head">
              <strong>選項</strong>
              <button className="secondary-button compact" type="button" onClick={addOption}>新增選項</button>
            </div>
            {draft.options.map((option, index) => (
              <div className="option-editor" key={option.id ?? `new-${index}`}>
                <div className="option-editor-title">
                  <span>選項 {index + 1}</span>
                  <button type="button" onClick={() => removeOption(index)} disabled={draft.options.length <= 1}>移除</button>
                </div>
                <input
                  aria-label={`事項選項 ${index + 1} 名稱`}
                  value={option.title}
                  onChange={(event) => updateOption(index, { title: event.target.value })}
                />
                <input
                  aria-label={`事項選項 ${index + 1} 補充說明`}
                  value={option.subtitle}
                  onChange={(event) => updateOption(index, { subtitle: event.target.value })}
                />
                <input
                  aria-label={`事項選項 ${index + 1} 金額`}
                  type="number"
                  min="0"
                  value={option.unitPrice}
                  onChange={(event) => updateOption(index, { unitPrice: event.target.value })}
                />
              </div>
            ))}
          </div>
          <button className="primary-button" type="button" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
            儲存設定
          </button>
        </div>
      )}
    </section>
  );
}

function InterestConversionPanel({ task, go, setToast, updateTask }) {
  const [targetTemplate, setTargetTemplate] = useState("activity");
  const [draft, setDraft] = useState(() => buildConversionDraft(task, "activity", getInterestSummary(task)));
  const [busy, setBusy] = useState(false);
  const summary = getInterestSummary(task);
  const convertedCount = Array.isArray(task.metadata?.convertedTo) ? task.metadata.convertedTo.length : 0;

  useEffect(() => {
    setDraft(buildConversionDraft(task, targetTemplate, summary));
  }, [task.id, targetTemplate]);

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function updateOption(index, patch) {
    setDraft((current) => ({
      ...current,
      options: current.options.map((option, optionIndex) => (optionIndex === index ? { ...option, ...patch } : option)),
    }));
  }

  function addOption() {
    setDraft((current) => ({
      ...current,
      options: [...current.options, { title: `選項 ${current.options.length + 1}`, subtitle: "", unitPrice: 0 }],
    }));
  }

  function removeOption(index) {
    setDraft((current) => ({
      ...current,
      options: current.options.length <= 1 ? current.options : current.options.filter((_, optionIndex) => optionIndex !== index),
    }));
  }

  async function convert() {
    if (busy) return;
    const options = optionPayload(draft.options);
    if (!draft.title.trim() || options.length === 0) {
      setToast("請先填寫標題與至少一個選項");
      return;
    }

    setBusy(true);
    try {
      const data = await api(`/api/tasks/${task.id}/convert`, {
        method: "POST",
        body: JSON.stringify({
          targetTemplate,
          title: draft.title.trim(),
          description: draft.description.trim(),
          deadlineAt: localDateTimeToIso(draft.deadlineAt),
          paymentInstructions: draft.paymentInstructions.trim(),
          pickupInstructions: draft.pickupInstructions.trim(),
          options,
          metadata: { conversionEdited: true },
        }),
      });
      updateTask(data.sourceTask);
      updateTask(data.task);
      setToast(`已轉成${templateMeta[data.task.template]?.label ?? "新事項"}`);
      go("manage", { taskId: data.task.id });
    } catch (error) {
      setToast(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section conversion-section">
      <SectionTitle title="下一步轉換" />
      <div className="interest-summary">
        <span><strong>{summary.positive}</strong> 人有興趣</span>
        <span><strong>{summary.positiveQuantity}</strong> 份/名額</span>
        <span><strong>{summary.reserve}</strong> 人先保留</span>
        <span><strong>{summary.notThisTime}</strong> 人先不參加</span>
      </div>
      <div className="conversion-list">
        {interestConversionTargets.map((target) => (
          <button
            className={`conversion-choice ${targetTemplate === target.id ? "active" : ""}`}
            type="button"
            key={target.id}
            onClick={() => setTargetTemplate(target.id)}
          >
            <strong>{target.label}</strong>
            <small>{target.description}</small>
          </button>
        ))}
      </div>
      <div className="conversion-editor">
        <label>
          後續事項標題
          <input value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} />
        </label>
        <label>
          截止時間
          <input type="datetime-local" value={draft.deadlineAt} onChange={(event) => updateDraft("deadlineAt", event.target.value)} />
        </label>
        <label>
          說明
          <textarea value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} />
        </label>
        <label>
          付款/費用說明
          <textarea value={draft.paymentInstructions} onChange={(event) => updateDraft("paymentInstructions", event.target.value)} />
        </label>
        <label>
          集合/領取說明
          <textarea value={draft.pickupInstructions} onChange={(event) => updateDraft("pickupInstructions", event.target.value)} />
        </label>
        <div className="option-editor-list">
          <div className="option-editor-head">
            <strong>後續選項</strong>
            <button className="secondary-button compact" type="button" onClick={addOption}>新增選項</button>
          </div>
          {draft.options.map((option, index) => (
            <div className="option-editor" key={`${targetTemplate}-${index}`}>
              <div className="option-editor-title">
                <span>選項 {index + 1}</span>
                <button type="button" onClick={() => removeOption(index)} disabled={draft.options.length <= 1}>移除</button>
              </div>
              <input
                aria-label={`選項 ${index + 1} 名稱`}
                value={option.title}
                onChange={(event) => updateOption(index, { title: event.target.value })}
              />
              <input
                aria-label={`選項 ${index + 1} 補充說明`}
                value={option.subtitle}
                onChange={(event) => updateOption(index, { subtitle: event.target.value })}
              />
              <input
                aria-label={`選項 ${index + 1} 金額`}
                type="number"
                min="0"
                value={option.unitPrice}
                onChange={(event) => updateOption(index, { unitPrice: event.target.value })}
              />
            </div>
          ))}
        </div>
      </div>
      <button className="primary-button" type="button" onClick={convert} disabled={busy}>
        {busy ? <Loader2 className="spin" size={18} /> : <ChevronRight size={18} />}
        建立後續事項
      </button>
      {convertedCount > 0 ? <p className="empty-note">此意願調查已轉出 {convertedCount} 筆後續事項。</p> : null}
    </section>
  );
}

function TaskManage({ task, go, shareTask, setToast, updateTask }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [announcementBody, setAnnouncementBody] = useState("");
  const [announcementPriority, setAnnouncementPriority] = useState("normal");
  const [permissions, setPermissions] = useState(null);
  const [permissionError, setPermissionError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setPermissions(null);
    setPermissionError("");

    api(`/api/tasks/${task.id}/permissions`)
      .then((data) => {
        if (!cancelled) setPermissions(data.permissions);
      })
      .catch((error) => {
        if (!cancelled) setPermissionError(error.message);
      });

    return () => {
      cancelled = true;
    };
  }, [task.id]);

  const visibleResponses = task.responses.filter((response) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "unpaid" && ["unpaid", "review"].includes(response.paymentStatus)) ||
      (filter === "paid" && response.paymentStatus === "paid") ||
      (filter === "pending" && ["pending", "attending", "maybe"].includes(response.fulfillmentStatus));
    const text = `${response.participantName} ${response.note} ${response.items.map((item) => item.title).join(" ")}`;
    return matchesFilter && text.includes(query);
  });

  async function patchResponse(response, patch) {
    if (!canManage) {
      setToast("只有主揪或管理者可以更新狀態");
      return;
    }
    const data = await api(`/api/responses/${response.id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    updateTask(data.task);
  }

  async function toggleStatus() {
    if (!canManage) {
      setToast("只有主揪或管理者可以關閉事項");
      return;
    }
    const next = task.status === "open" ? "closed" : "open";
    const data = await api(`/api/tasks/${task.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: next }),
    });
    updateTask(data.task);
    setToast(next === "open" ? "事項已重新開放" : "事項已關閉");
  }

  async function publishAnnouncement() {
    if (!canAnnounce) {
      setToast("只有主揪或管理者可以發布公告");
      return;
    }
    if (!announcementBody.trim()) return;
    const data = await api(`/api/tasks/${task.id}/announcements`, {
      method: "POST",
      body: JSON.stringify({
        title: task.template === "activity" ? "活動提醒" : "事項公告",
        body: announcementBody.trim(),
        priority: announcementPriority,
      }),
    });
    updateTask(data.task);
    setAnnouncementBody("");
    setAnnouncementPriority("normal");
    setToast("公告已發布");
  }

  const meta = templateMeta[task.template] ?? templateMeta.group_buy;
  const permissionReady = Boolean(permissions) || Boolean(permissionError);
  const canManage = Boolean(permissions?.canManage);
  const canAnnounce = Boolean(permissions?.canAnnounce);
  const canExport = Boolean(permissions?.canExport);
  const modeLabel = !permissionReady ? "確認權限" : canManage ? "管理模式" : "成員查看";

  return (
    <>
      <Topbar title={task.title} subtitle={`${task.circleName} · ${meta.label}`} onBack={() => go("dashboard")} />
      <section className="manage-head">
        <span className={`status ${task.status}`}>{task.status === "open" ? "進行中" : "已關閉"}</span>
        <span className={`role-badge ${canManage ? "manager" : ""}`}>{modeLabel}</span>
        <span>截止 {task.deadlineAt ? new Date(task.deadlineAt).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "未設定"}</span>
      </section>
      {permissionError ? (
        <section className="permission-note">
          <ShieldCheck size={17} />
          <span>無法讀取管理權限：{permissionError}</span>
        </section>
      ) : null}
      <section className="action-row">
        {!permissionReady ? (
          <button type="button" disabled><Loader2 className="spin" size={18} />確認權限</button>
        ) : canManage ? (
          <>
            <button type="button" onClick={() => shareTask(task)}><Share2 size={18} />分享填單連結</button>
            {canExport ? <a href={`/api/tasks/${task.id}/export.csv`}><Download size={18} />匯出 CSV</a> : null}
            <button type="button" onClick={() => go("join", { taskId: task.id })}><ExternalLink size={18} />預覽填單</button>
          </>
        ) : (
          <button type="button" onClick={() => go("join", { taskId: task.id })}><ExternalLink size={18} />填寫 / 留言</button>
        )}
      </section>
      <section className="metric-grid">
        <Metric value={task.stats.responses} label="回覆" />
        <Metric value={money(task.stats.totalAmount)} label="總金額" />
        <Metric value={task.stats.unpaid + task.stats.review} label="待付款" alert />
        <Metric value={task.stats.pending} label={task.template === "activity" ? "待確認/參加" : "待處理"} />
      </section>
      {canManage ? <TaskEditPanel task={task} setToast={setToast} updateTask={updateTask} /> : null}
      {canManage && task.template === "interest_check" ? (
        <InterestConversionPanel task={task} go={go} setToast={setToast} updateTask={updateTask} />
      ) : null}
      <section className="section discussion-section">
        <SectionTitle title="公告與討論" />
        {canAnnounce ? (
          <div className="publish-box">
            <textarea
              value={announcementBody}
              onChange={(event) => setAnnouncementBody(event.target.value)}
              placeholder="例如：飲料到了請到前台自取，或今晚 KTV 地點改到西門。"
            />
            <div className="publish-actions">
              <select value={announcementPriority} onChange={(event) => setAnnouncementPriority(event.target.value)} aria-label="公告重要性">
                <option value="normal">一般</option>
                <option value="important">重要</option>
                <option value="urgent">緊急</option>
              </select>
              <button type="button" onClick={publishAnnouncement}>
                <Megaphone size={18} />
                發布公告
              </button>
            </div>
          </div>
        ) : null}
        <TaskDiscussion task={task} />
      </section>
      <section className="filter-bar">
        {[
          ["all", `全部 (${task.responses.length})`],
          ["unpaid", `待付款 (${task.stats.unpaid + task.stats.review})`],
          ["paid", `已付款 (${task.stats.paid})`],
          ["pending", `待處理 (${task.stats.pending})`],
        ].map(([key, label]) => (
          <button className={filter === key ? "active" : ""} type="button" key={key} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
      </section>
      <section className="search-row">
        <Search size={18} />
        <input placeholder="搜尋姓名、品項、備註" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Filter size={18} />
      </section>
      <section className="response-list">
        {visibleResponses.map((response) => (
          <article className="response-row" key={response.id}>
            <div className="response-main">
              <strong>{response.participantName}</strong>
              <span>{response.items.map((item) => `${item.title} x ${item.quantity}`).join("、")}</span>
              <b>{money(response.totalAmount)}</b>
              {response.note ? <small>{response.note}</small> : null}
            </div>
            <div className="status-controls">
              {canManage ? (
                <>
                  <button
                    className={`pill ${response.paymentStatus}`}
                    type="button"
                    onClick={() =>
                      patchResponse(response, {
                        paymentStatus:
                          response.paymentStatus === "unpaid" ? "review" : response.paymentStatus === "review" ? "paid" : "unpaid",
                      })
                    }
                  >
                    {paymentLabels[response.paymentStatus] ?? response.paymentStatus}
                  </button>
                  <button
                    className={`pill ${response.fulfillmentStatus}`}
                    type="button"
                    onClick={() =>
                      patchResponse(response, {
                        fulfillmentStatus: response.fulfillmentStatus === "picked_up" || response.fulfillmentStatus === "completed" ? "pending" : task.template === "activity" ? "completed" : "picked_up",
                      })
                    }
                  >
                    {fulfillmentLabels[response.fulfillmentStatus] ?? response.fulfillmentStatus}
                  </button>
                </>
              ) : (
                <>
                  <span className={`pill read-only ${response.paymentStatus}`}>{paymentLabels[response.paymentStatus] ?? response.paymentStatus}</span>
                  <span className={`pill read-only ${response.fulfillmentStatus}`}>{fulfillmentLabels[response.fulfillmentStatus] ?? response.fulfillmentStatus}</span>
                </>
              )}
            </div>
          </article>
        ))}
      </section>
      {!permissionReady ? (
        <div className="sticky-actions">
          <button className="primary-button" type="button" disabled><Loader2 className="spin" size={18} />確認權限</button>
        </div>
      ) : canManage ? (
        <div className="sticky-actions two">
          <button className="secondary-button" type="button" onClick={() => go("join", { taskId: task.id })}>預覽成員填單</button>
          <button className="primary-button orange" type="button" onClick={toggleStatus}>
            <CalendarClock size={18} />
            {task.status === "open" ? "關閉事項" : "重新開放"}
          </button>
        </div>
      ) : (
        <div className="sticky-actions">
          <button className="primary-button green" type="button" onClick={() => go("join", { taskId: task.id })}>填寫 / 留言</button>
        </div>
      )}
    </>
  );
}

function TaskDiscussion({ task, compact = false }) {
  const announcements = task.announcements ?? [];
  const comments = task.comments ?? [];

  return (
    <div className={`discussion-list ${compact ? "compact" : ""}`}>
      {announcements.length === 0 && comments.length === 0 ? (
        <p className="empty-note">目前沒有公告或留言。</p>
      ) : null}
      {announcements.map((announcement) => (
        <article className={`discussion-item announcement ${announcement.priority}`} key={announcement.id}>
          <div className="discussion-icon">
            <Megaphone size={17} />
          </div>
          <div>
            <header>
              <strong>{announcement.title}</strong>
              <span>{announcement.priority === "urgent" ? "緊急" : announcement.priority === "important" ? "重要" : "公告"}</span>
            </header>
            <p>{announcement.body}</p>
            <small>{announcement.authorName || "主揪"} · {formatDateTime(announcement.publishedAt)}</small>
          </div>
        </article>
      ))}
      {comments.map((comment) => (
        <article className="discussion-item comment" key={comment.id}>
          <div className="discussion-icon">
            <MessageSquare size={17} />
          </div>
          <div>
            <header>
              <strong>{comment.participantName || comment.authorName || "成員"}</strong>
              <span>留言</span>
            </header>
            <p>{comment.body}</p>
            <small>{formatDateTime(comment.createdAt)}</small>
          </div>
        </article>
      ))}
    </div>
  );
}

function JoinTask({ task, go, refresh, setToast, updateTask }) {
  const [name, setName] = useState("王小明");
  const [note, setNote] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [quantities, setQuantities] = useState(() => Object.fromEntries(task.options.map((option, index) => [option.id, index === 0 ? 1 : 0])));
  const total = task.options.reduce((sum, option) => sum + Number(quantities[option.id] || 0) * option.unitPrice, 0);

  async function submit() {
    await api(`/api/share/${task.shareToken}/responses`, {
      method: "POST",
      body: JSON.stringify({
        participantName: name,
        note,
        items: Object.entries(quantities).map(([optionId, quantity]) => ({ optionId, quantity })),
      }),
    });
    await refresh();
    setToast("已送出，團主會在圈內看到統計");
    go("manage", { taskId: task.id });
  }

  async function sendComment() {
    if (!commentBody.trim()) return;
    const data = await api(`/api/tasks/${task.id}/comments`, {
      method: "POST",
      body: JSON.stringify({
        participantName: name || "成員",
        body: commentBody.trim(),
      }),
    });
    updateTask(data.task);
    setCommentBody("");
    setToast("已留言，主揪會在事項中看到");
  }

  return (
    <>
      <Topbar title="成員填單" subtitle="不用安裝 App" onBack={() => go("manage", { taskId: task.id })} />
      <section className="join-hero">
        <span className="status open">進行中</span>
        <h1>{task.title}</h1>
        <p>由 {task.circleName} 發起。這個連結可以貼在聊天群，大家填完就會自動統計。</p>
      </section>
      <section className="section discussion-section">
        <SectionTitle title="公告與討論" />
        <TaskDiscussion task={task} compact />
      </section>
      <section className="section">
        <h2>選擇項目</h2>
        <div className="option-list">
          {task.options.map((option) => (
            <div className="option-row" key={option.id}>
              <div>
                <strong>{option.title}</strong>
                <small>{option.subtitle}</small>
              </div>
              <b>{option.unitPrice > 0 ? money(option.unitPrice) : "不計費"}</b>
              <div className="stepper">
                <button type="button" onClick={() => setQuantities({ ...quantities, [option.id]: Math.max(0, Number(quantities[option.id] || 0) - 1) })}>-</button>
                <span>{quantities[option.id] || 0}</span>
                <button type="button" onClick={() => setQuantities({ ...quantities, [option.id]: Number(quantities[option.id] || 0) + 1 })}>+</button>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="section form-section">
        <label>姓名<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>備註<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：不要辣、微糖少冰、可到時間..." /></label>
      </section>
      <section className="section form-section">
        <h2>留言給主揪</h2>
        <label>留言<textarea value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder="例如：我會晚點到、可否幫我先留一份？" /></label>
        <button className="secondary-button" type="button" onClick={sendComment}>
          <MessageSquare size={18} />
          送出留言
        </button>
      </section>
      <section className="total-box">
        <span>預估總額</span>
        <strong>{money(total)}</strong>
        <small>{task.paymentInstructions || "付款方式由團主通知。"}</small>
      </section>
      <div className="sticky-actions">
        <button className="primary-button green" type="button" onClick={submit}>
          <Send size={18} />
          送出
        </button>
      </div>
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
