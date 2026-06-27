export const templateLabels = {
  group_buy: "團購",
  interest_check: "意願調查",
  claim: "領取登記",
  member_sale: "圈內小市集",
  meal_order: "訂餐",
  drink_order: "訂飲料",
  activity: "活動 / KTV",
  poll: "投票",
  expense_split: "費用分攤",
};

export class StoreError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "StoreError";
    this.status = status;
  }
}

export function notImplemented(method) {
  return new StoreError(501, `Postgres store method not implemented yet: ${method}`);
}

export function normalizeTaskOptions(options) {
  if (!Array.isArray(options)) return null;

  const cleaned = options
    .map((option) => ({
      id: option.id || null,
      title: String(option.title || "").trim(),
      subtitle: String(option.subtitle || "").trim(),
      unitPrice: Math.max(0, Number(option.unitPrice || 0)),
      currency: option.currency || "TWD",
      maxQuantity: option.maxQuantity ?? null,
      metadata: option.metadata,
    }))
    .filter((option) => option.title);

  if (cleaned.length === 0) {
    throw new StoreError(400, "At least one option is required");
  }

  return cleaned;
}

export const interestConversionTargets = {
  activity: "正式活動",
  poll: "投票",
  claim: "領取登記",
};

function responseIntent(response) {
  const itemIntent = response.items.find((item) => item.metadata?.intent)?.metadata.intent;
  const selectedTitle = response.items.map((item) => item.title).join(" ");
  if (itemIntent === "not_this_time" || response.rsvpStatus === "no" || selectedTitle.includes("不參加")) return "not_this_time";
  if (itemIntent === "reserve" || selectedTitle.includes("保留")) return "reserve";
  return "interested";
}

export function summarizeInterestTask(task) {
  return task.responses.reduce(
    (summary, response) => {
      const intent = responseIntent(response);
      const quantity = response.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 1;
      const entry = {
        participantName: response.participantName,
        note: response.note,
        intent,
        quantity,
        rsvpStatus: response.rsvpStatus,
        selectedOptions: response.items.map((item) => item.title),
      };

      summary.responses.push(entry);
      if (intent === "not_this_time") {
        summary.notThisTime += 1;
        summary.notThisTimeQuantity += quantity;
      } else {
        summary.positive += 1;
        summary.positiveQuantity += quantity;
        if (intent === "reserve") {
          summary.reserve += 1;
          summary.reserveQuantity += quantity;
        }
      }

      return summary;
    },
    {
      positive: 0,
      positiveQuantity: 0,
      reserve: 0,
      reserveQuantity: 0,
      notThisTime: 0,
      notThisTimeQuantity: 0,
      responses: [],
    },
  );
}

function convertedTitle(sourceTitle, targetTemplate) {
  const clean = sourceTitle.replace(/意願調查/g, "").replace(/[／\/-]\s*$/g, "").trim();
  const base = clean || sourceTitle;
  if (targetTemplate === "activity") return `${base}活動報名`;
  if (targetTemplate === "poll") return `${base}時間地點投票`;
  if (targetTemplate === "claim") return `${base}領取登記`;
  return base;
}

export function buildInterestConversion({ sourceTask, targetTemplate, overrides = {}, convertedAt = new Date().toISOString() }) {
  if (!interestConversionTargets[targetTemplate]) {
    throw new StoreError(400, `Unsupported conversion target: ${targetTemplate}`);
  }

  const cleanedOverrides = Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined));
  const summary = summarizeInterestTask(sourceTask);
  const sourceReference = {
    sourceTaskId: sourceTask.id,
    sourceTaskTitle: sourceTask.title,
    sourceShareToken: sourceTask.shareToken,
    convertedAt,
    summary,
  };

  const sharedMetadata = {
    convertedFrom: sourceReference,
    sourceInterestResponses: summary.responses,
  };

  const defaults = {
    activity: {
      title: convertedTitle(sourceTask.title, "activity"),
      description: `由「${sourceTask.title}」轉成正式活動。原意願調查共有 ${summary.positiveQuantity} 個有興趣或保留名額。`,
      paymentInstructions: "若需要訂金或 AA 分攤，主揪可後續公告。",
      pickupInstructions: "集合時間、地點與後續安排由主揪公告。",
      metadata: { ...sharedMetadata, stage: "confirmed_activity" },
      options: [
        { title: "我要參加", subtitle: "正式確認出席", unitPrice: 0 },
        { title: "先暫定", subtitle: "仍需主揪後續確認", unitPrice: 0 },
        { title: "這次不參加", subtitle: "保留紀錄方便統計", unitPrice: 0 },
      ],
    },
    poll: {
      title: convertedTitle(sourceTask.title, "poll"),
      description: `由「${sourceTask.title}」轉成投票。先把有興趣的人集中，再決定時間、地點或方案。`,
      paymentInstructions: "投票階段暫不收款。",
      pickupInstructions: "投票結束後再公告正式安排。",
      metadata: { ...sharedMetadata, stage: "decision_poll" },
      options: [
        { title: "選項 A", subtitle: "請主揪改成時間、地點或方案", unitPrice: 0 },
        { title: "選項 B", subtitle: "請主揪改成時間、地點或方案", unitPrice: 0 },
      ],
    },
    claim: {
      title: convertedTitle(sourceTask.title, "claim"),
      description: `由「${sourceTask.title}」轉成領取登記。適合免費票券、名額、好康或贈品分配。`,
      paymentInstructions: "免費領取或主揪另行公告費用。",
      pickupInstructions: "領取方式、取票方式或候補規則由主揪公告。",
      metadata: { ...sharedMetadata, stage: "claim_registration", noPayment: true },
      options: [
        { title: "我要領取", subtitle: "確定需要票券、名額或好康", unitPrice: 0 },
        { title: "候補", subtitle: "若有多的名額再通知", unitPrice: 0 },
        { title: "我先不用", subtitle: "方便主揪統計分配", unitPrice: 0 },
      ],
    },
  };

  const targetDefaults = defaults[targetTemplate];
  return {
    task: {
      ...targetDefaults,
      ...cleanedOverrides,
      template: targetTemplate,
      circleId: sourceTask.circleId,
      metadata: {
        ...targetDefaults.metadata,
        ...(cleanedOverrides.metadata ?? {}),
      },
    },
    sourceReference,
    summaryText: [
      `由意願調查「${sourceTask.title}」轉換而來。`,
      `有興趣/保留：${summary.positive} 人，合計 ${summary.positiveQuantity} 份或名額。`,
      `其中先保留：${summary.reserve} 人，合計 ${summary.reserveQuantity} 份或名額。`,
      `這次不參加：${summary.notThisTime} 人。`,
    ].join("\n"),
  };
}
