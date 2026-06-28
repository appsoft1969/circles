import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  Bell,
  BellDot,
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

const createTaskSteps = [
  { id: "template", label: "選類型" },
  { id: "circle", label: "選圈子" },
  { id: "confirm", label: "確認" },
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
  const [state, setState] = useState({ loading: true, circles: [], tasks: [], notifications: [], session: null, authProviders: [] });
  const [route, setRoute] = useState({ name: "dashboard" });
  const [toast, setToast] = useState("");

  async function loadAppData() {
    const [data, session, auth] = await Promise.all([
      api("/api/bootstrap"),
      api("/api/session"),
      api("/api/auth/providers"),
    ]);
    let notifications = [];
    if (session.authenticated) {
      try {
        const notificationData = await api("/api/notifications");
        notifications = notificationData.notifications ?? [];
      } catch {
        notifications = [];
      }
    }
    return {
      ...data,
      notifications,
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
        notifications={state.notifications}
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
        selectedTemplate={route.selectedTemplate}
      />
    ),
    createCircle: (
      <CircleCreator
        session={state.session}
        providers={state.authProviders}
        go={go}
        refresh={refresh}
        setToast={setToast}
      />
    ),
    manage: selectedTask ? (
      <TaskManage
        task={selectedTask}
        session={state.session}
        go={go}
        shareTask={shareTask}
        setToast={setToast}
        updateTask={updateTask}
      />
    ) : null,
    join: selectedTask ? (
      <JoinTask
        task={selectedTask}
        session={state.session}
        providers={state.authProviders}
        go={go}
        refresh={refresh}
        setToast={setToast}
        updateTask={updateTask}
      />
    ) : null,
    notifications: (
      <NotificationCenter
        notifications={state.notifications}
        circles={state.circles}
        go={go}
        refresh={refresh}
        setToast={setToast}
      />
    ),
    circleChat: (
      <CircleChat
        circle={state.circles.find((circle) => circle.id === route.circleId)}
        circleId={route.circleId}
        initialConversationId={route.conversationId}
        session={state.session}
        go={go}
        refresh={refresh}
        setToast={setToast}
      />
    ),
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

function Dashboard({ circles, tasks, notifications, session, authProviders, go, shareTask, refresh, setToast }) {
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

      <CommunicationPanel
        notifications={notifications}
        session={session}
        go={go}
      />

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
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileNameDraft, setProfileNameDraft] = useState(session?.profile?.displayName || "");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    setProfileNameDraft(session?.profile?.displayName || "");
    setEditingProfile(false);
  }, [session?.profile?.displayName]);

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
      await refresh();
      setToast("已登出");
    } catch (error) {
      setToast(error.message);
    }
  }

  async function saveProfile() {
    if (savingProfile) return;
    if (!profileNameDraft.trim()) {
      setToast("先填你想顯示的名字");
      return;
    }
    setSavingProfile(true);
    try {
      const data = await api("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ displayName: profileNameDraft.trim() }),
      });
      await refresh();
      setEditingProfile(false);
      setToast(`已更新為「${data.profile.displayName}」`);
    } catch (error) {
      setToast(error.message);
    } finally {
      setSavingProfile(false);
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
        <button className="editor-panel-toggle profile-edit-toggle" type="button" onClick={() => setEditingProfile((current) => !current)}>
          <span>
            <strong>{editingProfile ? "收起個人名稱" : "調整顯示名稱"}</strong>
            <small>填單時會先帶入這個名字；Email 只做登入識別。</small>
          </span>
          <ChevronRight className={editingProfile ? "open" : ""} size={18} />
        </button>
        {editingProfile ? (
          <div className="editor-panel-content profile-edit-panel">
            <label>
              顯示名稱
              <input
                value={profileNameDraft}
                onChange={(event) => setProfileNameDraft(event.target.value)}
                maxLength={40}
                placeholder="例如：Kevin"
              />
            </label>
            <button className="primary-button green compact" type="button" onClick={saveProfile} disabled={savingProfile || !profileNameDraft.trim()}>
              {savingProfile ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
              好了，儲存名稱
            </button>
          </div>
        ) : null}
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
          <div className="membership-empty-card">
            <UserPlus size={20} />
            <div>
              <strong>你還沒有加入圈子</strong>
              <small>收到圈主分享的邀請連結後，打開連結就能加入。還沒有連結的話，請圈主在成員頁建立邀請給你。</small>
              <button className="secondary-button compact" type="button" onClick={() => go("createCircle")}>
                <Plus size={16} />
                建立自己的圈子
              </button>
            </div>
          </div>
        )}
        {memberships.length > 0 ? (
          <button className="secondary-button compact membership-create-button" type="button" onClick={() => go("createCircle")}>
            <Plus size={16} />
            建立新圈子
          </button>
        ) : null}
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

function CircleCreator({ session, providers, go, refresh, setToast }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function createCircle() {
    if (saving) return;
    if (!name.trim()) {
      setToast("先幫圈子取個名稱");
      return;
    }
    setSaving(true);
    try {
      const data = await api("/api/circles", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
        }),
      });
      await refresh();
      setToast(`已建立「${data.circle.name}」`);
      go("members", { circleId: data.circle.id });
    } catch (error) {
      setToast(error.message);
    } finally {
      setSaving(false);
    }
  }

  if (!session?.authenticated) {
    return (
      <>
        <Topbar title="建立圈子" subtitle="先登入" onBack={() => go("dashboard")} />
        <section className="join-hero">
          <h1>先確認你是誰，再建立圈子</h1>
          <p>圈子建立後，你會成為圈主，可以再分享邀請連結給熟人加入。</p>
        </section>
        <AuthPanel session={session} providers={providers} go={go} refresh={refresh} setToast={setToast} />
      </>
    );
  }

  return (
    <>
      <Topbar title="建立圈子" subtitle="先開一個熟人圈" onBack={() => go("dashboard")} />
      <section className="section wizard-overview">
        <p>先建立一個熟人圈，再邀請成員進來。之後訂飲料、揪活動、統計付款，都可以放在這個圈子裡。</p>
      </section>
      <section className="section wizard-section form-section">
        <div className="wizard-step-head">
          <span className="step-pill">1/1</span>
          <div>
            <h2>這個圈子叫什麼？</h2>
            <p>先取一個大家一看就知道的名字，說明可以之後再補。</p>
          </div>
        </div>
        <label>
          圈子名稱
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            placeholder="例如：辦公室午餐圈"
          />
        </label>
        <label>
          簡單說明
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={160}
            placeholder="例如：公司中午訂餐、飲料、下午茶"
          />
        </label>
      </section>
      <div className="sticky-actions">
        <button className="primary-button green" type="button" onClick={createCircle} disabled={saving || !name.trim()}>
          {saving ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
          好了，建立圈子
        </button>
      </div>
    </>
  );
}

function CommunicationPanel({ notifications = [], session, go }) {
  const memberships = session?.memberships ?? [];
  if (!session?.authenticated || memberships.length === 0) return null;

  const uniqueMemberships = memberships.filter(
    (membership, index, list) => list.findIndex((item) => item.circleName === membership.circleName) === index,
  );
  const visibleMemberships = uniqueMemberships.slice(0, 4);
  const unreadCount = notifications.filter((notification) => !notification.readAt).length;
  const priorityUnreadCount = notifications.filter((notification) => !notification.readAt && notificationPriority(notification)).length;

  return (
    <section className="section communication-section">
      <SectionTitle
        title="通知與討論"
        action={unreadCount > 0 ? `未讀 ${unreadCount}` : "看通知"}
        onClick={() => go("notifications")}
      />
      <div className="communication-grid">
        <button className={`communication-card ${unreadCount > 0 ? "unread" : ""}`} type="button" onClick={() => go("notifications")}>
          <span className="communication-icon">{unreadCount > 0 ? <BellDot size={20} /> : <Bell size={20} />}</span>
          <strong>{unreadCount > 0 ? `${unreadCount} 則未讀` : "通知中心"}</strong>
          <small>{priorityUnreadCount > 0 ? `有 ${priorityUnreadCount} 則重要提醒` : "圈內訊息與提醒"}</small>
        </button>
        {visibleMemberships.map((membership) => (
          <button
            className="communication-card"
            type="button"
            key={membership.id}
            onClick={() => go("circleChat", { circleId: membership.circleId })}
          >
            <span className="communication-icon"><MessageCircle size={20} /></span>
            <strong>{membership.circleName}</strong>
            <small>{membershipRoleLabels[membership.role] ?? membership.role} · 討論</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function notificationPriority(notification) {
  const priority = notification.data?.priority;
  return priority === "urgent" || priority === "important" ? priority : "";
}

function notificationBadgeLabel(notification) {
  const priority = notificationPriority(notification);
  if (priority === "urgent") return "緊急";
  if (priority === "important") return "重要";
  if (notification.type === "announcement") return "公告";
  if (notification.type === "message") return "討論";
  return "通知";
}

function CircleMembers({ circle, circleId, session, go, refresh, setToast }) {
  const currentMembership = session?.memberships?.find((membership) => membership.circleId === circleId);
  const canManage = ["owner", "admin"].includes(currentMembership?.role);
  const canEditCircle = currentMembership?.role === "owner";
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [inviteRole, setInviteRole] = useState("member");
  const [maxUses, setMaxUses] = useState(30);
  const [expireDays, setExpireDays] = useState(30);
  const [showInviteSettings, setShowInviteSettings] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState("");
  const [editingMemberId, setEditingMemberId] = useState("");
  const [memberNameDraft, setMemberNameDraft] = useState("");
  const [memberContactDraft, setMemberContactDraft] = useState("");
  const [editingCircle, setEditingCircle] = useState(false);
  const [circleNameDraft, setCircleNameDraft] = useState(circle?.name ?? currentMembership?.circleName ?? "");
  const [circleDescriptionDraft, setCircleDescriptionDraft] = useState(circle?.description ?? "");
  const [savingCircle, setSavingCircle] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const circleName = circle?.name ?? currentMembership?.circleName ?? "圈子成員";
  const circleDescription = circle?.description ?? "";
  const inviteSettingsSummary = `${membershipRoleLabels[inviteRole] ?? inviteRole} · ${Math.max(1, Number(maxUses || 30))} 次 · ${Math.max(1, Number(expireDays || 30))} 天`;
  const onlyOwnerSoFar = canManage && members.length <= 1;

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

  useEffect(() => {
    setCircleNameDraft(circle?.name ?? currentMembership?.circleName ?? "");
    setCircleDescriptionDraft(circleDescription);
    setEditingCircle(false);
  }, [circleId, circle?.name, currentMembership?.circleName, circleDescription]);

  async function saveCircleSettings() {
    if (savingCircle) return;
    if (!circleNameDraft.trim()) {
      setToast("先幫圈子取個名稱");
      return;
    }
    setSavingCircle(true);
    try {
      const data = await api(`/api/circles/${circleId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: circleNameDraft.trim(),
          description: circleDescriptionDraft.trim(),
        }),
      });
      await refresh();
      setEditingCircle(false);
      setToast(`已更新「${data.circle.name}」`);
    } catch (saveError) {
      setToast(saveError.message);
    } finally {
      setSavingCircle(false);
    }
  }

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
        setConfirmRemoveId("");
      }
      await refresh();
      setToast("成員設定已更新");
    } catch (updateError) {
      setToast(updateError.message);
    }
  }

  function startEditingMember(member) {
    setConfirmRemoveId("");
    setEditingMemberId(member.id);
    setMemberNameDraft(member.displayName || "");
    setMemberContactDraft(member.contactHint || "");
  }

  async function saveMemberInfo(member) {
    if (!memberNameDraft.trim()) {
      setToast("先填這位成員要顯示的名字");
      return;
    }
    await updateMember(member, {
      displayName: memberNameDraft.trim(),
      contactHint: memberContactDraft.trim(),
    });
    setEditingMemberId("");
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
          <p>
            {canManage
              ? onlyOwnerSoFar
                ? "圈子已建立。接下來先邀請熟人進來，之後就能在這裡一起建立事項與統計。"
                : "要加人時，先建立邀請連結再分享出去；角色或期限有需要再調整。"
              : "這裡看得到圈內有哪些人，邀請與角色調整由圈主管理。"}
          </p>
        </div>
      </section>

      {loading ? (
        <section className="section"><p className="empty-note">讀取成員資料...</p></section>
      ) : error ? (
        <section className="section"><p className="empty-note">無法讀取成員：{error}</p></section>
      ) : (
        <>
          {canEditCircle ? (
            <section className="section wizard-section form-section">
              <SectionTitle title="圈子設定" action={editingCircle ? "取消" : "編輯"} onClick={() => setEditingCircle((current) => !current)} />
              {editingCircle ? (
                <>
                  <div className="wizard-step-head">
                    <span className="step-pill">設定</span>
                    <div>
                      <h2>圈子名稱要怎麼顯示？</h2>
                      <p>名稱讓大家一眼看懂，說明只要補一句這個圈子平常做什麼就好。</p>
                    </div>
                  </div>
                  <label>
                    圈子名稱
                    <input
                      value={circleNameDraft}
                      onChange={(event) => setCircleNameDraft(event.target.value)}
                      maxLength={40}
                      placeholder="例如：辦公室午餐圈"
                    />
                  </label>
                  <label>
                    簡單說明
                    <textarea
                      value={circleDescriptionDraft}
                      onChange={(event) => setCircleDescriptionDraft(event.target.value)}
                      maxLength={160}
                      placeholder="例如：公司中午訂餐、飲料、下午茶"
                    />
                  </label>
                  <button className="primary-button green" type="button" onClick={saveCircleSettings} disabled={savingCircle || !circleNameDraft.trim()}>
                    {savingCircle ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
                    好了，儲存設定
                  </button>
                </>
              ) : (
                <button className="selected-summary" type="button" onClick={() => setEditingCircle(true)}>
                  <Users size={20} />
                  <span>
                    <strong>{circleName}</strong>
                    <small>{circleDescription || "還沒有說明，點這裡補一句讓成員更清楚。"}</small>
                  </span>
                  <ChevronRight size={18} />
                </button>
              )}
            </section>
          ) : null}

          {canManage ? (
            <section className="section invite-manager">
              <SectionTitle title="邀請新成員" />
              <div className="invite-guide">
                <div className="wizard-step-head">
                  <span className="step-pill">邀請</span>
                  <div>
                    <h2>{onlyOwnerSoFar ? "先邀請熟人進來" : "要加人進來嗎？"}</h2>
                    <p>
                      {onlyOwnerSoFar
                        ? "建立邀請後會直接打開分享面板，你可以貼到常用的群組，讓大家自己加入。"
                        : "先用目前設定建立邀請。建立後會直接打開分享面板，方便貼到你常用的群組。"}
                    </p>
                  </div>
                </div>
                <button className="primary-button" type="button" onClick={createInvite} disabled={busy}>
                  {busy ? <Loader2 className="spin" size={18} /> : <UserPlus size={18} />}
                  建立並分享邀請
                </button>
                <button className="editor-panel-toggle" type="button" onClick={() => setShowInviteSettings((current) => !current)}>
                  <span>
                    <strong>{showInviteSettings ? "收起邀請設定" : "調整邀請設定"}</strong>
                    <small>目前：{inviteSettingsSummary}</small>
                  </span>
                  <ChevronRight className={showInviteSettings ? "open" : ""} size={18} />
                </button>
                {showInviteSettings ? (
                  <div className="editor-panel-content invite-form">
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
                  </div>
                ) : null}
              </div>
              <div className="invite-list">
                {invites.length === 0 ? <p className="empty-note">還沒有邀請連結。要加人時，按上方按鈕就能建立並分享。</p> : null}
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
                const editingThisMember = editingMemberId === member.id;
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
                      editingThisMember ? (
                        <div className="member-edit-panel">
                          <label>
                            顯示名稱
                            <input
                              value={memberNameDraft}
                              onChange={(event) => setMemberNameDraft(event.target.value)}
                              maxLength={40}
                              placeholder="例如：小美"
                            />
                          </label>
                          <label>
                            聯絡備註
                            <input
                              value={memberContactDraft}
                              onChange={(event) => setMemberContactDraft(event.target.value)}
                              maxLength={80}
                              placeholder="例如：訂餐窗口、同事、隔壁部門"
                            />
                          </label>
                          <div className="member-edit-actions">
                            <button className="secondary-button compact" type="button" onClick={() => setEditingMemberId("")}>
                              取消
                            </button>
                            <button className="primary-button green compact" type="button" onClick={() => saveMemberInfo(member)} disabled={!memberNameDraft.trim()}>
                              好了，儲存
                            </button>
                          </div>
                        </div>
                      ) : confirmRemoveId === member.id ? (
                        <div className="member-remove-confirm">
                          <span>確定要把 {member.displayName} 移出圈子嗎？</span>
                          <button className="secondary-button compact" type="button" onClick={() => setConfirmRemoveId("")}>
                            先不要
                          </button>
                          <button
                            className="secondary-button compact danger"
                            type="button"
                            onClick={() => updateMember(member, { status: "removed" })}
                          >
                            確定移除
                          </button>
                        </div>
                      ) : (
                        <div className="member-row-actions">
                          <button className="secondary-button compact" type="button" onClick={() => startEditingMember(member)}>
                            編輯資料
                          </button>
                          <button
                            className="secondary-button compact danger"
                            type="button"
                            onClick={() => setConfirmRemoveId(member.id)}
                          >
                            移除
                          </button>
                        </div>
                      )
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
            <p>{invite.circleDescription || "有人邀請你加入這個熟人圈。加入後，圈內的事項、統計、公告與討論都會放在這裡。"}</p>
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
                  <strong>先確認你是誰，再加入圈子</strong>
                  <small>用手機常用帳號登入後，就能把你加進這個圈子。</small>
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
                {alreadyMember ? "你已經在這個圈子裡" : "好，加入這個圈子"}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function NotificationCenter({ notifications = [], circles = [], go, refresh, setToast }) {
  const circleNames = new Map(circles.map((circle) => [circle.id, circle.name]));
  const [markingAll, setMarkingAll] = useState(false);
  const unreadNotifications = notifications.filter((notification) => !notification.readAt);
  const unreadCount = unreadNotifications.length;
  const priorityUnreadCount = unreadNotifications.filter((notification) => notificationPriority(notification)).length;

  async function openNotification(notification) {
    try {
      if (!notification.readAt) {
        await api(`/api/notifications/${notification.id}/read`, { method: "PATCH" });
        await refresh();
      }
      if (notification.data?.conversationId && notification.circleId) {
        go("circleChat", { circleId: notification.circleId, conversationId: notification.data.conversationId });
        return;
      }
      if (notification.taskId) {
        go("manage", { taskId: notification.taskId });
        return;
      }
      if (notification.circleId) {
        go("circleChat", { circleId: notification.circleId });
        return;
      }
      setToast("通知已讀");
    } catch (error) {
      setToast(error.message);
    }
  }

  async function markAllRead() {
    if (unreadCount === 0 || markingAll) return;
    setMarkingAll(true);
    try {
      const data = await api("/api/notifications/read-all", { method: "PATCH" });
      await refresh();
      setToast(data.count > 0 ? "這些通知都先標成已讀了" : "目前沒有未讀通知");
    } catch (error) {
      setToast(error.message);
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <>
      <Topbar title="通知中心" subtitle="圈內訊息與提醒" onBack={() => go("dashboard")} />
      <section className="section notification-list-section">
        <div className="notification-summary">
          <div>
            <strong>{unreadCount > 0 ? `還有 ${unreadCount} 則沒看` : "目前沒有未讀通知"}</strong>
            <p>{priorityUnreadCount > 0 ? `其中 ${priorityUnreadCount} 則是重要或緊急提醒。` : "點開通知就能回到相關圈子、事項或討論串。"}</p>
          </div>
          {unreadCount > 0 ? (
            <button className="secondary-button compact" type="button" onClick={markAllRead} disabled={markingAll}>
              {markingAll ? <Loader2 className="spin" size={16} /> : <Check size={16} />}
              全部已讀
            </button>
          ) : null}
        </div>
        {notifications.length === 0 ? <p className="empty-note">目前沒有通知。有新的公告或討論時會出現在這裡。</p> : null}
        <div className="notification-list">
          {notifications.map((notification) => {
            const priority = notificationPriority(notification);
            const badgeLabel = notificationBadgeLabel(notification);
            return (
              <button
                className={["notification-row", notification.readAt ? "read" : "unread", priority].filter(Boolean).join(" ")}
                type="button"
                key={notification.id}
                onClick={() => openNotification(notification)}
              >
                <span className="notification-icon">{notification.readAt ? <Bell size={18} /> : <BellDot size={18} />}</span>
                <span className="notification-main">
                  <strong>{notification.title}</strong>
                  <span className="notification-meta-line">
                    <small>{circleNames.get(notification.circleId) ?? "圈內"} · {formatDateTime(notification.createdAt)}</small>
                    <b className={`notification-badge ${priority || notification.type}`}>{badgeLabel}</b>
                  </span>
                  <em>{notification.body}</em>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}

function CircleChat({ circle, circleId, initialConversationId, session, go, refresh, setToast }) {
  const membership = session?.memberships?.find((item) => item.circleId === circleId);
  const circleName = circle?.name ?? membership?.circleName ?? "圈內討論";
  const [conversations, setConversations] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState(initialConversationId ?? "");
  const [messages, setMessages] = useState([]);
  const [messageBody, setMessageBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const selectedConversation = conversations.find((conversation) => conversation.id === selectedConversationId) ?? null;

  async function loadConversations(preferredConversationId = initialConversationId) {
    if (!circleId) return;
    setLoading(true);
    setError("");
    try {
      const data = await api(`/api/circles/${circleId}/conversations`);
      const nextConversations = data.conversations ?? [];
      setConversations(nextConversations);
      const nextSelected =
        nextConversations.find((conversation) => conversation.id === preferredConversationId) ??
        nextConversations.find((conversation) => conversation.id === selectedConversationId) ??
        nextConversations[0] ??
        null;
      setSelectedConversationId(nextSelected?.id ?? "");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(conversationId = selectedConversationId) {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    setMessagesLoading(true);
    try {
      const data = await api(`/api/conversations/${conversationId}/messages`);
      const nextMessages = data.messages ?? [];
      setMessages(nextMessages);
      const latestOtherMessage = [...nextMessages].reverse().find((message) => message.authorProfileId !== session?.profile?.id);
      if (latestOtherMessage) {
        await api(`/api/messages/${latestOtherMessage.id}/read`, {
          method: "POST",
          body: JSON.stringify({}),
        }).catch(() => {});
      }
    } catch (loadError) {
      setToast(loadError.message);
    } finally {
      setMessagesLoading(false);
    }
  }

  useEffect(() => {
    loadConversations(initialConversationId);
  }, [circleId, initialConversationId]);

  useEffect(() => {
    loadMessages(selectedConversationId);
  }, [selectedConversationId]);

  async function createConversation() {
    try {
      const data = await api(`/api/circles/${circleId}/conversations`, {
        method: "POST",
        body: JSON.stringify({
          type: "circle",
          title: `${circleName} 討論`,
        }),
      });
      setConversations((current) => [data.conversation, ...current]);
      setSelectedConversationId(data.conversation.id);
      setToast("已建立圈內討論");
    } catch (createError) {
      setToast(createError.message);
    }
  }

  async function sendMessage() {
    if (!selectedConversationId || !messageBody.trim() || sending) return;
    setSending(true);
    try {
      const data = await api(`/api/conversations/${selectedConversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: messageBody.trim() }),
      });
      setMessages((current) => [...current, data.message]);
      setMessageBody("");
      setConversations((current) =>
        current.map((conversation) => (conversation.id === data.conversation.id ? data.conversation : conversation)),
      );
      await refresh();
    } catch (sendError) {
      setToast(sendError.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Topbar title="圈內討論" subtitle={circleName} onBack={() => go("dashboard")} />
      {loading ? (
        <section className="section"><p className="empty-note">讀取討論...</p></section>
      ) : error ? (
        <section className="section"><p className="empty-note">無法讀取討論：{error}</p></section>
      ) : (
        <>
          <section className="section conversation-section">
            <SectionTitle title="討論串" action="新增" onClick={createConversation} />
            {conversations.length === 0 ? (
              <div className="empty-action">
                <p className="empty-note">目前沒有討論。</p>
                <button className="primary-button" type="button" onClick={createConversation}>
                  <MessageCircle size={18} />
                  建立圈內討論
                </button>
              </div>
            ) : (
              <div className="conversation-list">
                {conversations.map((conversation) => (
                  <button
                    className={`conversation-row ${conversation.id === selectedConversationId ? "active" : ""}`}
                    type="button"
                    key={conversation.id}
                    onClick={() => setSelectedConversationId(conversation.id)}
                  >
                    <span className="conversation-icon"><MessageCircle size={18} /></span>
                    <span>
                      <strong>{conversation.title}</strong>
                      <small>{conversation.type === "task" ? "事項討論" : "圈內討論"} · {formatDateTime(conversation.updatedAt)}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {selectedConversation ? (
            <section className="section message-section">
              <SectionTitle title={selectedConversation.title} />
              {messagesLoading ? <p className="empty-note">讀取訊息...</p> : null}
              {!messagesLoading && messages.length === 0 ? <p className="empty-note">目前沒有訊息。</p> : null}
              <div className="message-list">
                {messages.map((message) => (
                  <article
                    className={`message-bubble ${message.authorProfileId === session?.profile?.id ? "mine" : ""}`}
                    key={message.id}
                  >
                    <strong>{message.authorName || "圈內成員"}</strong>
                    <p>{message.body}</p>
                    <small>{formatDateTime(message.createdAt)}</small>
                  </article>
                ))}
              </div>
              <div className="message-composer">
                <textarea
                  value={messageBody}
                  onChange={(event) => setMessageBody(event.target.value)}
                  placeholder="輸入圈內訊息"
                />
                <button className="primary-button" type="button" onClick={sendMessage} disabled={sending || !messageBody.trim()}>
                  {sending ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
                  送出
                </button>
              </div>
            </section>
          ) : null}
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

function TemplatePicker({ circles, session, go, refresh, setToast, selectedTemplate = "" }) {
  const manageableCircleIds = new Set(
    (session?.memberships ?? [])
      .filter((membership) => ["owner", "admin"].includes(membership.role))
      .map((membership) => membership.circleId),
  );
  const manageableCircles = circles.filter((circle) => manageableCircleIds.has(circle.id));
  const initialCircle = selectedTemplate ? getDefaultCircleForTemplate(manageableCircles, selectedTemplate) : null;
  const [template, setTemplate] = useState(selectedTemplate);
  const [circleId, setCircleId] = useState(initialCircle?.id ?? "");
  const [step, setStep] = useState(selectedTemplate ? "circle" : "template");
  const meta = template ? templateMeta[template] : null;
  const selectedCircle = manageableCircles.find((circle) => circle.id === circleId) ?? null;
  const hasManageableCircles = manageableCircles.length > 0;
  const activeStepIndex = Math.max(0, createTaskSteps.findIndex((item) => item.id === step));
  const templateIsSelected = Boolean(meta) && step !== "template";
  const circleIsSelected = Boolean(selectedCircle) && step === "confirm";

  function chooseTemplate(nextTemplate) {
    const nextDefaultCircle = getDefaultCircleForTemplate(manageableCircles, nextTemplate);
    setTemplate(nextTemplate);
    setCircleId((current) => {
      if (current && manageableCircles.some((circle) => circle.id === current)) return current;
      return nextDefaultCircle?.id ?? manageableCircles[0]?.id ?? "";
    });
    setStep("circle");
  }

  async function createTask() {
    if (!template || !meta) {
      setToast("請先選擇要建立的事項類型");
      return;
    }
    if (!selectedCircle) {
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
      <Topbar title="建立事項" subtitle={step === "template" ? "先選要處理的事" : meta?.label} onBack={() => go("dashboard")} />
      <section className="section wizard-overview">
        <p>一步一步來，不用一次填完。先選情境，圈內先幫你放入基本內容，細節之後再補。</p>
        <ol className="wizard-progress" aria-label="建立事項進度">
          {createTaskSteps.map((item, index) => (
            <li className={index < activeStepIndex ? "done" : index === activeStepIndex ? "active" : ""} key={item.id}>
              <span>{index + 1}</span>
              <strong>{item.label}</strong>
            </li>
          ))}
        </ol>
      </section>
      <section className="section wizard-section">
        <div className="wizard-step-head">
          <span className="step-pill">1/3</span>
          <div>
            <h2>{templateIsSelected ? `你已選好：${meta.label}` : "你想處理什麼事？"}</h2>
            <p>{templateIsSelected ? "想換的話，點下方卡片就能重選。" : "先選最接近的情境就好，細節之後再補。"}</p>
          </div>
        </div>
        {step === "template" ? (
          <div className="template-list">
            {Object.entries(templateMeta).map(([key, item]) => (
              <button
                className={`template-choice ${template === key ? "active" : ""}`}
                type="button"
                key={key}
                onClick={() => chooseTemplate(key)}
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
        ) : (
          <button className="selected-summary" type="button" onClick={() => setStep("template")}>
            {meta ? <meta.icon size={20} /> : null}
            <span>
              <strong>{meta?.label}</strong>
              <small>想換其他類型，點這裡重選</small>
            </span>
            <ChevronRight size={18} />
          </button>
        )}
      </section>

      {template ? (
        <section className="section wizard-section">
          <div className="wizard-step-head">
            <span className="step-pill">2/3</span>
            <div>
              <h2>{!hasManageableCircles ? "目前還不能建立事項" : circleIsSelected ? `你已選好圈子：${selectedCircle.name}` : "放在哪個圈子？"}</h2>
              <p>
                {!hasManageableCircles
                  ? "要先加入圈子，並由圈主設為圈主或管理，才能在圈內建立事項。"
                  : circleIsSelected ? "想換圈子的話，點下方卡片就能重選。" : "選一個要放進去的圈子。這裡只會列出你能管理的圈子。"}
              </p>
            </div>
          </div>
          {step === "confirm" && selectedCircle ? (
            <button className="selected-summary" type="button" onClick={() => setStep("circle")}>
              <Users size={20} />
              <span>
                <strong>{selectedCircle.name}</strong>
                <small>想換其他圈子，點這裡重選</small>
              </span>
              <ChevronRight size={18} />
            </button>
          ) : (
            <div className="circle-choice-list">
              {manageableCircles.length === 0 ? (
                <div className="membership-empty-card">
                  <ShieldCheck size={20} />
                  <span>
                    <strong>你現在還沒有管理權限</strong>
                    <small>如果只是要填單，打開主揪分享的填單連結就可以。若要建立事項，請圈主在成員頁把你設為管理。</small>
                  </span>
                </div>
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
          )}
        </section>
      ) : null}

      {template && selectedCircle && step === "confirm" ? (
        <section className="section wizard-section">
          <div className="wizard-step-head">
            <span className="step-pill">3/3</span>
            <div>
              <h2>先建立基本事項</h2>
              <p>圈內會先放入常用選項與說明，建立後再補截止時間、付款或其他細節。</p>
            </div>
          </div>
          <div className="create-summary">
            <div>
              <small>事項類型</small>
              <strong>{meta?.label}</strong>
            </div>
            <div>
              <small>圈子</small>
              <strong>{selectedCircle.name}</strong>
            </div>
          </div>
        </section>
      ) : null}

      {template ? (
        <div className="sticky-actions">
          {step === "confirm" ? (
            <button className="primary-button" type="button" onClick={createTask} disabled={!selectedCircle}>
              <Plus size={18} />
              建立{meta?.label}
            </button>
          ) : (
            <button className="primary-button" type="button" onClick={() => setStep("confirm")} disabled={!selectedCircle}>
              {selectedCircle ? <ChevronRight size={18} /> : <ShieldCheck size={18} />}
              {selectedCircle ? "下一步" : "需要可管理的圈子"}
            </button>
          )}
        </div>
      ) : null}
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
  const [showDetails, setShowDetails] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [draft, setDraft] = useState(() => buildTaskEditDraft(task));

  useEffect(() => {
    setDraft(buildTaskEditDraft(task));
    setShowDetails(false);
    setShowOptions(false);
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
    setShowDetails(false);
    setShowOptions(false);
  }

  function startEditing() {
    setEditing(true);
    setShowDetails(false);
    setShowOptions(false);
  }

  async function save() {
    if (saving) return;
    const options = optionPayload(draft.options, { includeId: true });
    if (!draft.title.trim() || options.length === 0) {
      if (options.length === 0) setShowOptions(true);
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
      setShowDetails(false);
      setShowOptions(false);
      setToast("事項已更新");
    } catch (error) {
      setToast(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="section task-edit-section">
      <SectionTitle title="事項設定" action={editing ? "取消" : "編輯"} onClick={editing ? cancel : startEditing} />
      {!editing ? (
        <div className="task-setting-guide">
          <p>目前設定可以先這樣用。想改標題、截止時間、說明或選項時，再點右上角「編輯」。</p>
          <div className="task-setting-summary">
            <span>
              <small>目前選項</small>
              <strong>{task.options.length}</strong>
              個
            </span>
            <span>
              <small>截止時間</small>
              <strong>{task.deadlineAt ? formatDateTime(task.deadlineAt) : "還沒設定"}</strong>
            </span>
          </div>
        </div>
      ) : (
        <div className="guided-editor">
          <div className="wizard-step-head editor-intro">
            <span className="step-pill">先看</span>
            <div>
              <h2>先確認這件事怎麼顯示</h2>
              <p>通常只要看標題和截止時間就好；其他細節需要時再打開。</p>
            </div>
          </div>
          <div className="editor-basic-grid">
            <label>
              這件事叫什麼？
              <input value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} />
            </label>
            <label>
              什麼時候截止？
              <input type="datetime-local" value={draft.deadlineAt} onChange={(event) => updateDraft("deadlineAt", event.target.value)} />
            </label>
          </div>

          <button className="editor-panel-toggle" type="button" onClick={() => setShowDetails((current) => !current)}>
            <span>
              <strong>還要補充說明嗎？</strong>
              <small>{draft.description || draft.paymentInstructions || draft.pickupInstructions ? "原本的說明都還在，想改再打開。" : "沒有要補付款或領取方式，也可以先略過。"}</small>
            </span>
            <ChevronRight className={showDetails ? "open" : ""} size={18} />
          </button>
          {showDetails ? (
            <div className="editor-panel-content">
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
            </div>
          ) : null}

          <button className="editor-panel-toggle" type="button" onClick={() => setShowOptions((current) => !current)}>
            <span>
              <strong>要調整選項或金額嗎？</strong>
              <small>目前有 {draft.options.length} 個選項；品項或價格要改時再打開。</small>
            </span>
            <ChevronRight className={showOptions ? "open" : ""} size={18} />
          </button>
          {showOptions ? (
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
          ) : null}

          <button className="primary-button" type="button" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
            好了，儲存設定
          </button>
        </div>
      )}
    </section>
  );
}

function InterestConversionPanel({ task, go, setToast, updateTask }) {
  const [targetTemplate, setTargetTemplate] = useState("");
  const [draft, setDraft] = useState(() => buildConversionDraft(task, "activity", getInterestSummary(task)));
  const [busy, setBusy] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const summary = getInterestSummary(task);
  const convertedCount = Array.isArray(task.metadata?.convertedTo) ? task.metadata.convertedTo.length : 0;
  const selectedTarget = interestConversionTargets.find((target) => target.id === targetTemplate);
  const targetIsSelected = Boolean(selectedTarget);

  useEffect(() => {
    setTargetTemplate("");
    setDraft(buildConversionDraft(task, "activity", summary));
    setShowDetails(false);
    setShowOptions(false);
  }, [task.id]);

  function chooseTarget(nextTemplate) {
    setTargetTemplate(nextTemplate);
    setDraft(buildConversionDraft(task, nextTemplate, summary));
    setShowDetails(false);
    setShowOptions(false);
  }

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
    if (!targetTemplate) {
      setToast("請先選擇要轉成哪一種後續事項");
      return;
    }
    const options = optionPayload(draft.options);
    if (!draft.title.trim() || options.length === 0) {
      if (options.length === 0) setShowOptions(true);
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
      <SectionTitle title="把意願變成下一步" />
      <div className="interest-summary">
        <span><strong>{summary.positive}</strong> 人有興趣</span>
        <span><strong>{summary.positiveQuantity}</strong> 份/名額</span>
        <span><strong>{summary.reserve}</strong> 人先保留</span>
        <span><strong>{summary.notThisTime}</strong> 人先不參加</span>
      </div>

      <div className="wizard-step-head">
        <span className="step-pill">1/2</span>
        <div>
          <h2>{targetIsSelected ? `你已選好：${selectedTarget.label}` : "接下來想怎麼安排？"}</h2>
          <p>{targetIsSelected ? "想換成其他方式的話，點下方卡片就能重選。" : "大家已經表態了，現在可以決定要辦活動、開投票，還是改成領取登記。"}</p>
        </div>
      </div>
      {!targetTemplate ? (
        <div className="conversion-list">
          {interestConversionTargets.map((target) => (
            <button
              className="conversion-choice"
              type="button"
              key={target.id}
              onClick={() => chooseTarget(target.id)}
            >
              <strong>{target.label}</strong>
              <small>{target.description}</small>
            </button>
          ))}
        </div>
      ) : (
        <button className="selected-summary" type="button" onClick={() => setTargetTemplate("")}>
          <ClipboardList size={20} />
          <span>
            <strong>{selectedTarget?.label}</strong>
            <small>想換其他安排，點這裡重選</small>
          </span>
          <ChevronRight size={18} />
        </button>
      )}

      {targetTemplate ? (
        <div className="guided-editor conversion-guided-editor">
          <div className="wizard-step-head">
            <span className="step-pill">2/2</span>
            <div>
              <h2>先確認這個後續事項</h2>
              <p>先看標題和截止時間就好；說明、費用和選項需要時再打開改。</p>
            </div>
          </div>
          <div className="editor-basic-grid">
            <label>
              這個後續事項叫什麼？
              <input value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} />
            </label>
            <label>
              什麼時候截止？
              <input type="datetime-local" value={draft.deadlineAt} onChange={(event) => updateDraft("deadlineAt", event.target.value)} />
            </label>
          </div>

          <button className="editor-panel-toggle" type="button" onClick={() => setShowDetails((current) => !current)}>
            <span>
              <strong>還要補說明或費用嗎？</strong>
              <small>圈內已先帶入建議文字，想改再打開。</small>
            </span>
            <ChevronRight className={showDetails ? "open" : ""} size={18} />
          </button>
          {showDetails ? (
            <div className="editor-panel-content">
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
            </div>
          ) : null}

          <button className="editor-panel-toggle" type="button" onClick={() => setShowOptions((current) => !current)}>
            <span>
              <strong>要調整選項或金額嗎？</strong>
              <small>目前有 {draft.options.length} 個預設選項；名稱、說明或金額想改再打開。</small>
            </span>
            <ChevronRight className={showOptions ? "open" : ""} size={18} />
          </button>
          {showOptions ? (
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
          ) : null}
        </div>
      ) : null}

      {targetTemplate ? (
        <button className="primary-button" type="button" onClick={convert} disabled={busy}>
          {busy ? <Loader2 className="spin" size={18} /> : <ChevronRight size={18} />}
          好了，建立{selectedTarget?.label}
        </button>
      ) : null}
      {convertedCount > 0 ? <p className="empty-note">這個意願調查已經轉出 {convertedCount} 筆後續事項。</p> : null}
    </section>
  );
}

function TaskManage({ task, session, go, shareTask, setToast, updateTask }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [announcementBody, setAnnouncementBody] = useState("");
  const [announcementPriority, setAnnouncementPriority] = useState("normal");
  const [announcementRequiresConfirmation, setAnnouncementRequiresConfirmation] = useState(false);
  const [conversationBusy, setConversationBusy] = useState(false);
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
        requiresConfirmation: announcementRequiresConfirmation,
      }),
    });
    updateTask(data.task);
    setAnnouncementBody("");
    setAnnouncementPriority("normal");
    setAnnouncementRequiresConfirmation(false);
    setToast("公告已發布");
  }

  function changeAnnouncementPriority(priority) {
    setAnnouncementPriority(priority);
    if (priority === "important" || priority === "urgent") {
      setAnnouncementRequiresConfirmation(true);
    }
  }

  async function openTaskConversation() {
    if (!task.circleId || conversationBusy) return;
    setConversationBusy(true);
    try {
      const existing = await api(`/api/circles/${task.circleId}/conversations?taskId=${task.id}`);
      let conversation = existing.conversations?.[0] ?? null;
      if (!conversation) {
        const created = await api(`/api/circles/${task.circleId}/conversations`, {
          method: "POST",
          body: JSON.stringify({
            type: "task",
            taskId: task.id,
            title: `${task.title} 討論`,
          }),
        });
        conversation = created.conversation;
      }
      go("circleChat", { circleId: task.circleId, conversationId: conversation.id });
    } catch (error) {
      setToast(error.message);
    } finally {
      setConversationBusy(false);
    }
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
        <div className="discussion-toolbar">
          <button className="secondary-button compact" type="button" onClick={openTaskConversation} disabled={!permissionReady || conversationBusy}>
            {conversationBusy ? <Loader2 className="spin" size={16} /> : <MessageCircle size={16} />}
            事項討論串
          </button>
          <small>公告會通知圈內成員，細節可在討論串延續。</small>
        </div>
        {canAnnounce ? (
          <div className="publish-box">
            <textarea
              value={announcementBody}
              onChange={(event) => setAnnouncementBody(event.target.value)}
              placeholder="例如：飲料到了請到前台自取，或今晚 KTV 地點改到西門。"
            />
            <div className="publish-actions">
              <select value={announcementPriority} onChange={(event) => changeAnnouncementPriority(event.target.value)} aria-label="公告重要性">
                <option value="normal">一般</option>
                <option value="important">重要</option>
                <option value="urgent">緊急</option>
              </select>
              <button type="button" onClick={publishAnnouncement}>
                <Megaphone size={18} />
                發布公告
              </button>
            </div>
            <label className="confirmation-toggle">
              <input
                type="checkbox"
                checked={announcementRequiresConfirmation}
                onChange={(event) => setAnnouncementRequiresConfirmation(event.target.checked)}
              />
              <span>
                <strong>要大家按「我知道了」嗎？</strong>
                <small>適合臨時改地點、取餐通知或重要提醒，主揪可以看到確認進度。</small>
              </span>
            </label>
          </div>
        ) : null}
        <TaskDiscussion task={task} session={session} setToast={setToast} updateTask={updateTask} />
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

function TaskDiscussion({ task, compact = false, session, setToast, updateTask }) {
  const announcements = task.announcements ?? [];
  const comments = task.comments ?? [];
  const [confirmingId, setConfirmingId] = useState("");

  async function confirmAnnouncement(announcement) {
    if (!session?.authenticated) {
      setToast?.("先登入後，就能幫這則公告按收到");
      return;
    }
    if (announcement.viewerReceipt?.confirmedAt || confirmingId) return;
    setConfirmingId(announcement.id);
    try {
      const data = await api(`/api/announcements/${announcement.id}/confirm`, { method: "POST" });
      updateTask?.(data.task);
      setToast?.("已幫你確認收到");
    } catch (error) {
      setToast?.(error.message);
    } finally {
      setConfirmingId("");
    }
  }

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
            {announcement.requiresConfirmation ? (
              <div className="announcement-confirmation">
                <span>
                  已確認 {announcement.receiptSummary?.confirmed ?? 0}/{announcement.receiptSummary?.total ?? 0}
                </span>
                {session?.authenticated ? (
                  <button
                    type="button"
                    onClick={() => confirmAnnouncement(announcement)}
                    disabled={Boolean(announcement.viewerReceipt?.confirmedAt) || confirmingId === announcement.id}
                  >
                    {confirmingId === announcement.id ? <Loader2 className="spin" size={15} /> : <Check size={15} />}
                    {announcement.viewerReceipt?.confirmedAt ? "你已確認" : "我知道了"}
                  </button>
                ) : (
                  <em>登入後可按收到</em>
                )}
              </div>
            ) : null}
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

function participantNameFromSession(session) {
  return session?.authenticated ? (session.profile?.displayName || "").trim() : "";
}

function JoinTask({ task, session, providers = [], go, refresh, setToast, updateTask }) {
  const suggestedParticipantName = participantNameFromSession(session);
  const [step, setStep] = useState("items");
  const [name, setName] = useState(() => suggestedParticipantName);
  const [note, setNote] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [showComment, setShowComment] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [quantities, setQuantities] = useState(() => defaultJoinQuantities());
  const selectedItems = task.options
    .map((option) => ({ ...option, quantity: Number(quantities[option.id] || 0) }))
    .filter((option) => option.quantity > 0);
  const selectedQuantity = selectedItems.reduce((sum, option) => sum + option.quantity, 0);
  const total = task.options.reduce((sum, option) => sum + Number(quantities[option.id] || 0) * option.unitPrice, 0);
  const redirectAfter = encodeURIComponent(`/join/${task.shareToken}`);
  const selectedItemSummary = selectedItems.map((item) => `${item.title} x ${item.quantity}`).join("、");
  const participantDisplayName = name.trim() || "未填姓名";
  const noteSummary = note.trim() || "沒有備註，想補也可以點這裡";

  useEffect(() => {
    setStep("items");
    setName(suggestedParticipantName);
    setNote("");
    setCommentBody("");
    setShowComment(false);
    setSubmitted(null);
    setQuantities(defaultJoinQuantities());
  }, [task.id, suggestedParticipantName]);

  function defaultJoinQuantities() {
    return Object.fromEntries(task.options.map((option, index) => [option.id, index === 0 ? 1 : 0]));
  }

  function resetForAnotherPerson() {
    setSubmitted(null);
    setStep("items");
    setName("");
    setNote("");
    setCommentBody("");
    setShowComment(false);
    setQuantities(defaultJoinQuantities());
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    if (submitting) return;
    if (!name.trim()) {
      setToast("請先填寫姓名");
      setStep("details");
      return;
    }
    if (selectedItems.length === 0) {
      setToast("請先選擇至少一個項目");
      setStep("items");
      return;
    }
    const submittedSnapshot = {
      participantName: name.trim(),
      note: note.trim(),
      items: selectedItems.map((item) => ({
        id: item.id,
        title: item.title,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      total,
    };
    setSubmitting(true);
    try {
      const data = await api(`/api/share/${task.shareToken}/responses`, {
        method: "POST",
        body: JSON.stringify({
          participantName: submittedSnapshot.participantName,
          note: submittedSnapshot.note,
          items: submittedSnapshot.items.map((item) => ({ optionId: item.id, quantity: item.quantity })),
        }),
      });
      updateTask(data.task);
      setSubmitted(submittedSnapshot);
      setToast("已送出，主揪會在圈內看到統計");
      window.scrollTo({ top: 0, behavior: "smooth" });
      refresh().catch(() => {});
    } catch (error) {
      setToast(error.message);
    } finally {
      setSubmitting(false);
    }
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

  function continueToDetails() {
    if (selectedItems.length === 0) {
      setToast("請先選擇至少一個項目");
      return;
    }
    setStep("details");
  }

  function continueToConfirm() {
    if (!name.trim()) {
      setToast("請先填寫姓名");
      return;
    }
    setStep("confirm");
  }

  if (submitted) {
    return (
      <>
        <Topbar title="已送出" subtitle="成員填單" onBack={() => go("manage", { taskId: task.id })} />
        <section className="join-success">
          <span className="join-success-icon"><Check size={26} /></span>
          <h1>已送出，主揪會看到統計</h1>
          <p>想補充或改內容，可以留言給主揪，或直接請主揪幫你調整。</p>
        </section>
        <section className="section wizard-section">
          <div className="wizard-step-head">
            <span className="step-pill">完成</span>
            <div>
              <h2>送出內容</h2>
              <p>{submitted.participantName}{submitted.note ? ` · ${submitted.note}` : ""}</p>
            </div>
          </div>
          <div className="join-summary-list">
            {submitted.items.map((item) => (
              <div className="join-summary-row" key={item.id}>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.unitPrice > 0 ? money(item.unitPrice) : "不計費"}</small>
                </span>
                <b>x {item.quantity}</b>
              </div>
            ))}
          </div>
          <div className="total-box compact">
            <span>預估總額</span>
            <strong>{money(submitted.total)}</strong>
            <small>{task.paymentInstructions || "付款方式由團主通知。"}</small>
          </div>
        </section>
        <div className="sticky-actions two">
          <button className="secondary-button" type="button" onClick={resetForAnotherPerson}>再填另一人</button>
          <button className="primary-button green" type="button" onClick={() => go("manage", { taskId: task.id })}>
            查看事項
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="成員填單" subtitle="不用安裝 App" onBack={() => go("manage", { taskId: task.id })} />
      <section className="join-hero">
        <span className="status open">進行中</span>
        <h1>{task.title}</h1>
        <p>由 {task.circleName} 發起。這個連結可以貼在聊天群，大家填完就會自動統計。</p>
      </section>
      {!session?.authenticated ? (
        <section className="section auth-section">
          <div className="auth-heading">
            <Smartphone size={22} />
            <span>
              <strong>登入後自動帶入姓名</strong>
              <small>也可以直接填；若先用手機帳號登入，回來這張填單時會帶入會員名稱。</small>
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
          <p className="auth-note">不登入也可以繼續填單。</p>
        </section>
      ) : null}
      <section className="section discussion-section">
        <SectionTitle title="公告與討論" />
        <TaskDiscussion task={task} compact session={session} setToast={setToast} updateTask={updateTask} />
        <button className="editor-panel-toggle" type="button" onClick={() => setShowComment((current) => !current)}>
          <span>
            <strong>留言給主揪</strong>
            <small>有臨時問題或補充再打開留言</small>
          </span>
          <ChevronRight className={showComment ? "open" : ""} size={18} />
        </button>
        {showComment ? (
          <div className="editor-panel-content">
            <label>
              留言
              <textarea value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder="例如：我會晚點到、可否幫我先留一份？" />
            </label>
            <button className="secondary-button" type="button" onClick={sendComment}>
              <MessageSquare size={18} />
              送出留言
            </button>
          </div>
        ) : null}
      </section>

      <section className="section wizard-section">
        <div className="wizard-step-head">
          <span className="step-pill">1/3</span>
          <div>
            <h2>{step === "items" ? "先選你要哪幾份" : `你已選好：${selectedQuantity} 份 / ${money(total)}`}</h2>
            <p>{step === "items" ? "選好品項和數量，下一步再填姓名。" : "想改品項或數量，點下方卡片就能重選。"}</p>
          </div>
        </div>
        {step === "items" ? (
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
        ) : (
          <button className="selected-summary" type="button" onClick={() => setStep("items")}>
            <ReceiptText size={20} />
            <span>
              <strong>{selectedQuantity} 份 / {money(total)}</strong>
              <small>{selectedItemSummary ? `${selectedItemSummary}。想改就點這裡` : "想改品項或數量，點這裡重選"}</small>
            </span>
            <ChevronRight size={18} />
          </button>
        )}
      </section>

      {step !== "items" ? (
        <section className="section wizard-section form-section">
          <div className="wizard-step-head">
            <span className="step-pill">2/3</span>
            <div>
              <h2>{step === "details" ? "要怎麼稱呼你？" : `你已填好：${participantDisplayName}`}</h2>
              <p>
                {step === "details"
                  ? (suggestedParticipantName ? "已先帶入你的會員名稱，幫別人填也可以直接改。" : "讓主揪知道這份是誰填的就好，備註有需要再寫。")
                  : "想改姓名或備註，點下方卡片就能重填。"}
              </p>
            </div>
          </div>
          {step === "details" ? (
            <>
              <label>姓名<input value={name} onChange={(event) => setName(event.target.value)} placeholder="請填姓名或暱稱" /></label>
              <label>備註<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：不要辣、微糖少冰、可到時間..." /></label>
            </>
          ) : (
            <button className="selected-summary" type="button" onClick={() => setStep("details")}>
              <UserCircle size={20} />
              <span>
                <strong>{participantDisplayName}</strong>
                <small>{noteSummary}</small>
              </span>
              <ChevronRight size={18} />
            </button>
          )}
        </section>
      ) : null}

      {step === "confirm" ? (
        <section className="section wizard-section">
          <div className="wizard-step-head">
            <span className="step-pill">3/3</span>
            <div>
              <h2>最後看一下，就可以送出</h2>
              <p>送出後，主揪會看到你的名單與統計。</p>
            </div>
          </div>
          <div className="join-summary-list">
            {selectedItems.map((item) => (
              <div className="join-summary-row" key={item.id}>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.unitPrice > 0 ? money(item.unitPrice) : "不計費"}</small>
                </span>
                <b>x {item.quantity}</b>
              </div>
            ))}
          </div>
          <div className="total-box compact">
            <span>預估總額</span>
            <strong>{money(total)}</strong>
            <small>{task.paymentInstructions || "付款方式由團主通知。"}</small>
          </div>
        </section>
      ) : null}

      <div className="sticky-actions">
        {step === "items" ? (
          <button className="primary-button green" type="button" onClick={continueToDetails} disabled={selectedItems.length === 0}>
            <ChevronRight size={18} />
            下一步，填姓名
          </button>
        ) : null}
        {step === "details" ? (
          <button className="primary-button green" type="button" onClick={continueToConfirm}>
            <ChevronRight size={18} />
            看一下再送出
          </button>
        ) : null}
        {step === "confirm" ? (
          <button className="primary-button green" type="button" onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
            好了，送出
          </button>
        ) : null}
      </div>
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
