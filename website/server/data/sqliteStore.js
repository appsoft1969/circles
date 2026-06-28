import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildInterestConversion, normalizeTaskOptions, StoreError, templateLabels } from "./storeShared.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = dirname(__dirname);
const rootDir = dirname(serverDir);
const defaultDataDir = join(rootDir, "data");
const defaultDbPath = join(defaultDataDir, "circles.sqlite");

const now = () => new Date().toISOString();
const id = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const shareToken = () => Math.random().toString(36).slice(2, 11);

function json(value) {
  return JSON.stringify(value ?? {});
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function createSqliteStore({ dbPath = defaultDbPath } = {}) {
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");

  function initSchema() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        email TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS circles (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL REFERENCES users(id),
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        invite_code TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS circle_members (
        id TEXT PRIMARY KEY,
        circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
        display_name TEXT NOT NULL,
        contact_hint TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
        template TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        deadline_at TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        share_token TEXT NOT NULL UNIQUE,
        payment_instructions TEXT NOT NULL DEFAULT '',
        pickup_instructions TEXT NOT NULL DEFAULT '',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS task_options (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        subtitle TEXT NOT NULL DEFAULT '',
        unit_price INTEGER NOT NULL DEFAULT 0,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS responses (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        participant_name TEXT NOT NULL,
        participant_contact TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        total_amount INTEGER NOT NULL DEFAULT 0,
        payment_status TEXT NOT NULL DEFAULT 'unpaid',
        fulfillment_status TEXT NOT NULL DEFAULT 'pending',
        rsvp_status TEXT NOT NULL DEFAULT 'yes',
        guest_count INTEGER NOT NULL DEFAULT 0,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS response_items (
        id TEXT PRIMARY KEY,
        response_id TEXT NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
        option_id TEXT NOT NULL REFERENCES task_options(id),
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price INTEGER NOT NULL DEFAULT 0,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS announcements (
        id TEXT PRIMARY KEY,
        circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        author_name TEXT NOT NULL DEFAULT '主揪',
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT 'normal',
        requires_confirmation INTEGER NOT NULL DEFAULT 0,
        pinned_at TEXT,
        published_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );

      CREATE TABLE IF NOT EXISTS task_comments (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        author_name TEXT NOT NULL DEFAULT '',
        participant_name TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
    `);
    ensureColumn("task_options", "is_active", "INTEGER NOT NULL DEFAULT 1");
  }

  function ensureColumn(table, column, definition) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
    if (!columns.includes(column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
    }
  }

  function countRows(table) {
    return db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
  }

  function insert(table, data) {
    const keys = Object.keys(data);
    const placeholders = keys.map((key) => `$${key}`).join(", ");
    const columns = keys.join(", ");
    db.prepare(`INSERT INTO ${table} (${columns}) VALUES (${placeholders})`).run(data);
  }

  function circleMemberCount(circleId) {
    return 1 + db.prepare("SELECT COUNT(*) AS count FROM circle_members WHERE circle_id = ?").get(circleId).count;
  }

  function seed() {
    if (countRows("users") > 0) return;

    const userId = "user_kevin";
    const coffeeCircle = "circle_coffee";
    const officeCircle = "circle_office";
    const friendsCircle = "circle_friends";
    const createdAt = now();

    insert("users", {
      id: userId,
      display_name: "Kevin",
      email: "kevin@example.com",
      created_at: createdAt,
    });

    [
      [coffeeCircle, "咖啡豆團購圈", "每月一起買單品咖啡豆"],
      [officeCircle, "辦公室午餐圈", "公司中午訂餐、飲料、下午茶"],
      [friendsCircle, "下班放鬆圈", "KTV、聚餐、活動揪團"],
    ].forEach(([circleId, name, description]) => {
      insert("circles", {
        id: circleId,
        owner_user_id: userId,
        name,
        description,
        invite_code: shareToken(),
        created_at: createdAt,
      });
    });

    const members = ["王小明", "林怡君", "張志豪", "陳雅婷", "黃大維", "吳佳穎", "林小美", "王大明"];
    [coffeeCircle, officeCircle, friendsCircle].forEach((circleId) => {
      members.forEach((name, index) => {
        insert("circle_members", {
          id: `${circleId}_member_${index + 1}`,
          circle_id: circleId,
          display_name: name,
          contact_hint: index % 2 === 0 ? "聊天群成員" : "",
          created_at: createdAt,
        });
      });
    });

    createSeedTask({
      id: "task_coffee_july",
      circleId: coffeeCircle,
      template: "group_buy",
      title: "7月咖啡豆團購",
      description: "精選單品咖啡豆，接單後新鮮烘焙。請在結單前完成下單。",
      deadlineAt: "2026-07-05T23:59:00+08:00",
      payment: "轉帳或行動支付。團主確認後會標記付款狀態。",
      pickup: "面交取貨，地點由團主另行通知。",
      metadata: { purpose: "group_buy", lineCompanion: true },
      options: [
        ["opt_yirgacheffe", "耶加雪菲 G1", "中焙 · 200g", 480, { origin: "衣索比亞", flavor: "花香、柑橘、蜂蜜" }],
        ["opt_colombia", "哥倫比亞 水洗", "淺焙 · 200g", 480, { origin: "哥倫比亞", flavor: "莓果、焦糖" }],
        ["opt_mandheling", "曼特寧 深焙", "深焙 · 200g", 520, { origin: "印尼", flavor: "堅果、黑巧克力" }],
      ],
      responses: [
        ["王小明", "opt_yirgacheffe", 2, "paid", "picked_up", "週末取貨"],
        ["林怡君", "opt_colombia", 1, "review", "pending", "末五碼 11235"],
        ["張志豪", "opt_yirgacheffe", 1, "unpaid", "pending", ""],
        ["陳雅婷", "opt_mandheling", 2, "paid", "pending", "請磨粉"],
        ["黃大維", "opt_colombia", 1, "paid", "picked_up", ""],
        ["吳佳穎", "opt_yirgacheffe", 1, "review", "pending", "週五可取"],
      ],
    });

    createSeedTask({
      id: "task_lunch_bento",
      circleId: officeCircle,
      template: "meal_order",
      title: "今天午餐便當",
      description: "11:10 前填完。店家：港式燒臘便當。",
      deadlineAt: "2026-06-29T11:10:00+08:00",
      payment: "午餐到再統一轉帳給小美。",
      pickup: "12:10 到公司 6F 茶水間。",
      metadata: { restaurant: "港式燒臘便當", deliveryTime: "12:10" },
      options: [
        ["opt_duck", "燒鴨飯", "可加飯、不加蔥", 120, {}],
        ["opt_chicken", "油雞飯", "可加辣、可少飯", 110, {}],
        ["opt_pork", "叉燒飯", "可雙拼", 130, {}],
      ],
      responses: [
        ["林小美", "opt_duck", 1, "paid", "pending", "不要蔥"],
        ["王大明", "opt_chicken", 1, "unpaid", "pending", "加辣"],
        ["張小華", "opt_pork", 1, "paid", "pending", "飯少"],
      ],
    });

    createSeedTask({
      id: "task_drink_order",
      circleId: officeCircle,
      template: "drink_order",
      title: "下午手搖飲",
      description: "15:00 前填完。店家：春日茶室。",
      deadlineAt: "2026-06-29T15:00:00+08:00",
      payment: "飲料到再轉帳。",
      pickup: "16:00 前台自取。",
      metadata: { shop: "春日茶室", fields: ["甜度", "冰塊", "加料"] },
      options: [
        ["opt_black_tea", "紅茶拿鐵", "大杯", 65, { sweetness: ["無糖", "微糖", "半糖"], ice: ["去冰", "少冰", "正常"] }],
        ["opt_oolong", "四季春青茶", "大杯", 45, { sweetness: ["無糖", "微糖", "半糖"], ice: ["去冰", "少冰", "正常"] }],
        ["opt_fruit", "葡萄柚綠", "大杯", 70, { sweetness: ["微糖", "半糖"], ice: ["少冰", "正常"] }],
      ],
      responses: [
        ["Kevin", "opt_black_tea", 1, "paid", "pending", "微糖少冰"],
        ["怡君", "opt_oolong", 1, "unpaid", "pending", "無糖去冰"],
      ],
    });

    createSeedTask({
      id: "task_ktv_friday",
      circleId: friendsCircle,
      template: "activity",
      title: "週五下班 KTV",
      description: "先統計人數，滿 6 人就訂包廂。",
      deadlineAt: "2026-07-03T18:00:00+08:00",
      payment: "現場 AA，若需訂金再通知。",
      pickup: "地點：西門錢櫃或好樂迪，依投票結果。",
      metadata: { locationOptions: ["西門錢櫃", "西門好樂迪"], deposit: 0 },
      options: [
        ["opt_join", "我要參加", "19:30 後可到", 0, {}],
        ["opt_maybe", "先暫定", "晚點確認", 0, {}],
        ["opt_no", "這次不行", "下次再約", 0, {}],
      ],
      responses: [
        ["王小明", "opt_join", 1, "not_required", "attending", "可到 23:00"],
        ["林怡君", "opt_maybe", 1, "not_required", "maybe", "要看加班"],
        ["張志豪", "opt_join", 1, "not_required", "attending", "想唱新歌"],
      ],
    });
  }

  function ensureMemberMarketExample() {
    const createdAt = now();
    const owner = db.prepare("SELECT id FROM users ORDER BY created_at ASC LIMIT 1").get();
    const ownerId = owner?.id ?? "user_kevin";
    const circleId = "circle_market";

    if (!db.prepare("SELECT 1 FROM circles WHERE id = ?").get(circleId)) {
      insert("circles", {
        id: circleId,
        owner_user_id: ownerId,
        name: "圈內小市集",
        description: "圈內成員偶爾分享自種蔬果、手作品或少量現貨",
        invite_code: shareToken(),
        created_at: createdAt,
      });
    }

    const memberCount = db.prepare("SELECT COUNT(*) AS count FROM circle_members WHERE circle_id = ?").get(circleId).count;
    if (memberCount === 0) {
      ["阿姨菜園", "手作小安", "Kevin", "林怡君", "王小明"].forEach((name, index) => {
        insert("circle_members", {
          id: `${circleId}_member_${index + 1}`,
          circle_id: circleId,
          display_name: name,
          contact_hint: index < 2 ? "可發起圈內販售" : "圈內成員",
          created_at: createdAt,
        });
      });
    }

    if (db.prepare("SELECT 1 FROM tasks WHERE id = ?").get("task_weekend_market")) return;

    createSeedTask({
      id: "task_weekend_market",
      circleId,
      template: "member_sale",
      title: "週末自種蔬菜與手作品",
      description: "圈內成員少量分享，先登記數量，採收或製作完成後通知付款取貨。",
      deadlineAt: "2026-07-04T20:00:00+08:00",
      payment: "確認有貨後再轉帳給販售者，管理者協助標記付款。",
      pickup: "週日傍晚公司門口或社區管理室面交。",
      metadata: { seller: "阿姨菜園 / 手作小安", visibility: "circle_only", fulfillment: "pickup" },
      options: [
        ["opt_market_vegbox", "自種蔬菜箱", "當季葉菜、青椒、小黃瓜，約 3 斤", 250, { inventory: 12, seller: "阿姨菜園" }],
        ["opt_market_tomato", "牛番茄", "一袋 2 斤", 180, { inventory: 10, seller: "阿姨菜園" }],
        ["opt_market_jam", "手作鳳梨果醬", "小瓶 180g", 160, { inventory: 8, seller: "手作小安" }],
      ],
      responses: [
        ["林怡君", "opt_market_vegbox", 1, "review", "pending", "若有多的小黃瓜也可以加"],
        ["王小明", "opt_market_tomato", 2, "unpaid", "pending", "週日可面交"],
        ["Kevin", "opt_market_jam", 1, "paid", "picked_up", "先訂一瓶"],
      ],
    });
  }

  function ensureInterestCheckExample() {
    const taskId = "task_movie_interest";
    if (db.prepare("SELECT 1 FROM tasks WHERE id = ?").get(taskId)) return;

    const circle = db.prepare("SELECT id FROM circles WHERE id = ?").get("circle_friends");
    if (!circle) return;

    createSeedTask({
      id: taskId,
      circleId: circle.id,
      template: "interest_check",
      title: "週末電影或免費票券意願調查",
      description: "朋友臨時有幾張電影票，先問圈內誰有興趣。人數夠再正式約時間或分配票券。",
      deadlineAt: "2026-07-02T22:00:00+08:00",
      payment: "目前只是意願調查，暫不收款。",
      pickup: "若確定成行，會在公告中通知集合時間或取票方式。",
      metadata: { stage: "interest", examples: ["看電影", "吃飯", "看球賽", "免費票券"] },
      options: [
        ["opt_interest_yes", "我有興趣", "可備註人數、時間或偏好", 0, { intent: "interested" }],
        ["opt_interest_ticket", "想先保留名額", "票券、座位、餐廳人數可先估", 0, { intent: "reserve" }],
        ["opt_interest_no", "這次先不參加", "方便主揪估算比例", 0, { intent: "not_this_time" }],
      ],
      responses: [
        ["王小明", "opt_interest_yes", 2, "not_required", "attending", "週六晚上可以"],
        ["林怡君", "opt_interest_ticket", 1, "not_required", "maybe", "若是 20:00 後我可以"],
        ["張志豪", "opt_interest_no", 1, "not_required", "pending", "這週不行，下次再約"],
      ],
    });
  }

  function createSeedTask({ id: taskId, circleId, template, title, description, deadlineAt, payment, pickup, metadata, options, responses }) {
    const createdAt = now();
    insert("tasks", {
      id: taskId,
      circle_id: circleId,
      template,
      title,
      description,
      deadline_at: deadlineAt,
      status: "open",
      share_token: shareToken(),
      payment_instructions: payment,
      pickup_instructions: pickup,
      metadata_json: json(metadata),
      created_at: createdAt,
      updated_at: createdAt,
    });

    options.forEach(([optionId, optionTitle, subtitle, unitPrice, optionMetadata], index) => {
      insert("task_options", {
        id: optionId,
        task_id: taskId,
        title: optionTitle,
        subtitle,
        unit_price: unitPrice,
        metadata_json: json(optionMetadata),
        sort_order: index,
      });
    });

    responses.forEach(([name, optionId, quantity, paymentStatus, fulfillmentStatus, note], index) => {
      const option = db.prepare("SELECT * FROM task_options WHERE id = ?").get(optionId);
      const responseId = `${taskId}_response_${index + 1}`;
      const total = option.unit_price * quantity;
      insert("responses", {
        id: responseId,
        task_id: taskId,
        participant_name: name,
        participant_contact: "",
        note,
        total_amount: total,
        payment_status: paymentStatus,
        fulfillment_status: fulfillmentStatus,
        rsvp_status: fulfillmentStatus === "maybe" ? "maybe" : fulfillmentStatus === "attending" ? "yes" : "yes",
        guest_count: 0,
        metadata_json: json({ source: "seed" }),
        created_at: createdAt,
        updated_at: createdAt,
      });
      insert("response_items", {
        id: `${responseId}_item_1`,
        response_id: responseId,
        option_id: optionId,
        quantity,
        unit_price: option.unit_price,
        metadata_json: json({}),
      });
    });
  }

  function ensureCommunicationExamples() {
    const createdAt = now();
    const task = db.prepare("SELECT id, circle_id FROM tasks WHERE id = ?").get("task_drink_order");
    if (!task) return;

    if (!db.prepare("SELECT 1 FROM announcements WHERE id = ?").get("announcement_drink_pickup")) {
      insert("announcements", {
        id: "announcement_drink_pickup",
        circle_id: task.circle_id,
        task_id: task.id,
        author_name: "Kevin",
        title: "飲料到前提醒",
        body: "15:00 準時結單，飲料到公司前台後會再通知大家自取。",
        priority: "important",
        requires_confirmation: 0,
        pinned_at: createdAt,
        published_at: createdAt,
        created_at: createdAt,
        updated_at: createdAt,
        deleted_at: null,
      });
    }

    if (!db.prepare("SELECT 1 FROM task_comments WHERE id = ?").get("comment_drink_sweetness")) {
      insert("task_comments", {
        id: "comment_drink_sweetness",
        task_id: task.id,
        author_name: "",
        participant_name: "怡君",
        body: "我可以改成無糖去冰嗎？",
        metadata_json: json({ source: "seed" }),
        created_at: createdAt,
        updated_at: createdAt,
        deleted_at: null,
      });
    }
  }

  function optionFromRow(row) {
    return {
      id: row.id,
      title: row.title,
      subtitle: row.subtitle,
      unitPrice: row.unit_price,
      metadata: parseJson(row.metadata_json),
      sortOrder: row.sort_order,
      isActive: row.is_active !== 0,
    };
  }

  function responseFromRows(response, items = []) {
    return {
      id: response.id,
      taskId: response.task_id,
      participantName: response.participant_name,
      participantContact: response.participant_contact,
      note: response.note,
      totalAmount: response.total_amount,
      paymentStatus: response.payment_status,
      fulfillmentStatus: response.fulfillment_status,
      rsvpStatus: response.rsvp_status,
      guestCount: response.guest_count,
      metadata: parseJson(response.metadata_json),
      createdAt: response.created_at,
      updatedAt: response.updated_at,
      items,
    };
  }

  function announcementFromRow(row) {
    return {
      id: row.id,
      circleId: row.circle_id,
      taskId: row.task_id,
      authorName: row.author_name,
      title: row.title,
      body: row.body,
      priority: row.priority,
      requiresConfirmation: Boolean(row.requires_confirmation),
      pinnedAt: row.pinned_at,
      publishedAt: row.published_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function commentFromRow(row) {
    return {
      id: row.id,
      taskId: row.task_id,
      authorName: row.author_name,
      participantName: row.participant_name,
      body: row.body,
      metadata: parseJson(row.metadata_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function taskFromRow(row) {
    const circle = db.prepare("SELECT * FROM circles WHERE id = ?").get(row.circle_id);
    const options = db
      .prepare("SELECT * FROM task_options WHERE task_id = ? AND is_active = 1 ORDER BY sort_order ASC")
      .all(row.id)
      .map(optionFromRow);
    const responses = db.prepare("SELECT * FROM responses WHERE task_id = ? ORDER BY created_at DESC").all(row.id);
    const responseModels = responses.map((response) => {
      const items = db
        .prepare(`
          SELECT response_items.*, task_options.title, task_options.subtitle
          FROM response_items
          JOIN task_options ON task_options.id = response_items.option_id
          WHERE response_items.response_id = ?
        `)
        .all(response.id)
        .map((item) => ({
          id: item.id,
          optionId: item.option_id,
          title: item.title,
          subtitle: item.subtitle,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          metadata: parseJson(item.metadata_json),
        }));
      return responseFromRows(response, items);
    });

    const stats = summarizeResponses(responseModels);
    const announcements = db
      .prepare("SELECT * FROM announcements WHERE task_id = ? AND deleted_at IS NULL ORDER BY published_at DESC, created_at DESC")
      .all(row.id)
      .map(announcementFromRow);
    const comments = db
      .prepare("SELECT * FROM task_comments WHERE task_id = ? AND deleted_at IS NULL ORDER BY created_at ASC")
      .all(row.id)
      .map(commentFromRow);

    return {
      id: row.id,
      circleId: row.circle_id,
      circleName: circle?.name ?? "",
      template: row.template,
      templateLabel: templateLabels[row.template] ?? row.template,
      title: row.title,
      description: row.description,
      deadlineAt: row.deadline_at,
      status: row.status,
      shareToken: row.share_token,
      paymentInstructions: row.payment_instructions,
      pickupInstructions: row.pickup_instructions,
      metadata: parseJson(row.metadata_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      options,
      responses: responseModels,
      announcements,
      comments,
      stats,
    };
  }

  function summarizeResponses(responses) {
    return responses.reduce(
      (acc, response) => {
        acc.responses += 1;
        acc.totalAmount += response.totalAmount;
        acc.totalQuantity += response.items.reduce((sum, item) => sum + item.quantity, 0);
        if (response.paymentStatus === "unpaid") acc.unpaid += 1;
        if (response.paymentStatus === "review") acc.review += 1;
        if (response.paymentStatus === "paid") acc.paid += 1;
        if (["pending", "attending", "maybe"].includes(response.fulfillmentStatus)) acc.pending += 1;
        return acc;
      },
      { responses: 0, totalAmount: 0, totalQuantity: 0, unpaid: 0, review: 0, paid: 0, pending: 0 },
    );
  }

  function listTasks() {
    return db
      .prepare("SELECT * FROM tasks ORDER BY created_at DESC")
      .all()
      .map(taskFromRow);
  }

  function getTask(taskId) {
    const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
    if (!row) return null;
    return taskFromRow(row);
  }

  function getTaskByShareToken(token) {
    const row = db.prepare("SELECT * FROM tasks WHERE share_token = ?").get(token);
    if (!row) return null;
    return taskFromRow(row);
  }

  function getBootstrap() {
    const circles = db.prepare("SELECT * FROM circles ORDER BY created_at ASC").all();
    return {
      circles: circles.map((circle) => ({
        id: circle.id,
        name: circle.name,
        description: circle.description,
        inviteCode: circle.invite_code,
        memberCount: circleMemberCount(circle.id),
      })),
      tasks: listTasks(),
      templates: Object.entries(templateLabels).map(([templateId, label]) => ({ id: templateId, label })),
    };
  }

  function createTask(body = {}) {
    const taskId = id("task");
    const createdAt = now();
    const template = body.template || "group_buy";
    const circleId = body.circleId || "circle_office";
    const options = Array.isArray(body.options) && body.options.length > 0 ? body.options : [{ title: "選項", subtitle: "", unitPrice: 0 }];

    insert("tasks", {
      id: taskId,
      circle_id: circleId,
      template,
      title: body.title || `新的${templateLabels[template] ?? "事項"}`,
      description: body.description || "",
      deadline_at: body.deadlineAt || null,
      status: "open",
      share_token: shareToken(),
      payment_instructions: body.paymentInstructions || "",
      pickup_instructions: body.pickupInstructions || "",
      metadata_json: json(body.metadata),
      created_at: createdAt,
      updated_at: createdAt,
    });

    options.forEach((option, index) => {
      insert("task_options", {
        id: id("option"),
        task_id: taskId,
        title: option.title || "選項",
        subtitle: option.subtitle || "",
        unit_price: Number(option.unitPrice || 0),
        metadata_json: json(option.metadata),
        sort_order: index,
      });
    });

    return getTask(taskId);
  }

  function updateTaskDetails(taskId, body = {}) {
    const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
    if (!existing) return null;

    const options = normalizeTaskOptions(body.options);
    const nextTitle = body.title == null ? existing.title : String(body.title).trim();
    if (!nextTitle) throw new StoreError(400, "Task title is required");

    const updatedAt = now();
    db.exec("BEGIN IMMEDIATE;");
    try {
      db.prepare(`
        UPDATE tasks
        SET title = $title,
            description = $description,
            deadline_at = $deadline_at,
            payment_instructions = $payment_instructions,
            pickup_instructions = $pickup_instructions,
            metadata_json = $metadata_json,
            updated_at = $updated_at
        WHERE id = $id
      `).run({
        id: existing.id,
        title: nextTitle,
        description: body.description == null ? existing.description : String(body.description),
        deadline_at: Object.hasOwn(body, "deadlineAt") ? body.deadlineAt || null : existing.deadline_at,
        payment_instructions:
          body.paymentInstructions == null ? existing.payment_instructions : String(body.paymentInstructions),
        pickup_instructions: body.pickupInstructions == null ? existing.pickup_instructions : String(body.pickupInstructions),
        metadata_json: body.metadata === undefined ? existing.metadata_json : json(body.metadata),
        updated_at: updatedAt,
      });

      if (options) {
        const existingOptions = db.prepare("SELECT * FROM task_options WHERE task_id = ?").all(existing.id);
        const existingById = new Map(existingOptions.map((option) => [option.id, option]));
        const activeOptionIds = new Set();

        options.forEach((option, index) => {
          if (option.id) {
            const existingOption = existingById.get(option.id);
            if (!existingOption) throw new StoreError(400, `Invalid option ${option.id}`);
            db.prepare(`
              UPDATE task_options
              SET title = $title,
                  subtitle = $subtitle,
                  unit_price = $unit_price,
                  metadata_json = $metadata_json,
                  sort_order = $sort_order,
                  is_active = 1
              WHERE id = $id
                AND task_id = $task_id
            `).run({
              id: option.id,
              task_id: existing.id,
              title: option.title,
              subtitle: option.subtitle,
              unit_price: option.unitPrice,
              metadata_json: option.metadata === undefined ? existingOption.metadata_json : json(option.metadata),
              sort_order: index,
            });
            activeOptionIds.add(option.id);
            return;
          }

          const optionId = id("option");
          insert("task_options", {
            id: optionId,
            task_id: existing.id,
            title: option.title,
            subtitle: option.subtitle,
            unit_price: option.unitPrice,
            metadata_json: json(option.metadata),
            sort_order: index,
            is_active: 1,
          });
          activeOptionIds.add(optionId);
        });

        existingOptions.forEach((option) => {
          if (!activeOptionIds.has(option.id)) {
            db.prepare("UPDATE task_options SET is_active = 0 WHERE id = ? AND task_id = ?").run(option.id, existing.id);
          }
        });
      }

      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }

    return getTask(existing.id);
  }

  function convertInterestCheck(taskId, body = {}) {
    const sourceTask = getTask(taskId);
    if (!sourceTask) return null;
    if (sourceTask.template !== "interest_check") {
      throw new StoreError(409, "Only interest_check tasks can be converted");
    }

    const targetTemplate = body.targetTemplate || body.template || "activity";
    const conversion = buildInterestConversion({
      sourceTask,
      targetTemplate,
      overrides: {
        title: body.title,
        description: body.description,
        deadlineAt: body.deadlineAt,
        paymentInstructions: body.paymentInstructions,
        pickupInstructions: body.pickupInstructions,
        options: body.options,
        metadata: body.metadata,
      },
    });

    const createdTask = createTask(conversion.task);
    createTaskComment(createdTask.id, {
      participantName: "系統",
      body: conversion.summaryText,
      metadata: { type: "interest_conversion", sourceTaskId: sourceTask.id },
    });

    const nextSourceMetadata = {
      ...sourceTask.metadata,
      convertedTo: [
        ...(Array.isArray(sourceTask.metadata.convertedTo) ? sourceTask.metadata.convertedTo : []),
        {
          taskId: createdTask.id,
          template: targetTemplate,
          title: createdTask.title,
          convertedAt: conversion.sourceReference.convertedAt,
        },
      ],
    };
    db.prepare("UPDATE tasks SET metadata_json = ?, updated_at = ? WHERE id = ?").run(json(nextSourceMetadata), now(), sourceTask.id);

    return {
      sourceTask: getTask(sourceTask.id),
      task: getTask(createdTask.id),
    };
  }

  function createShareResponse(token, body = {}) {
    const task = getTaskByShareToken(token);
    if (!task) throw new StoreError(404, "Share link not found");
    if (task.status !== "open") throw new StoreError(409, "Task is not open");

    const items = Array.isArray(body.items) ? body.items.filter((item) => Number(item.quantity) > 0) : [];
    if (!body.participantName || items.length === 0) {
      throw new StoreError(400, "participantName and at least one item are required");
    }

    const createdAt = now();
    const responseId = id("response");
    let totalAmount = 0;
    const optionRows = items.map((item) => {
      const option = db.prepare("SELECT * FROM task_options WHERE id = ? AND task_id = ? AND is_active = 1").get(item.optionId, task.id);
      if (!option) throw new StoreError(400, `Invalid option ${item.optionId}`);
      const quantity = Number(item.quantity || 1);
      totalAmount += option.unit_price * quantity;
      return { option, quantity, metadata: item.metadata };
    });

    insert("responses", {
      id: responseId,
      task_id: task.id,
      participant_name: body.participantName,
      participant_contact: body.participantContact || "",
      note: body.note || "",
      total_amount: totalAmount,
      payment_status: totalAmount > 0 ? "unpaid" : "not_required",
      fulfillment_status: task.template === "activity" ? "attending" : "pending",
      rsvp_status: body.rsvpStatus || "yes",
      guest_count: Number(body.guestCount || 0),
      metadata_json: json(body.metadata),
      created_at: createdAt,
      updated_at: createdAt,
    });

    optionRows.forEach(({ option, quantity, metadata }) => {
      insert("response_items", {
        id: id("item"),
        response_id: responseId,
        option_id: option.id,
        quantity,
        unit_price: option.unit_price,
        metadata_json: json(metadata),
      });
    });

    return getTask(task.id);
  }

  function updateResponse(responseId, patch = {}) {
    const existing = db.prepare("SELECT * FROM responses WHERE id = ?").get(responseId);
    if (!existing) return null;

    const next = {
      payment_status: patch.paymentStatus ?? existing.payment_status,
      fulfillment_status: patch.fulfillmentStatus ?? existing.fulfillment_status,
      note: patch.note ?? existing.note,
      updated_at: now(),
    };
    db.prepare(`
      UPDATE responses
      SET payment_status = $payment_status,
          fulfillment_status = $fulfillment_status,
          note = $note,
          updated_at = $updated_at
      WHERE id = $id
    `).run({ ...next, id: existing.id });

    return getTask(existing.task_id);
  }

  function updateTaskStatus(taskId, status = "open") {
    const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
    if (!existing) return null;
    db.prepare("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?").run(status, now(), existing.id);
    return getTask(existing.id);
  }

  function createTaskAnnouncement(taskId, body = {}) {
    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
    if (!task) return null;
    if (!body.body) throw new StoreError(400, "Announcement body is required");

    const createdAt = now();
    insert("announcements", {
      id: id("announcement"),
      circle_id: task.circle_id,
      task_id: task.id,
      author_name: body.authorName || "主揪",
      title: body.title || "事項公告",
      body: body.body,
      priority: body.priority || "normal",
      requires_confirmation: body.requiresConfirmation ? 1 : 0,
      pinned_at: body.pinnedAt || null,
      published_at: createdAt,
      created_at: createdAt,
      updated_at: createdAt,
      deleted_at: null,
    });

    return getTask(task.id);
  }

  function createTaskComment(taskId, body = {}) {
    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
    if (!task) return null;
    if (!body.body) throw new StoreError(400, "Comment body is required");

    const createdAt = now();
    insert("task_comments", {
      id: id("comment"),
      task_id: task.id,
      author_name: body.authorName || "",
      participant_name: body.participantName || body.authorName || "成員",
      body: body.body,
      metadata_json: json(body.metadata),
      created_at: createdAt,
      updated_at: createdAt,
      deleted_at: null,
    });

    return getTask(task.id);
  }

  function buildCsv(task) {
    const rows = [
      ["事項", "模板", "姓名", "品項", "數量", "金額", "付款狀態", "完成狀態", "備註"],
      ...task.responses.flatMap((response) =>
        response.items.map((item) => [
          task.title,
          task.templateLabel,
          response.participantName,
          item.title,
          item.quantity,
          response.totalAmount,
          response.paymentStatus,
          response.fulfillmentStatus,
          response.note,
        ]),
      ),
    ];
    return rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  }

  function buildTaskCsv(taskId) {
    const task = getTask(taskId);
    if (!task) return null;
    return { task, csv: buildCsv(task) };
  }

  function profileFromUser(user) {
    if (!user) return null;
    return {
      id: user.id,
      displayName: user.display_name,
      email: user.email,
      phone: null,
      avatarUrl: null,
      locale: "zh-TW",
      timezone: "Asia/Taipei",
      status: "active",
    };
  }

  function resolveUser(actor = {}) {
    const profileId = actor.profileId ? String(actor.profileId).trim() : "";
    const email = actor.email ? String(actor.email).trim().toLowerCase() : "";
    if (profileId) return db.prepare("SELECT * FROM users WHERE id = ?").get(profileId) ?? null;
    if (email) return db.prepare("SELECT * FROM users WHERE lower(email) = ?").get(email) ?? null;
    return null;
  }

  function requireUser(actor = {}) {
    const user = resolveUser(actor);
    if (!user) throw new StoreError(401, "Profile authentication required");
    return user;
  }

  function normalizeCircleName(name) {
    const value = String(name || "").trim();
    if (!value) throw new StoreError(400, "Circle name is required");
    if (value.length > 40) throw new StoreError(400, "Circle name must be 40 characters or less");
    return value;
  }

  function normalizeCircleDescription(description = "") {
    const value = String(description || "").trim();
    if (value.length > 160) throw new StoreError(400, "Circle description must be 160 characters or less");
    return value;
  }

  function normalizeProfileDisplayName(value) {
    const clean = String(value || "").trim();
    if (!clean) throw new StoreError(400, "Profile display name is required");
    if (clean.length > 40) throw new StoreError(400, "Profile display name must be 40 characters or less");
    return clean;
  }

  function ownerMembershipFromCircle(circle, user) {
    return {
      id: `${circle.id}_${user.id}_owner`,
      circleId: circle.id,
      circleName: circle.name,
      profileId: user.id,
      displayName: user.display_name,
      contactHint: "圈主",
      role: "owner",
      status: "active",
      joinedAt: circle.created_at,
    };
  }

  function circleFromRow(circle) {
    return {
      id: circle.id,
      name: circle.name,
      description: circle.description,
      inviteCode: circle.invite_code,
      memberCount: circleMemberCount(circle.id),
    };
  }

  function memberFromRow(row, circleName) {
    return {
      id: row.id,
      circleId: row.circle_id,
      circleName,
      profileId: null,
      displayName: row.display_name,
      contactHint: row.contact_hint,
      role: "member",
      status: "active",
      joinedAt: row.created_at,
    };
  }

  function createCircle(body = {}) {
    const user = requireUser(body.actor);
    const circleId = id("circle");
    const createdAt = now();
    insert("circles", {
      id: circleId,
      owner_user_id: user.id,
      name: normalizeCircleName(body.name),
      description: normalizeCircleDescription(body.description),
      invite_code: shareToken(),
      created_at: createdAt,
    });
    return circleFromRow(db.prepare("SELECT * FROM circles WHERE id = ?").get(circleId));
  }

  function updateCircle(circleId, body = {}) {
    const user = requireUser(body.actor);
    const circle = db.prepare("SELECT * FROM circles WHERE id = ?").get(circleId);
    if (!circle) throw new StoreError(404, "Circle not found");
    if (circle.owner_user_id !== user.id) throw new StoreError(403, "Circle owner role required");

    db.prepare("UPDATE circles SET name = ?, description = ? WHERE id = ?").run(
      normalizeCircleName(body.name),
      normalizeCircleDescription(body.description),
      circleId,
    );
    return circleFromRow(db.prepare("SELECT * FROM circles WHERE id = ?").get(circleId));
  }

  function getSessionContext(actor = {}) {
    const user = resolveUser(actor);
    if (!user) {
      return {
        authenticated: false,
        profile: null,
        memberships: [],
        capabilities: {
          createTask: false,
          manageTasks: false,
          circleChat: false,
          pushDevices: false,
        },
      };
    }

    const circles = db.prepare("SELECT * FROM circles WHERE owner_user_id = ? ORDER BY created_at ASC").all(user.id);
    const memberships = circles.map((circle) => ownerMembershipFromCircle(circle, user));
    return {
      authenticated: true,
      profile: profileFromUser(user),
      memberships,
      capabilities: {
        createTask: memberships.length > 0,
        manageTasks: memberships.length > 0,
        circleChat: false,
        pushDevices: false,
      },
    };
  }

  function updateProfile(body = {}) {
    const user = requireUser(body.actor);
    db.prepare("UPDATE users SET display_name = ? WHERE id = ?").run(normalizeProfileDisplayName(body.displayName), user.id);
    return profileFromUser(db.prepare("SELECT * FROM users WHERE id = ?").get(user.id));
  }

  function listCircleMembers(circleId, actor = {}) {
    const user = requireUser(actor);
    const circle = db.prepare("SELECT * FROM circles WHERE id = ?").get(circleId);
    if (!circle) throw new StoreError(404, "Circle not found");
    if (circle.owner_user_id !== user.id) throw new StoreError(403, "Circle membership required");

    const members = db
      .prepare("SELECT * FROM circle_members WHERE circle_id = ? ORDER BY created_at ASC")
      .all(circle.id)
      .map((member) => memberFromRow(member, circle.name));
    return [ownerMembershipFromCircle(circle, user), ...members];
  }

  function getTaskPermissions(taskId, actor = {}) {
    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
    if (!task) return null;
    const circle = db.prepare("SELECT * FROM circles WHERE id = ?").get(task.circle_id);
    const user = resolveUser(actor);
    const canManage = Boolean(user && circle?.owner_user_id === user.id);

    return {
      authenticated: Boolean(user),
      profileId: user?.id ?? null,
      circleId: task.circle_id,
      role: canManage ? "owner" : null,
      canRead: true,
      canComment: task.status === "open" || canManage,
      canRespond: task.status === "open",
      canManage,
      canAnnounce: canManage,
      canClose: canManage,
      canExport: canManage,
    };
  }

  function postgresOnlyRealtime() {
    throw new StoreError(501, "Realtime chat and push scaffolding are Postgres-only in this MVP");
  }

  function postgresOnlyAuth() {
    throw new StoreError(501, "Official auth sessions are Postgres-only in this MVP");
  }

  function postgresOnlyCircleInvites() {
    throw new StoreError(501, "Circle invites and member management are Postgres-only in this MVP");
  }

  initSchema();
  seed();
  ensureInterestCheckExample();
  ensureMemberMarketExample();
  ensureCommunicationExamples();

  return {
    backend: "sqlite",
    dbPath,
    health: () => ({ ok: true, backend: "sqlite", dbPath }),
    getSessionContext,
    updateProfile,
    createCircle,
    updateCircle,
    listCircleMembers,
    getCircleInvite: postgresOnlyCircleInvites,
    listCircleInvites: postgresOnlyCircleInvites,
    createCircleInvite: postgresOnlyCircleInvites,
    revokeCircleInvite: postgresOnlyCircleInvites,
    acceptCircleInvite: postgresOnlyCircleInvites,
    updateCircleMember: postgresOnlyCircleInvites,
    getTaskPermissions,
    createOAuthState: postgresOnlyAuth,
    consumeOAuthState: postgresOnlyAuth,
    upsertAuthIdentity: postgresOnlyAuth,
    createAuthSession: postgresOnlyAuth,
    createAuthSessionForEmail: postgresOnlyAuth,
    revokeAuthSession: postgresOnlyAuth,
    getBootstrap,
    getTask,
    getTaskByShareToken,
    createTask,
    updateTaskDetails,
    convertInterestCheck,
    createShareResponse,
    updateResponse,
    updateTaskStatus,
    createTaskAnnouncement,
    createTaskComment,
    listConversations: postgresOnlyRealtime,
    createConversation: postgresOnlyRealtime,
    listConversationMessages: postgresOnlyRealtime,
    createConversationMessage: postgresOnlyRealtime,
    markMessageRead: postgresOnlyRealtime,
    registerDevice: postgresOnlyRealtime,
    listNotifications: postgresOnlyRealtime,
    markNotificationRead: postgresOnlyRealtime,
    buildTaskCsv,
    close: () => db.close(),
  };
}
