-- Demo data for the local InCircle Postgres database.
-- Re-runnable: fixed UUIDs and share tokens are updated on conflict.

SELECT COALESCE(
  (SELECT id::text FROM profiles WHERE lower(email) = lower('kevin@example.com') LIMIT 1),
  '11111111-1111-4111-8111-111111111111'
) AS seed_profile_id \gset

BEGIN;

INSERT INTO profiles (id, display_name, email, locale, timezone, metadata)
VALUES
  (:'seed_profile_id', 'Kevin', 'kevin@example.com', 'zh-TW', 'Asia/Taipei', '{"seed":true}'::jsonb)
ON CONFLICT (id) DO UPDATE
SET display_name = EXCLUDED.display_name,
    email = EXCLUDED.email,
    locale = EXCLUDED.locale,
    timezone = EXCLUDED.timezone,
    metadata = EXCLUDED.metadata;

INSERT INTO auth_identities (
  profile_id,
  provider,
  provider_user_id,
  email,
  email_verified,
  display_name,
  raw_profile,
  last_login_at
)
VALUES (
  :'seed_profile_id',
  'google',
  'seed-kevin-google',
  'kevin@example.com',
  true,
  'Kevin',
  '{"seed":true}'::jsonb,
  now()
)
ON CONFLICT (provider, provider_user_id) DO UPDATE
SET profile_id = EXCLUDED.profile_id,
    email = EXCLUDED.email,
    email_verified = EXCLUDED.email_verified,
    display_name = EXCLUDED.display_name,
    raw_profile = EXCLUDED.raw_profile,
    last_login_at = EXCLUDED.last_login_at;

INSERT INTO circles (id, owner_profile_id, name, description, visibility, invite_code, metadata)
VALUES
  ('22222222-2222-4222-8222-222222222201', :'seed_profile_id', '咖啡豆團購圈', '每月一起買單品咖啡豆', 'invite_link', 'coffee-demo', '{"seed":true}'::jsonb),
  ('22222222-2222-4222-8222-222222222202', :'seed_profile_id', '辦公室午餐圈', '公司中午訂餐、飲料、下午茶', 'invite_link', 'office-demo', '{"seed":true}'::jsonb),
  ('22222222-2222-4222-8222-222222222203', :'seed_profile_id', '下班放鬆圈', 'KTV、聚餐、活動揪團', 'invite_link', 'friends-demo', '{"seed":true}'::jsonb),
  ('22222222-2222-4222-8222-222222222204', :'seed_profile_id', '圈內小市集', '圈內成員偶爾分享自種蔬果、手作品或少量現貨', 'invite_link', 'market-demo', '{"seed":true,"visibility":"circle_only"}'::jsonb)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    visibility = EXCLUDED.visibility,
    invite_code = EXCLUDED.invite_code,
    metadata = EXCLUDED.metadata;

INSERT INTO circle_memberships (id, circle_id, profile_id, display_name, contact_hint, role, status, invited_by_profile_id, joined_at)
VALUES
  ('33333333-3333-4333-8333-333333333001', '22222222-2222-4222-8222-222222222201', :'seed_profile_id', 'Kevin', '圈主', 'owner', 'active', :'seed_profile_id', now()),
  ('33333333-3333-4333-8333-333333333002', '22222222-2222-4222-8222-222222222201', NULL, '王小明', '聊天群成員', 'member', 'active', :'seed_profile_id', now()),
  ('33333333-3333-4333-8333-333333333003', '22222222-2222-4222-8222-222222222201', NULL, '林怡君', '', 'member', 'active', :'seed_profile_id', now()),
  ('33333333-3333-4333-8333-333333333004', '22222222-2222-4222-8222-222222222201', NULL, '張志豪', '聊天群成員', 'member', 'active', :'seed_profile_id', now()),
  ('33333333-3333-4333-8333-333333333005', '22222222-2222-4222-8222-222222222201', NULL, '陳雅婷', '', 'member', 'active', :'seed_profile_id', now()),
  ('33333333-3333-4333-8333-333333333006', '22222222-2222-4222-8222-222222222202', :'seed_profile_id', 'Kevin', '圈主', 'owner', 'active', :'seed_profile_id', now()),
  ('33333333-3333-4333-8333-333333333007', '22222222-2222-4222-8222-222222222202', NULL, '林小美', '訂餐窗口', 'admin', 'active', :'seed_profile_id', now()),
  ('33333333-3333-4333-8333-333333333008', '22222222-2222-4222-8222-222222222202', NULL, '王大明', '', 'member', 'active', :'seed_profile_id', now()),
  ('33333333-3333-4333-8333-333333333009', '22222222-2222-4222-8222-222222222202', NULL, '張小華', '', 'member', 'active', :'seed_profile_id', now()),
  ('33333333-3333-4333-8333-333333333010', '22222222-2222-4222-8222-222222222202', NULL, '怡君', '', 'member', 'active', :'seed_profile_id', now()),
  ('33333333-3333-4333-8333-333333333011', '22222222-2222-4222-8222-222222222203', :'seed_profile_id', 'Kevin', '圈主', 'owner', 'active', :'seed_profile_id', now()),
  ('33333333-3333-4333-8333-333333333012', '22222222-2222-4222-8222-222222222203', NULL, '王小明', '', 'member', 'active', :'seed_profile_id', now()),
  ('33333333-3333-4333-8333-333333333013', '22222222-2222-4222-8222-222222222203', NULL, '林怡君', '', 'member', 'active', :'seed_profile_id', now()),
  ('33333333-3333-4333-8333-333333333014', '22222222-2222-4222-8222-222222222203', NULL, '張志豪', '', 'member', 'active', :'seed_profile_id', now()),
  ('33333333-3333-4333-8333-333333333015', '22222222-2222-4222-8222-222222222204', :'seed_profile_id', 'Kevin', '圈主', 'owner', 'active', :'seed_profile_id', now()),
  ('33333333-3333-4333-8333-333333333016', '22222222-2222-4222-8222-222222222204', NULL, '阿姨菜園', '可發起圈內販售', 'admin', 'active', :'seed_profile_id', now()),
  ('33333333-3333-4333-8333-333333333017', '22222222-2222-4222-8222-222222222204', NULL, '手作小安', '可發起圈內販售', 'admin', 'active', :'seed_profile_id', now()),
  ('33333333-3333-4333-8333-333333333018', '22222222-2222-4222-8222-222222222204', NULL, '林怡君', '', 'member', 'active', :'seed_profile_id', now()),
  ('33333333-3333-4333-8333-333333333019', '22222222-2222-4222-8222-222222222204', NULL, '王小明', '', 'member', 'active', :'seed_profile_id', now())
ON CONFLICT (id) DO UPDATE
SET display_name = EXCLUDED.display_name,
    contact_hint = EXCLUDED.contact_hint,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    joined_at = EXCLUDED.joined_at;

INSERT INTO tasks (
  id,
  circle_id,
  template_id,
  created_by_profile_id,
  seller_display_name,
  title,
  description,
  status,
  deadline_at,
  share_token,
  payment_instructions,
  pickup_instructions,
  metadata,
  opened_at
)
VALUES
  ('44444444-4444-4444-8444-444444444001', '22222222-2222-4222-8222-222222222201', 'group_buy', :'seed_profile_id', NULL, '7月咖啡豆團購', '精選單品咖啡豆，接單後新鮮烘焙。請在結單前完成下單。', 'open', '2026-07-05 23:59:00+08', 'pg-coffee-demo', '轉帳或行動支付。團主確認後會標記付款狀態。', '面交取貨，地點由團主另行通知。', '{"purpose":"group_buy","chatGroupCompanion":true}'::jsonb, now()),
  ('44444444-4444-4444-8444-444444444002', '22222222-2222-4222-8222-222222222202', 'meal_order', :'seed_profile_id', NULL, '今天午餐便當', '11:10 前填完。店家：港式燒臘便當。', 'open', '2026-06-29 11:10:00+08', 'pg-lunch-demo', '午餐到再統一轉帳給小美。', '12:10 到公司 6F 茶水間。', '{"restaurant":"港式燒臘便當","deliveryTime":"12:10"}'::jsonb, now()),
  ('44444444-4444-4444-8444-444444444003', '22222222-2222-4222-8222-222222222202', 'drink_order', :'seed_profile_id', NULL, '下午手搖飲', '15:00 前填完。店家：春日茶室。', 'open', '2026-06-29 15:00:00+08', 'pg-drink-demo', '飲料到再轉帳。', '16:00 前台自取。', '{"shop":"春日茶室","fields":["甜度","冰塊","加料"]}'::jsonb, now()),
  ('44444444-4444-4444-8444-444444444004', '22222222-2222-4222-8222-222222222203', 'activity', :'seed_profile_id', NULL, '週五下班 KTV', '先統計人數，滿 6 人就訂包廂。', 'open', '2026-07-03 18:00:00+08', 'pg-ktv-demo', '現場 AA，若需訂金再通知。', '地點：西門錢櫃或好樂迪，依投票結果。', '{"locationOptions":["西門錢櫃","西門好樂迪"],"deposit":0}'::jsonb, now()),
  ('44444444-4444-4444-8444-444444444005', '22222222-2222-4222-8222-222222222204', 'member_sale', :'seed_profile_id', '阿姨菜園 / 手作小安', '週末自種蔬菜與手作品', '圈內成員少量分享，先登記數量，採收或製作完成後通知付款取貨。', 'open', '2026-07-04 20:00:00+08', 'pg-market-demo', '確認有貨後再轉帳給販售者，管理者協助標記付款。', '週日傍晚公司門口或社區管理室面交。', '{"seller":"阿姨菜園 / 手作小安","visibility":"circle_only","fulfillment":"pickup"}'::jsonb, now()),
  ('44444444-4444-4444-8444-444444444006', '22222222-2222-4222-8222-222222222203', 'interest_check', :'seed_profile_id', NULL, '週末電影或免費票券意願調查', '朋友臨時有幾張電影票，先問圈內誰有興趣。人數夠再正式約時間或分配票券。', 'open', '2026-07-02 22:00:00+08', 'pg-interest-demo', '目前只是意願調查，暫不收款。', '若確定成行，會在公告中通知集合時間或取票方式。', '{"stage":"interest","examples":["看電影","吃飯","看球賽","免費票券"]}'::jsonb, now())
ON CONFLICT (id) DO UPDATE
SET template_id = EXCLUDED.template_id,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    status = EXCLUDED.status,
    deadline_at = EXCLUDED.deadline_at,
    share_token = EXCLUDED.share_token,
    payment_instructions = EXCLUDED.payment_instructions,
    pickup_instructions = EXCLUDED.pickup_instructions,
    seller_display_name = EXCLUDED.seller_display_name,
    metadata = EXCLUDED.metadata,
    opened_at = EXCLUDED.opened_at;

INSERT INTO task_options (id, task_id, title, subtitle, unit_price_cents, currency, max_quantity, sort_order, metadata)
VALUES
  ('55555555-5555-4555-8555-555555555001', '44444444-4444-4444-8444-444444444001', '耶加雪菲 G1', '中焙 · 200g', 48000, 'TWD', NULL, 1, '{"origin":"衣索比亞","flavor":"花香、柑橘、蜂蜜"}'::jsonb),
  ('55555555-5555-4555-8555-555555555002', '44444444-4444-4444-8444-444444444001', '哥倫比亞 水洗', '淺焙 · 200g', 48000, 'TWD', NULL, 2, '{"origin":"哥倫比亞","flavor":"莓果、焦糖"}'::jsonb),
  ('55555555-5555-4555-8555-555555555003', '44444444-4444-4444-8444-444444444001', '曼特寧 深焙', '深焙 · 200g', 52000, 'TWD', NULL, 3, '{"origin":"印尼","flavor":"堅果、黑巧克力"}'::jsonb),
  ('55555555-5555-4555-8555-555555555004', '44444444-4444-4444-8444-444444444002', '燒鴨飯', '可加飯、不加蔥', 12000, 'TWD', NULL, 1, '{}'::jsonb),
  ('55555555-5555-4555-8555-555555555005', '44444444-4444-4444-8444-444444444002', '油雞飯', '可加辣、可少飯', 11000, 'TWD', NULL, 2, '{}'::jsonb),
  ('55555555-5555-4555-8555-555555555006', '44444444-4444-4444-8444-444444444002', '叉燒飯', '可雙拼', 13000, 'TWD', NULL, 3, '{}'::jsonb),
  ('55555555-5555-4555-8555-555555555007', '44444444-4444-4444-8444-444444444003', '紅茶拿鐵', '大杯', 6500, 'TWD', NULL, 1, '{"sweetness":["無糖","微糖","半糖"],"ice":["去冰","少冰","正常"]}'::jsonb),
  ('55555555-5555-4555-8555-555555555008', '44444444-4444-4444-8444-444444444003', '四季春青茶', '大杯', 4500, 'TWD', NULL, 2, '{"sweetness":["無糖","微糖","半糖"],"ice":["去冰","少冰","正常"]}'::jsonb),
  ('55555555-5555-4555-8555-555555555009', '44444444-4444-4444-8444-444444444003', '葡萄柚綠', '大杯', 7000, 'TWD', NULL, 3, '{"sweetness":["微糖","半糖"],"ice":["少冰","正常"]}'::jsonb),
  ('55555555-5555-4555-8555-555555555010', '44444444-4444-4444-8444-444444444004', '我要參加', '19:30 後可到', 0, 'TWD', NULL, 1, '{}'::jsonb),
  ('55555555-5555-4555-8555-555555555011', '44444444-4444-4444-8444-444444444004', '先暫定', '晚點確認', 0, 'TWD', NULL, 2, '{}'::jsonb),
  ('55555555-5555-4555-8555-555555555012', '44444444-4444-4444-8444-444444444004', '這次不行', '下次再約', 0, 'TWD', NULL, 3, '{}'::jsonb),
  ('55555555-5555-4555-8555-555555555013', '44444444-4444-4444-8444-444444444005', '自種蔬菜箱', '當季葉菜、青椒、小黃瓜，約 3 斤', 25000, 'TWD', 12, 1, '{"inventory":12,"seller":"阿姨菜園"}'::jsonb),
  ('55555555-5555-4555-8555-555555555014', '44444444-4444-4444-8444-444444444005', '牛番茄', '一袋 2 斤', 18000, 'TWD', 10, 2, '{"inventory":10,"seller":"阿姨菜園"}'::jsonb),
  ('55555555-5555-4555-8555-555555555015', '44444444-4444-4444-8444-444444444005', '手作鳳梨果醬', '小瓶 180g', 16000, 'TWD', 8, 3, '{"inventory":8,"seller":"手作小安"}'::jsonb),
  ('55555555-5555-4555-8555-555555555016', '44444444-4444-4444-8444-444444444006', '我有興趣', '可備註人數、時間或偏好', 0, 'TWD', NULL, 1, '{"intent":"interested"}'::jsonb),
  ('55555555-5555-4555-8555-555555555017', '44444444-4444-4444-8444-444444444006', '想先保留名額', '票券、座位、餐廳人數可先估', 0, 'TWD', NULL, 2, '{"intent":"reserve"}'::jsonb),
  ('55555555-5555-4555-8555-555555555018', '44444444-4444-4444-8444-444444444006', '這次先不參加', '方便主揪估算比例', 0, 'TWD', NULL, 3, '{"intent":"not_this_time"}'::jsonb)
ON CONFLICT (id) DO UPDATE
SET title = EXCLUDED.title,
    subtitle = EXCLUDED.subtitle,
    unit_price_cents = EXCLUDED.unit_price_cents,
    currency = EXCLUDED.currency,
    max_quantity = EXCLUDED.max_quantity,
    sort_order = EXCLUDED.sort_order,
    metadata = EXCLUDED.metadata,
    is_active = true;

INSERT INTO responses (
  id,
  task_id,
  participant_name,
  participant_contact,
  note,
  total_amount_cents,
  currency,
  payment_status,
  fulfillment_status,
  rsvp_status,
  guest_count,
  metadata
)
VALUES
  ('66666666-6666-4666-8666-666666666001', '44444444-4444-4444-8444-444444444001', '王小明', '', '週末取貨', 96000, 'TWD', 'paid', 'picked_up', 'yes', 0, '{"source":"seed"}'::jsonb),
  ('66666666-6666-4666-8666-666666666002', '44444444-4444-4444-8444-444444444001', '林怡君', '', '末五碼 11235', 48000, 'TWD', 'review', 'pending', 'yes', 0, '{"source":"seed"}'::jsonb),
  ('66666666-6666-4666-8666-666666666003', '44444444-4444-4444-8444-444444444001', '張志豪', '', '', 48000, 'TWD', 'unpaid', 'pending', 'yes', 0, '{"source":"seed"}'::jsonb),
  ('66666666-6666-4666-8666-666666666004', '44444444-4444-4444-8444-444444444001', '陳雅婷', '', '請磨粉', 104000, 'TWD', 'paid', 'pending', 'yes', 0, '{"source":"seed"}'::jsonb),
  ('66666666-6666-4666-8666-666666666005', '44444444-4444-4444-8444-444444444002', '林小美', '', '不要蔥', 12000, 'TWD', 'paid', 'pending', 'yes', 0, '{"source":"seed"}'::jsonb),
  ('66666666-6666-4666-8666-666666666006', '44444444-4444-4444-8444-444444444002', '王大明', '', '加辣', 11000, 'TWD', 'unpaid', 'pending', 'yes', 0, '{"source":"seed"}'::jsonb),
  ('66666666-6666-4666-8666-666666666007', '44444444-4444-4444-8444-444444444002', '張小華', '', '飯少', 13000, 'TWD', 'paid', 'pending', 'yes', 0, '{"source":"seed"}'::jsonb),
  ('66666666-6666-4666-8666-666666666008', '44444444-4444-4444-8444-444444444003', 'Kevin', '', '微糖少冰', 6500, 'TWD', 'paid', 'pending', 'yes', 0, '{"source":"seed"}'::jsonb),
  ('66666666-6666-4666-8666-666666666009', '44444444-4444-4444-8444-444444444003', '怡君', '', '無糖去冰', 4500, 'TWD', 'unpaid', 'pending', 'yes', 0, '{"source":"seed"}'::jsonb),
  ('66666666-6666-4666-8666-666666666010', '44444444-4444-4444-8444-444444444004', '王小明', '', '可到 23:00', 0, 'TWD', 'not_required', 'attending', 'yes', 0, '{"source":"seed"}'::jsonb),
  ('66666666-6666-4666-8666-666666666011', '44444444-4444-4444-8444-444444444004', '林怡君', '', '要看加班', 0, 'TWD', 'not_required', 'maybe', 'maybe', 0, '{"source":"seed"}'::jsonb),
  ('66666666-6666-4666-8666-666666666012', '44444444-4444-4444-8444-444444444004', '張志豪', '', '想唱新歌', 0, 'TWD', 'not_required', 'attending', 'yes', 0, '{"source":"seed"}'::jsonb),
  ('66666666-6666-4666-8666-666666666013', '44444444-4444-4444-8444-444444444005', '林怡君', '', '若有多的小黃瓜也可以加', 25000, 'TWD', 'review', 'pending', 'yes', 0, '{"source":"seed"}'::jsonb),
  ('66666666-6666-4666-8666-666666666014', '44444444-4444-4444-8444-444444444005', '王小明', '', '週日可面交', 36000, 'TWD', 'unpaid', 'pending', 'yes', 0, '{"source":"seed"}'::jsonb),
  ('66666666-6666-4666-8666-666666666015', '44444444-4444-4444-8444-444444444005', 'Kevin', '', '先訂一瓶', 16000, 'TWD', 'paid', 'picked_up', 'yes', 0, '{"source":"seed"}'::jsonb),
  ('66666666-6666-4666-8666-666666666016', '44444444-4444-4444-8444-444444444006', '王小明', '', '週六晚上可以，兩個人', 0, 'TWD', 'not_required', 'attending', 'yes', 1, '{"source":"seed"}'::jsonb),
  ('66666666-6666-4666-8666-666666666017', '44444444-4444-4444-8444-444444444006', '林怡君', '', '若是 20:00 後我可以', 0, 'TWD', 'not_required', 'maybe', 'maybe', 0, '{"source":"seed"}'::jsonb),
  ('66666666-6666-4666-8666-666666666018', '44444444-4444-4444-8444-444444444006', '張志豪', '', '這週不行，下次再約', 0, 'TWD', 'not_required', 'pending', 'no', 0, '{"source":"seed"}'::jsonb)
ON CONFLICT (id) DO UPDATE
SET participant_name = EXCLUDED.participant_name,
    participant_contact = EXCLUDED.participant_contact,
    note = EXCLUDED.note,
    total_amount_cents = EXCLUDED.total_amount_cents,
    currency = EXCLUDED.currency,
    payment_status = EXCLUDED.payment_status,
    fulfillment_status = EXCLUDED.fulfillment_status,
    rsvp_status = EXCLUDED.rsvp_status,
    guest_count = EXCLUDED.guest_count,
    metadata = EXCLUDED.metadata,
    cancelled_at = NULL;

INSERT INTO response_items (id, response_id, option_id, quantity, unit_price_cents, currency, metadata)
VALUES
  ('77777777-7777-4777-8777-777777777001', '66666666-6666-4666-8666-666666666001', '55555555-5555-4555-8555-555555555001', 2, 48000, 'TWD', '{}'::jsonb),
  ('77777777-7777-4777-8777-777777777002', '66666666-6666-4666-8666-666666666002', '55555555-5555-4555-8555-555555555002', 1, 48000, 'TWD', '{}'::jsonb),
  ('77777777-7777-4777-8777-777777777003', '66666666-6666-4666-8666-666666666003', '55555555-5555-4555-8555-555555555001', 1, 48000, 'TWD', '{}'::jsonb),
  ('77777777-7777-4777-8777-777777777004', '66666666-6666-4666-8666-666666666004', '55555555-5555-4555-8555-555555555003', 2, 52000, 'TWD', '{}'::jsonb),
  ('77777777-7777-4777-8777-777777777005', '66666666-6666-4666-8666-666666666005', '55555555-5555-4555-8555-555555555004', 1, 12000, 'TWD', '{}'::jsonb),
  ('77777777-7777-4777-8777-777777777006', '66666666-6666-4666-8666-666666666006', '55555555-5555-4555-8555-555555555005', 1, 11000, 'TWD', '{}'::jsonb),
  ('77777777-7777-4777-8777-777777777007', '66666666-6666-4666-8666-666666666007', '55555555-5555-4555-8555-555555555006', 1, 13000, 'TWD', '{}'::jsonb),
  ('77777777-7777-4777-8777-777777777008', '66666666-6666-4666-8666-666666666008', '55555555-5555-4555-8555-555555555007', 1, 6500, 'TWD', '{}'::jsonb),
  ('77777777-7777-4777-8777-777777777009', '66666666-6666-4666-8666-666666666009', '55555555-5555-4555-8555-555555555008', 1, 4500, 'TWD', '{}'::jsonb),
  ('77777777-7777-4777-8777-777777777010', '66666666-6666-4666-8666-666666666010', '55555555-5555-4555-8555-555555555010', 1, 0, 'TWD', '{}'::jsonb),
  ('77777777-7777-4777-8777-777777777011', '66666666-6666-4666-8666-666666666011', '55555555-5555-4555-8555-555555555011', 1, 0, 'TWD', '{}'::jsonb),
  ('77777777-7777-4777-8777-777777777012', '66666666-6666-4666-8666-666666666012', '55555555-5555-4555-8555-555555555010', 1, 0, 'TWD', '{}'::jsonb),
  ('77777777-7777-4777-8777-777777777013', '66666666-6666-4666-8666-666666666013', '55555555-5555-4555-8555-555555555013', 1, 25000, 'TWD', '{}'::jsonb),
  ('77777777-7777-4777-8777-777777777014', '66666666-6666-4666-8666-666666666014', '55555555-5555-4555-8555-555555555014', 2, 18000, 'TWD', '{}'::jsonb),
  ('77777777-7777-4777-8777-777777777015', '66666666-6666-4666-8666-666666666015', '55555555-5555-4555-8555-555555555015', 1, 16000, 'TWD', '{}'::jsonb),
  ('77777777-7777-4777-8777-777777777016', '66666666-6666-4666-8666-666666666016', '55555555-5555-4555-8555-555555555016', 2, 0, 'TWD', '{}'::jsonb),
  ('77777777-7777-4777-8777-777777777017', '66666666-6666-4666-8666-666666666017', '55555555-5555-4555-8555-555555555017', 1, 0, 'TWD', '{}'::jsonb),
  ('77777777-7777-4777-8777-777777777018', '66666666-6666-4666-8666-666666666018', '55555555-5555-4555-8555-555555555018', 1, 0, 'TWD', '{}'::jsonb)
ON CONFLICT (id) DO UPDATE
SET option_id = EXCLUDED.option_id,
    quantity = EXCLUDED.quantity,
    unit_price_cents = EXCLUDED.unit_price_cents,
    currency = EXCLUDED.currency,
    metadata = EXCLUDED.metadata;

INSERT INTO announcements (
  id,
  circle_id,
  task_id,
  author_profile_id,
  title,
  body,
  priority,
  requires_confirmation,
  pinned_at,
  published_at
)
VALUES
  (
    '88888888-8888-4888-8888-888888888001',
    '22222222-2222-4222-8222-222222222202',
    '44444444-4444-4444-8444-444444444003',
    :'seed_profile_id',
    '飲料到前提醒',
    '15:00 準時結單，飲料到公司前台後會再通知大家自取。',
    'important',
    false,
    now(),
    now()
  )
ON CONFLICT (id) DO UPDATE
SET title = EXCLUDED.title,
    body = EXCLUDED.body,
    priority = EXCLUDED.priority,
    requires_confirmation = EXCLUDED.requires_confirmation,
    pinned_at = EXCLUDED.pinned_at,
    published_at = EXCLUDED.published_at,
    deleted_at = NULL;

INSERT INTO task_comments (
  id,
  task_id,
  participant_name,
  body,
  metadata
)
VALUES
  (
    '99999999-9999-4999-8999-999999999001',
    '44444444-4444-4444-8444-444444444003',
    '怡君',
    '我可以改成無糖去冰嗎？',
    '{"source":"seed"}'::jsonb
  )
ON CONFLICT (id) DO UPDATE
SET participant_name = EXCLUDED.participant_name,
    body = EXCLUDED.body,
    metadata = EXCLUDED.metadata,
    deleted_at = NULL;

COMMIT;
