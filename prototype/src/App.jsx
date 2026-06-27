import {
  ArrowLeft,
  Bell,
  CalendarClock,
  Check,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Copy,
  Download,
  Filter,
  Link,
  MoreVertical,
  Package,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Share2,
  Truck,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

const initialOrders = [
  {
    id: "00012",
    name: "王小明",
    item: "衣索比亞 日曬 G1",
    variant: "中焙",
    quantity: 2,
    amount: 960,
    payment: "paid",
    paymentMethod: "行動支付",
    paidAt: "06/28 12:40",
    pickup: "picked",
    pickupAt: "06/30 18:20",
    note: "週末取貨",
  },
  {
    id: "00011",
    name: "林怡君",
    item: "哥倫比亞 水洗",
    variant: "淺焙",
    quantity: 1,
    amount: 480,
    payment: "review",
    paymentMethod: "轉帳匯款",
    paidAt: "06/28 11:15",
    pickup: "pending",
    pickupAt: "-",
    note: "可晚一點拿",
  },
  {
    id: "00010",
    name: "張志豪",
    item: "衣索比亞 日曬 G1",
    variant: "中焙",
    quantity: 1,
    amount: 480,
    payment: "unpaid",
    paymentMethod: "-",
    paidAt: "-",
    pickup: "none",
    pickupAt: "-",
    note: "",
  },
  {
    id: "00009",
    name: "陳雅婷",
    item: "曼特寧 深焙",
    variant: "深焙",
    quantity: 2,
    amount: 960,
    payment: "paid",
    paymentMethod: "轉帳匯款",
    paidAt: "06/27 21:05",
    pickup: "pending",
    pickupAt: "-",
    note: "磨粉",
  },
  {
    id: "00008",
    name: "黃大維",
    item: "哥倫比亞 水洗",
    variant: "淺焙",
    quantity: 1,
    amount: 480,
    payment: "paid",
    paymentMethod: "行動支付",
    paidAt: "06/27 19:33",
    pickup: "picked",
    pickupAt: "06/29 17:10",
    note: "",
  },
  {
    id: "00007",
    name: "吳佳穎",
    item: "綜合組合包",
    variant: "半磅包",
    quantity: 1,
    amount: 600,
    payment: "review",
    paymentMethod: "轉帳匯款",
    paidAt: "06/27 18:20",
    pickup: "pending",
    pickupAt: "-",
    note: "末五碼 90122",
  },
];

const circles = [
  {
    id: "coffee",
    name: "咖啡豆團購圈",
    description: "每月一起買單品豆",
    active: 3,
    pending: 4,
    members: 28,
    accent: "green",
  },
  {
    id: "family",
    name: "親子用品圈",
    description: "尿布、防曬、童書",
    active: 1,
    pending: 2,
    members: 16,
    accent: "blue",
  },
  {
    id: "camping",
    name: "露營補給圈",
    description: "裝備、食材、營位",
    active: 1,
    pending: 2,
    members: 12,
    accent: "orange",
  },
];

const statusCopy = {
  unpaid: "未付款",
  review: "待確認",
  paid: "已付款",
  picked: "已取貨",
  pending: "待取貨",
  none: "-",
};

function formatMoney(value) {
  return `NT$${Number(value).toLocaleString("zh-TW")}`;
}

function IconButton({ label, children, onClick }) {
  return (
    <button className="icon-button" type="button" aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

function TopBar({ title, eyebrow, onBack, action }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        {onBack ? (
          <IconButton label="返回" onClick={onBack}>
            <ArrowLeft size={22} strokeWidth={2.2} />
          </IconButton>
        ) : null}
      </div>
      <div className="topbar-title">
        <strong>{title}</strong>
        {eyebrow ? <span>{eyebrow}</span> : null}
      </div>
      <div className="topbar-right">{action}</div>
    </header>
  );
}

function Toast({ message, onDismiss }) {
  if (!message) return null;

  return (
    <div className="toast" role="status">
      <Check size={16} />
      <span>{message}</span>
      <button type="button" aria-label="關閉通知" onClick={onDismiss}>
        <X size={14} />
      </button>
    </div>
  );
}

function AppShell({ children, toast, clearToast }) {
  return (
    <main className="app-shell">
      <div className="mobile-surface">{children}</div>
      <Toast message={toast} onDismiss={clearToast} />
    </main>
  );
}

function Dashboard({ go, toastAction }) {
  return (
    <>
      <TopBar
        title="圈內 InCircle"
        action={
          <IconButton label="通知">
            <Bell size={22} />
          </IconButton>
        }
      />

      <section className="hero-section">
        <div>
          <h1>早安，圈主！</h1>
          <p>把群裡的 +1，變成清楚的名單與統計。</p>
        </div>
        <button className="select-button" type="button">
          全部圈子
          <ChevronRight size={16} />
        </button>
      </section>

      <section className="summary-strip" aria-label="今日總覽">
        <Metric icon={<Users size={21} />} label="我的圈子" value="3" />
        <Metric icon={<ClipboardList size={21} />} label="進行中團購" value="5" />
        <Metric icon={<CircleDollarSign size={21} />} label="待確認付款" value="8" alert />
        <Metric icon={<Package size={21} />} label="待取貨訂單" value="27" />
      </section>

      <section className="section-block">
        <SectionHeader title="進行中的團購" action="查看全部" />
        <div className="group-list">
          {[
            ["精品咖啡豆 6 月烘焙批次", "咖啡豆團購圈", "團購中", "結單 07/05（六）23:59", "18 人", "green"],
            ["親子防曬乳團購", "親子用品圈", "團購中", "結單 07/07（一）23:59", "24 人", "blue"],
            ["濾掛咖啡綜合組", "咖啡豆團購圈", "團購中", "結單 07/10（四）23:59", "12 人", "green"],
            ["兒童水壺補貨團", "親子用品圈", "準備中", "預計 07/12 開團", "0 人", "gray"],
          ].map(([title, circle, status, deadline, count, accent]) => (
            <button className="group-row" type="button" key={title} onClick={() => go("manage")}>
              <span className={`row-accent ${accent}`} />
              <span className="group-main">
                <strong>{title}</strong>
                <small>
                  <span className="tag">{circle}</span>
                  {status} · {deadline}
                </small>
              </span>
              <span className="group-count">{count}</span>
              <ChevronRight size={19} />
            </button>
          ))}
        </div>
      </section>

      <section className="section-block">
        <SectionHeader title="待確認付款" action="查看全部" />
        <div className="payment-list">
          {[
            ["林小美", "精品咖啡豆 6 月烘焙批次", 1280],
            ["王大明", "親子防曬乳團購", 760],
            ["張小華", "濾掛咖啡綜合組", 450],
          ].map(([name, item, amount]) => (
            <button className="payment-row" type="button" key={name} onClick={() => go("manage")}>
              <span className="avatar">{name.slice(0, 1)}</span>
              <span className="payment-copy">
                <strong>{name}</strong>
                <small>{item}</small>
              </span>
              <span className="amount-alert">{formatMoney(amount)}</span>
              <span className="small-button">查看</span>
            </button>
          ))}
        </div>
      </section>

      <div className="sticky-actions">
        <button className="primary-button" type="button" onClick={() => go("create")}>
          <Plus size={20} />
          建立團購
        </button>
        <button className="secondary-button" type="button" onClick={toastAction}>
          <Link size={19} />
          複製分享連結
        </button>
      </div>

      <BottomNav active="overview" go={go} />
    </>
  );
}

function Metric({ icon, label, value, alert = false }) {
  return (
    <div className="metric">
      {icon ? <span className="metric-icon">{icon}</span> : null}
      <strong className={alert ? "danger-text" : ""}>{value}</strong>
      <small>{label}</small>
    </div>
  );
}

function SectionHeader({ title, action }) {
  return (
    <div className="section-header">
      <h2>{title}</h2>
      {action ? (
        <button type="button">
          {action}
          <ChevronRight size={16} />
        </button>
      ) : null}
    </div>
  );
}

function BottomNav({ active, go }) {
  const items = [
    ["overview", "總覽", ClipboardList, "dashboard"],
    ["orders", "訂單管理", Package, "manage"],
    ["circles", "圈子管理", Users, "circle"],
    ["settings", "設定", Settings, "dashboard"],
  ];

  return (
    <nav className="bottom-nav" aria-label="主要導覽">
      {items.map(([key, label, Icon, route]) => (
        <button
          type="button"
          key={key}
          className={active === key ? "active" : ""}
          onClick={() => go(route)}
        >
          <Icon size={22} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function CircleHome({ go }) {
  return (
    <>
      <TopBar
        title="咖啡豆團購圈"
        eyebrow="28 位成員 · 3 個進行中"
        onBack={() => go("dashboard")}
        action={
          <IconButton label="更多">
            <MoreVertical size={22} />
          </IconButton>
        }
      />

      <section className="circle-intro">
        <p>每月一起買單品咖啡豆，接單後新鮮烘焙。聊天可以留在原本的群組，圈內只補上填單、統計、付款與取貨狀態。</p>
        <div className="split-actions">
          <button className="primary-button" type="button" onClick={() => go("create")}>
            <Plus size={18} />
            建立團購
          </button>
          <button className="secondary-button compact" type="button" onClick={() => go("participant")}>
            <Share2 size={18} />
            預覽填單
          </button>
        </div>
      </section>

      <section className="section-block">
        <SectionHeader title="進行中" />
        <button className="active-buy" type="button" onClick={() => go("manage")}>
          <div>
            <span className="status-dot green-dot">進行中</span>
            <h2>7月咖啡豆團購</h2>
            <p>12 筆訂單 · {formatMoney(5760)} · 3 筆未付款</p>
          </div>
          <ChevronRight size={21} />
        </button>
        <button className="active-buy secondary-buy" type="button" onClick={() => go("manage")}>
          <div>
            <span className="status-dot orange-dot">準備中</span>
            <h2>濾掛咖啡補貨</h2>
            <p>草稿 · 尚未開放填單</p>
          </div>
          <ChevronRight size={21} />
        </button>
      </section>

      <section className="section-block">
        <SectionHeader title="歷史紀錄" />
        {["6月烘焙批次", "母親節禮盒", "春季試喝組"].map((title, index) => (
          <button className="history-row" type="button" key={title} onClick={() => go("create")}>
            <span>
              <strong>{title}</strong>
              <small>{18 - index * 3} 筆訂單 · {formatMoney(8640 - index * 1220)}</small>
            </span>
            <span className="small-button">複製</span>
          </button>
        ))}
      </section>
    </>
  );
}

function CreateGroupBuy({ go, setToast }) {
  const [items, setItems] = useState([
    { name: "耶加雪菲 G1", variant: "中焙", price: 480 },
    { name: "哥倫比亞 水洗", variant: "淺焙", price: 480 },
  ]);
  const [title, setTitle] = useState("7月咖啡豆團購");

  function publish() {
    setToast("團購已發布，分享連結已可複製");
    go("manage");
  }

  return (
    <>
      <TopBar title="建立團購" eyebrow="咖啡豆團購圈" onBack={() => go("circle")} />

      <form className="form-flow" onSubmit={(event) => event.preventDefault()}>
        <section className="form-section">
          <h2>團購基本資料</h2>
          <label>
            團購名稱
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            說明
            <textarea defaultValue="精選單品咖啡豆，接單後新鮮烘焙。請在結單前完成下單。" />
          </label>
          <label>
            結單時間
            <input type="datetime-local" defaultValue="2026-07-05T23:59" />
          </label>
        </section>

        <section className="form-section">
          <div className="inline-title">
            <h2>商品</h2>
            <button
              type="button"
              onClick={() => setItems([...items, { name: "", variant: "", price: 0 }])}
            >
              <Plus size={16} />
              新增
            </button>
          </div>
          {items.map((item, index) => (
            <div className="item-editor" key={`${item.name}-${index}`}>
              <input
                aria-label="商品名稱"
                value={item.name}
                placeholder="商品名稱"
                onChange={(event) => {
                  const next = [...items];
                  next[index] = { ...item, name: event.target.value };
                  setItems(next);
                }}
              />
              <div className="two-col">
                <input
                  aria-label="規格"
                  value={item.variant}
                  placeholder="規格"
                  onChange={(event) => {
                    const next = [...items];
                    next[index] = { ...item, variant: event.target.value };
                    setItems(next);
                  }}
                />
                <input
                  aria-label="單價"
                  type="number"
                  value={item.price}
                  onChange={(event) => {
                    const next = [...items];
                    next[index] = { ...item, price: Number(event.target.value) };
                    setItems(next);
                  }}
                />
              </div>
            </div>
          ))}
        </section>

        <section className="form-section">
          <h2>付款與取貨</h2>
          <label>
            付款方式
            <textarea defaultValue="轉帳或行動支付。團主確認後會標記付款狀態。" />
          </label>
          <label>
            取貨方式
            <textarea defaultValue="面交取貨，地點由團主另行通知。" />
          </label>
        </section>
      </form>

      <div className="sticky-actions">
        <button className="secondary-button" type="button" onClick={() => setToast("草稿已儲存")}>
          儲存草稿
        </button>
        <button className="primary-button" type="button" onClick={publish}>
          <Send size={18} />
          發布並複製連結
        </button>
      </div>
    </>
  );
}

function ParticipantOrder({ go, addOrder }) {
  const [quantity, setQuantity] = useState(1);
  const [name, setName] = useState("王小明");
  const [note, setNote] = useState("");
  const total = quantity * 480;

  function submit() {
    addOrder({
      id: String(Math.floor(Math.random() * 90000) + 10000),
      name: name || "未命名",
      item: "耶加雪菲 G1",
      variant: "中焙",
      quantity,
      amount: total,
      payment: "unpaid",
      paymentMethod: "-",
      paidAt: "-",
      pickup: "none",
      pickupAt: "-",
      note,
    });
    go("confirmation");
  }

  return (
    <>
      <TopBar title="圈內 InCircle" eyebrow="團購訂單" onBack={() => go("manage")} />

      <section className="participant-hero">
        <div>
          <span className="outline-badge">進行中</span>
          <h1>7月咖啡豆團購</h1>
          <p>由 咖啡豆團購圈 發起</p>
        </div>
        <div className="deadline-block">
          <small>結單時間</small>
          <strong>07/05（六）23:59</strong>
          <span>剩餘 2 天 8 小時</span>
        </div>
      </section>

      <section className="participant-copy">
        <p>精選單品咖啡豆，接單後新鮮烘焙。請在結單前完成下單，逾期將不再收單。</p>
      </section>

      <section className="order-form">
        <h2>選擇商品</h2>
        <div className="product-row">
          <div>
            <strong>耶加雪菲 G1 <span>中焙</span></strong>
            <p>衣索比亞 · 水洗處理</p>
            <small>風味：花香、柑橘、蜂蜜</small>
          </div>
          <b>NT$480 / 200g</b>
        </div>

        <div className="quantity-row">
          <span>數量</span>
          <div className="stepper">
            <button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))}>
              -
            </button>
            <strong>{quantity}</strong>
            <button type="button" onClick={() => setQuantity(Math.min(10, quantity + 1))}>
              +
            </button>
          </div>
        </div>

        <div className="participant-fields">
          <h2>訂購人資訊</h2>
          <label>
            姓名
            <input value={name} onChange={(event) => setName(event.target.value)} />
            <small>供團主核對與出貨使用</small>
          </label>
          <label>
            備註（選填）
            <textarea
              value={note}
              maxLength={100}
              placeholder="例：需要磨粉 / 指定取貨時間 / 其他需求..."
              onChange={(event) => setNote(event.target.value)}
            />
            <small>{note.length}/100</small>
          </label>
        </div>

        <div className="order-total">
          <span>預估總額</span>
          <strong>{formatMoney(total)} + 運費</strong>
        </div>
        <div className="info-callout">
          實際金額將依團主確認的運費為準，並於結單後通知付款方式。
        </div>
      </section>

      <section className="pickup-note">
        <Truck size={24} />
        <div>
          <strong>取貨 / 付款方式</strong>
          <p>取貨方式：面交取貨（地點由團主另行通知）</p>
          <p>付款方式：團主將於結單後統一通知</p>
        </div>
      </section>

      <div className="sticky-actions">
        <button className="primary-button green" type="button" onClick={submit}>
          送出訂單
        </button>
        <p className="secure-note">訂單僅供此團主查看，無需登入帳號</p>
      </div>
    </>
  );
}

function Confirmation({ go, order }) {
  const receiptOrder = order ?? {
    item: "耶加雪菲 G1",
    variant: "中焙",
    quantity: 1,
    amount: 480,
  };

  return (
    <>
      <TopBar title="訂單已送出" onBack={() => go("participant")} />
      <section className="confirmation">
        <div className="success-mark">
          <Check size={38} />
        </div>
        <h1>已送出訂單</h1>
        <p>團主會在結單後確認付款與取貨方式。你可以將摘要複製回聊天群，方便自己留存。</p>
        <div className="receipt">
          <span>7月咖啡豆團購</span>
          <strong>
            {receiptOrder.item} {receiptOrder.variant} x {receiptOrder.quantity}
          </strong>
          <b>預估總額 {formatMoney(receiptOrder.amount)} + 運費</b>
        </div>
        <button className="primary-button" type="button" onClick={() => go("manage")}>
          回到團主管理頁
        </button>
        <button className="secondary-button" type="button" onClick={() => go("participant")}>
          再填一筆
        </button>
      </section>
    </>
  );
}

function Management({ go, orders, setOrders, setToast }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [closed, setClosed] = useState(false);

  const visibleOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "unpaid" && order.payment === "unpaid") ||
        (filter === "paid" && order.payment === "paid") ||
        (filter === "pickup" && order.pickup === "pending");
      const matchesQuery = `${order.name} ${order.item} ${order.note}`.includes(query);
      return matchesFilter && matchesQuery;
    });
  }, [orders, filter, query]);

  const totals = useMemo(() => {
    return orders.reduce(
      (acc, order) => {
        acc.amount += order.amount;
        acc.quantity += order.quantity;
        if (order.payment === "unpaid") acc.unpaid += 1;
        if (order.payment === "paid") acc.paid += 1;
        if (order.pickup === "pending") acc.pickup += 1;
        return acc;
      },
      { amount: 0, quantity: 0, unpaid: 0, paid: 0, pickup: 0 },
    );
  }, [orders]);

  function updateOrder(id, patch) {
    setOrders(orders.map((order) => (order.id === id ? { ...order, ...patch } : order)));
  }

  function exportCsv() {
    const rows = [
      ["訂單編號", "姓名", "商品", "規格", "數量", "金額", "付款狀態", "取貨狀態", "備註"],
      ...orders.map((order) => [
        order.id,
        order.name,
        order.item,
        order.variant,
        order.quantity,
        order.amount,
        statusCopy[order.payment],
        statusCopy[order.pickup],
        order.note,
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "circles-group-buy.csv";
    link.click();
    URL.revokeObjectURL(url);
    setToast("CSV 已匯出");
  }

  return (
    <>
      <TopBar
        title="7月咖啡豆團購"
        onBack={() => go("circle")}
        action={
          <IconButton label="更多">
            <MoreVertical size={22} />
          </IconButton>
        }
      />

      <section className="status-line">
        <span className={closed ? "status-dot gray-dot" : "status-dot orange-dot"}>
          {closed ? "已關閉" : "進行中"}
        </span>
        <span>結單日 07/05（六）23:59</span>
      </section>

      <section className="management-actions">
        <button type="button" onClick={() => setToast("已複製分享連結")}>
          <Link size={20} />
          複製分享連結
        </button>
        <button type="button" onClick={exportCsv}>
          <Download size={20} />
          匯出 CSV
        </button>
      </section>

      <section className="management-summary" aria-label="團購統計">
        <Metric label="總訂單" value={orders.length} />
        <Metric label="總金額" value={formatMoney(totals.amount)} />
        <Metric label="未付款" value={totals.unpaid} alert />
        <Metric label="已付款" value={totals.paid} />
      </section>

      <section className="filter-area">
        <div className="tabs" role="tablist" aria-label="訂單篩選">
          {[
            ["all", `全部 (${orders.length})`],
            ["unpaid", `未付款 (${totals.unpaid})`],
            ["paid", `已付款 (${totals.paid})`],
            ["pickup", `待取貨 (${totals.pickup})`],
          ].map(([key, label]) => (
            <button
              type="button"
              role="tab"
              aria-selected={filter === key}
              className={filter === key ? "active" : ""}
              key={key}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="search-filter">
          <label>
            <Search size={18} />
            <input
              placeholder="搜尋訂單（姓名 / 商品 / 備註）"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button type="button">
            <Filter size={18} />
            篩選
          </button>
        </div>
      </section>

      <section className="order-list" aria-label="訂單列表">
        {visibleOrders.map((order) => (
          <article className="order-row" key={order.id}>
            <div className="order-main">
              <small>#{order.id}</small>
              <strong>{order.name}</strong>
              <span>
                {order.item} {order.variant} x {order.quantity}
              </span>
              <b>{formatMoney(order.amount)}</b>
            </div>
            <div className="status-column">
              <span>付款狀態</span>
              <button
                type="button"
                className={`pill ${order.payment}`}
                onClick={() =>
                  updateOrder(order.id, {
                    payment: order.payment === "unpaid" ? "review" : order.payment === "review" ? "paid" : "unpaid",
                    paymentMethod: order.payment === "paid" ? "-" : "轉帳匯款",
                    paidAt: order.payment === "paid" ? "-" : "剛剛",
                  })
                }
              >
                {statusCopy[order.payment]}
              </button>
              <small>{order.paymentMethod}</small>
              <small>{order.paidAt}</small>
            </div>
            <div className="status-column">
              <span>取貨狀態</span>
              <button
                type="button"
                className={`pill pickup-${order.pickup}`}
                onClick={() =>
                  updateOrder(order.id, {
                    pickup: order.pickup === "picked" ? "pending" : "picked",
                    pickupAt: order.pickup === "picked" ? "-" : "剛剛",
                  })
                }
              >
                {statusCopy[order.pickup]}
              </button>
              <small>{order.pickupAt}</small>
            </div>
            <ChevronRight className="row-chevron" size={20} />
          </article>
        ))}
      </section>

      <div className="unpaid-bar">
        <div>
          <small>未付款金額</small>
          <strong>{formatMoney(orders.filter((order) => order.payment === "unpaid").reduce((sum, order) => sum + order.amount, 0))}</strong>
          <span>（{totals.unpaid} 筆）</span>
        </div>
        <button type="button" onClick={() => setToast("已產生提醒文字，可貼回聊天群")}>
          <Bell size={18} />
          提醒未付款成員
        </button>
      </div>

      <div className="sticky-actions management-sticky">
        <button className="secondary-button" type="button" onClick={() => go("participant")}>
          預覽成員填單頁
        </button>
        <button
          className={closed ? "primary-button green" : "primary-button orange"}
          type="button"
          onClick={() => {
            setClosed(!closed);
            setToast(closed ? "團購已重新開放" : "團購已關閉，成員不可再填單");
          }}
        >
          {closed ? <RefreshCw size={18} /> : <CalendarClock size={18} />}
          {closed ? "重新開放" : "關閉團購"}
        </button>
      </div>
    </>
  );
}

export function App() {
  const [screen, setScreen] = useState("dashboard");
  const [orders, setOrders] = useState(initialOrders);
  const [latestOrder, setLatestOrder] = useState(null);
  const [toast, setToast] = useState("");

  function go(nextScreen) {
    setScreen(nextScreen);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function copyLineLink() {
    navigator.clipboard?.writeText("https://circles.local/join/coffee-july");
    setToast("已複製分享連結");
  }

  const screenMap = {
    dashboard: <Dashboard go={go} toastAction={copyLineLink} />,
    circle: <CircleHome go={go} />,
    create: <CreateGroupBuy go={go} setToast={setToast} />,
    participant: (
      <ParticipantOrder
        go={go}
        addOrder={(order) => {
          setLatestOrder(order);
          setOrders([order, ...orders]);
        }}
      />
    ),
    confirmation: <Confirmation go={go} order={latestOrder} />,
    manage: <Management go={go} orders={orders} setOrders={setOrders} setToast={setToast} />,
  };

  return (
    <AppShell toast={toast} clearToast={() => setToast("")}>
      {screenMap[screen]}
    </AppShell>
  );
}
