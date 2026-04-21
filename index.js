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
      xp: 0,
      level: 1,
      wins: 0
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
          { text: "⚔ BATTLE", callback_data: "tab_battle" }
        ]
      ]
    }
  };
}

// ===== START =====
bot.onText(/\/start/, async (msg) => {
  await getUser(msg.chat.id, msg.from.username);
  bot.sendMessage(msg.chat.id, "🎮 READY", menu());
});

// ===== CALLBACK =====
bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const messageId = q.message.message_id;

  const u = await getUser(chatId, q.from.username);

  bot.answerCallbackQuery(q.id).catch(() => {});

  // ================= BATTLE MENU
  if (q.data === "tab_battle") {
    const all = await users.find().toArray();

    const list = all
      .filter(x => x.chatId !== chatId)
      .map(op => [
        { text: `⚔ ${op.username}`, callback_data: `pvp_${op.chatId}` }
      ]);

    return bot.editMessageText("⚔ SELECT OPPONENT", {
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

  // ================= START PVP
  if (q.data.startsWith("pvp_")) {
    const enemyId = Number(q.data.split("_")[1]);
    const battleId = `${chatId}_${enemyId}`;

    battles.set(battleId, {
      p1: chatId,
      p2: enemyId,
      round: 1,
      p1Score: 0,
      p2Score: 0,
      action: {}
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

    return bot.editMessageText("📩 SENT", {
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

    if (!b) return;

    await bot.sendMessage(b.p1, "❌ declined");
    battles.delete(battleId);
  }

  // ================= ACTIONS (IMPORTANT FIX)
  if (q.data.startsWith("atk_") || q.data.startsWith("def_")) {
    const [type, battleId] = q.data.split("_");
    const b = battles.get(battleId);

    if (!b) return;

    const isP1 = chatId === b.p1;

    // save action instantly
    b.action[chatId] = type;

    // WAIT BOTH PLAYERS
    if (!b.action[b.p1] || !b.action[b.p2]) return;

    // calculate round
    const p1Type = b.action[b.p1];
    const p2Type = b.action[b.p2];

    const calc = (type) =>
      type === "atk"
        ? Math.floor(Math.random() * 10) + 5
        : Math.floor(Math.random() * 4);

    const p1Gain = calc(p1Type);
    const p2Gain = calc(p2Type);

    b.p1Score += p1Gain;
    b.p2Score += p2Gain;

    b.action = {}; // reset for next round
    b.round++;

    // ROUND FLOW FIX: instantly continue
    if (b.round <= 3) {
      return startRound(battleId);
    }

    // FINISH
    finishBattle(battleId);
  }
});

// ===== ROUND START =====
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

// ===== FINISH =====
async function finishBattle(battleId) {
  const b = battles.get(battleId);

  const p1 = await users.findOne({ chatId: b.p1 });
  const p2 = await users.findOne({ chatId: b.p2 });

  let res = `⚔ FINISH\n\n${p1.username}: ${b.p1Score}\n${p2.username}: ${b.p2Score}\n\n`;

  if (b.p1Score > b.p2Score) {
    res += `🏆 ${p1.username} WIN`;
    await users.updateOne({ chatId: b.p1 }, { $inc: { coins: 30, wins: 1 } });
  } else {
    res += `🏆 ${p2.username} WIN`;
    await users.updateOne({ chatId: b.p2 }, { $inc: { coins: 30, wins: 1 } });
  }

  battles.delete(battleId);

  await bot.sendMessage(b.p1, res, menu());
  await bot.sendMessage(b.p2, res, menu());
}

console.log("🚀 FAST ROUND GAME READY");
