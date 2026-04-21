import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import { MongoClient } from "mongodb";

dotenv.config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const client = new MongoClient(process.env.MONGO_URL);
await client.connect();

const db = client.db("game");
const users = db.collection("users");

// ===== PVP REQUESTS =====
const pendingBattles = new Map();

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
      vip: false,
      wins: 0,
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
        [
          { text: "⛏ FARM", callback_data: "farm" },
          { text: "💼 WORK", callback_data: "work" }
        ],
        [
          { text: "⚔ BATTLE", callback_data: "battle" },
          { text: "📦 CASE", callback_data: "case" }
        ],
        [
          { text: "💰 BALANCE", callback_data: "balance" }
        ],
        [
          { text: "⬅ BACK", callback_data: "back" }
        ]
      ]
    }
  };
}

// ===== START =====
bot.onText(/\/start/, async (msg) => {
  await getUser(msg.chat.id, msg.from.username);

  bot.sendMessage(msg.chat.id, "🎮 GAME STARTED", menu());
});

// ===== CALLBACK =====
bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const messageId = q.message.message_id;

  let u = await getUser(chatId, q.from.username);
  const now = Date.now();

  // ================= FARM (6h)
  if (q.data === "farm") {
    const cd = 6 * 60 * 60 * 1000;

    if (u.lastFarm && now - u.lastFarm < cd) {
      const h = Math.ceil((cd - (now - u.lastFarm)) / 3600000);

      return bot.editMessageText(`⛏ FARM cooldown: ${h}h`, {
        chat_id: chatId,
        message_id: messageId,
        ...menu()
      });
    }

    let gain = Math.floor(Math.random() * 10) + 5;
    if (u.vip) gain *= 2;

    u.coins += gain;
    u.xp += 5;
    u.level = level(u.xp);
    u.lastFarm = now;

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(`⛏ FARM +${gain}`, {
      chat_id: chatId,
      message_id: messageId,
      ...menu()
    });
  }

  // ================= WORK
  if (q.data === "work") {
    let reward = Math.random() < 0.7 ? 5 : Math.random() < 0.95 ? 20 : 100;
    if (u.vip) reward *= 2;

    u.coins += reward;
    u.xp += 10;
    u.level = level(u.xp);

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(`💼 WORK +${reward}`, {
      chat_id: chatId,
      message_id: messageId,
      ...menu()
    });
  }

  // ================= BALANCE
  if (q.data === "balance") {
    return bot.editMessageText(
`💰 ${u.coins}
💎 ${u.gems}
⭐ XP ${u.xp}
📊 LVL ${u.level}
👑 VIP ${u.vip ? "YES" : "NO"}
🏆 WINS ${u.wins}`,
      {
        chat_id: chatId,
        message_id: messageId,
        ...menu()
      }
    );
  }

  // ================= CASE (24h)
  if (q.data === "case") {
    const cd = 24 * 60 * 60 * 1000;

    if (u.lastCase && now - u.lastCase < cd) {
      const h = Math.ceil((cd - (now - u.lastCase)) / 3600000);

      return bot.editMessageText(`📦 CASE cooldown: ${h}h`, {
        chat_id: chatId,
        message_id: messageId,
        ...menu()
      });
    }

    if (u.coins < 20) {
      return bot.editMessageText("❌ Not enough coins", {
        chat_id: chatId,
        message_id: messageId,
        ...menu()
      });
    }

    u.coins -= 20;

    const reward = Math.random() < 0.6 ? 10 : Math.random() < 0.9 ? 30 : 100;

    u.coins += reward;
    u.xp += 15;
    u.lastCase = now;

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(`📦 CASE +${reward}`, {
      chat_id: chatId,
      message_id: messageId,
      ...menu()
    });
  }

  // ================= BATTLE MENU (select player)
  if (q.data === "battle") {
    const all = await users.find().toArray();

    let keyboard = [];

    all.forEach(op => {
      if (op.chatId !== u.chatId) {
        keyboard.push([
          {
            text: `⚔ ${op.username}`,
            callback_data: `pvp_${op.chatId}`
          }
        ]);
      }
    });

    return bot.editMessageText("⚔ Choose opponent:", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          ...keyboard,
          [{ text: "⬅ BACK", callback_data: "back" }]
        ]
      }
    });
  }

  // ================= SEND REQUEST
  if (q.data.startsWith("pvp_")) {
    const enemyId = Number(q.data.split("_")[1]);

    pendingBattles.set(enemyId, chatId);

    await bot.sendMessage(
      enemyId,
      `⚔ Battle request from ${u.username}`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ ACCEPT", callback_data: `accept_${chatId}` },
              { text: "❌ DECLINE", callback_data: `decline_${chatId}` }
            ]
          ]
        }
      }
    );

    return bot.editMessageText("📩 Request sent", {
      chat_id: chatId,
      message_id: messageId,
      ...menu()
    });
  }

  // ================= ACCEPT BATTLE
  if (q.data.startsWith("accept_")) {
    const attackerId = Number(q.data.split("_")[1]);

    const attacker = await users.findOne({ chatId: attackerId });

    if (!attacker) return;

    let myHP = u.level * 10;
    let enemyHP = attacker.level * 10;

    let log = `⚔ PvP\n${attacker.username} vs ${u.username}\n\n`;

    while (myHP > 0 && enemyHP > 0) {
      const aHit = Math.floor(Math.random() * 10 + attacker.level);
      const dHit = Math.floor(Math.random() * 10 + u.level);

      enemyHP -= aHit;
      myHP -= dHit;

      log += `${attacker.username} -${aHit} | You -${dHit}\n`;
    }

    if (myHP > enemyHP) {
      u.coins += 30;
      u.wins += 1;
      log += "\n🏆 YOU WIN";
    } else {
      log += "\n💀 YOU LOSE";
    }

    await users.updateOne({ chatId }, { $set: u });

    pendingBattles.delete(chatId);

    return bot.editMessageText(log, {
      chat_id: chatId,
      message_id: messageId,
      ...menu()
    });
  }

  // ================= DECLINE
  if (q.data.startsWith("decline_")) {
    const attackerId = Number(q.data.split("_")[1]);

    pendingBattles.delete(chatId);

    await bot.sendMessage(attackerId, "❌ Battle declined");

    return bot.editMessageText("❌ Declined", {
      chat_id: chatId,
      message_id: messageId,
      ...menu()
    });
  }

  // ================= BACK
  if (q.data === "back") {
    return bot.editMessageText("🎮 MENU", {
      chat_id: chatId,
      message_id: messageId,
      ...menu()
    });
  }

  bot.answerCallbackQuery(q.id);
});

console.log("🚀 FULL PVP GAME RUNNING");
