import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import { MongoClient } from "mongodb";

dotenv.config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const client = new MongoClient(process.env.MONGO_URL);
await client.connect();

const db = client.db("game");
const users = db.collection("users");

// ===== SYSTEMS =====
const battles = new Map();

// ===== LEVEL =====
const level = (xp) => Math.floor(xp / 100) + 1;

// ===== USER =====
async function getUser(chatId, username) {
  let u = await users.findOne({ chatId });

  if (!u) {
    u = {
      chatId,
      username: username || "player",
      coins: 0,
      gems: 0,
      xp: 0,
      level: 1,
      wins: 0,
      vip: false,
      lastFarm: 0,
      lastCase: 0
    };

    await users.insertOne(u);
  }

  return u;
}

// ===== MENU =====
function menu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🏠 HOME", callback_data: "home" }],
        [
          { text: "⛏ FARM", callback_data: "tab_farm" },
          { text: "⚔ BATTLE", callback_data: "tab_battle" }
        ],
        [
          { text: "📦 CASE", callback_data: "tab_case" },
          { text: "💰 PROFILE", callback_data: "tab_profile" }
        ]
      ]
    }
  };
}

// ===== START =====
bot.onText(/\/start/, async (msg) => {
  await getUser(msg.chat.id, msg.from.username);
  bot.sendMessage(msg.chat.id, "🎮 GAME READY", menu());
});

// ===== CALLBACK =====
bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const messageId = q.message.message_id;

  const u = await getUser(chatId, q.from.username);
  const now = Date.now();

  // ⚡ ALWAYS FAST ACK (fix lag)
  bot.answerCallbackQuery(q.id).catch(() => {});

  // ================= HOME
  if (q.data === "home") {
    return bot.editMessageText("🏠 MENU", {
      chat_id: chatId,
      message_id: messageId,
      ...menu()
    });
  }

  // ================= FARM TAB
  if (q.data === "tab_farm") {
    return bot.editMessageText("⛏ FARM TAB", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: "⛏ FARM", callback_data: "farm" }],
          [{ text: "⬅ BACK", callback_data: "home" }]
        ]
      }
    });
  }

  // ================= FARM
  if (q.data === "farm") {
    const cd = 6 * 60 * 60 * 1000;

    if (u.lastFarm && now - u.lastFarm < cd) {
      const h = Math.ceil((cd - (now - u.lastFarm)) / 3600000);

      return bot.editMessageText(`⛏ cooldown ${h}h`, {
        chat_id: chatId,
        message_id: messageId,
        ...menu()
      });
    }

    const gain = Math.floor(Math.random() * 10) + 5;

    u.coins += gain;
    u.xp += 5;
    u.level = level(u.xp);
    u.lastFarm = now;

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(`⛏ +${gain}`, {
      chat_id: chatId,
      message_id: messageId,
      ...menu()
    });
  }

  // ================= CASE TAB
  if (q.data === "tab_case") {
    return bot.editMessageText("📦 CASE TAB", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: "📦 OPEN", callback_data: "case" }],
          [{ text: "⬅ BACK", callback_data: "home" }]
        ]
      }
    });
  }

  // ================= CASE
  if (q.data === "case") {
    const cd = 24 * 60 * 60 * 1000;

    if (u.lastCase && now - u.lastCase < cd) {
      const h = Math.ceil((cd - (now - u.lastCase)) / 3600000);

      return bot.editMessageText(`📦 cooldown ${h}h`, {
        chat_id: chatId,
        message_id: messageId,
        ...menu()
      });
    }

    const reward = Math.random() < 0.6 ? 10 : 30;

    u.coins += reward;
    u.lastCase = now;

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(`📦 +${reward}`, {
      chat_id: chatId,
      message_id: messageId,
      ...menu()
    });
  }

  // ================= PROFILE
  if (q.data === "tab_profile") {
    return bot.editMessageText(
`👤 PROFILE
💰 ${u.coins}
⭐ XP ${u.xp}
📊 LVL ${u.level}
🏆 WINS ${u.wins}`,
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: "⬅ BACK", callback_data: "home" }]
          ]
        }
      }
    );
  }

  // ================= BATTLE TAB
  if (q.data === "tab_battle") {
    const all = await users.find().toArray();

    const list = all
      .filter(x => x.chatId !== chatId)
      .map(op => [
        { text: `⚔ ${op.username}`, callback_data: `pvp_${op.chatId}` }
      ]);

    return bot.editMessageText("⚔ SELECT PLAYER", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          ...list,
          [{ text: "⬅ BACK", callback_data: "home" }]
        ]
      }
    });
  }

  // ================= PVP REQUEST
  if (q.data.startsWith("pvp_")) {
    const enemyId = Number(q.data.split("_")[1]);
    const battleId = `${chatId}_${enemyId}`;

    battles.set(battleId, {
      p1: chatId,
      p2: enemyId,
      p1Score: 0,
      p2Score: 0,
      round: 1,
      answered: new Set()
    });

    await bot.sendMessage(enemyId, `⚔ Battle request`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ ACCEPT", callback_data: `accept_${battleId}` },
            { text: "❌ DECLINE", callback_data: `decline_${battleId}` }
          ]
        ]
      }
    });

    return bot.editMessageText("📩 sent", {
      chat_id: chatId,
      message_id: messageId,
      ...menu()
    });
  }

  // ================= ACCEPT
  if (q.data.startsWith("accept_")) {
    const battleId = q.data.replace("accept_", "");
    startRound(battleId);
  }

  // ================= DECLINE
  if (q.data.startsWith("decline_")) {
    const battleId = q.data.replace("decline_", "");
    const b = battles.get(battleId);

    await bot.sendMessage(b.p1, "❌ declined");
    battles.delete(battleId);
  }

  // ================= ACTIONS (FAST FIXED)
  if (q.data.startsWith("atk_") || q.data.startsWith("def_")) {
    const [type, battleId] = q.data.split("_");
    const b = battles.get(battleId);

    if (!b) return;

    const isP1 = chatId === b.p1;

    const dmg =
      type === "atk"
        ? Math.floor(Math.random() * 10) + 5
        : Math.floor(Math.random() * 4);

    if (isP1) b.p1Score += dmg;
    else b.p2Score += dmg;

    b.answered.add(chatId);

    if (b.answered.size < 2) return;

    b.answered.clear();
    b.round++;

    if (b.round > 3) {
      const p1 = await users.findOne({ chatId: b.p1 });
      const p2 = await users.findOne({ chatId: b.p2 });

      let res = `⚔ RESULT\n${p1.username}: ${b.p1Score}\n${p2.username}: ${b.p2Score}`;

      if (b.p1Score > b.p2Score) {
        res += `\n🏆 ${p1.username}`;
        await users.updateOne({ chatId: b.p1 }, { $inc: { coins: 30, wins: 1 } });
      } else {
        res += `\n🏆 ${p2.username}`;
        await users.updateOne({ chatId: b.p2 }, { $inc: { coins: 30, wins: 1 } });
      }

      battles.delete(battleId);

      await bot.sendMessage(b.p1, res, menu());
      await bot.sendMessage(b.p2, res, menu());
      return;
    }

    startRound(battleId);
  }
});

// ===== ROUND =====
async function startRound(battleId) {
  const b = battles.get(battleId);

  const msg = `⚔ ROUND ${b.round}/3`;

  const kb = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "⚔ ATTACK", callback_data: `atk_${battleId}` },
          { text: "🛡 DEFEND", callback_data: `def_${battleId}` }
        ]
      ]
    }
  };

  await bot.sendMessage(b.p1, msg, kb);
  await bot.sendMessage(b.p2, msg, kb);
}

console.log("🚀 FAST GAME RUNNING");
