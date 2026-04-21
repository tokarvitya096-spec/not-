import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import { MongoClient } from "mongodb";

dotenv.config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const client = new MongoClient(process.env.MONGO_URL);
await client.connect();

const db = client.db("game");
const users = db.collection("users");

// ===== MENU =====
function menu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "⛏ Farm", callback_data: "farm" },
          { text: "💼 Work", callback_data: "work" }
        ],
        [
          { text: "⚔ Battle", callback_data: "battle" },
          { text: "📦 Case", callback_data: "case" }
        ],
        [
          { text: "🛒 Shop", callback_data: "shop" },
          { text: "💰 Balance", callback_data: "balance" }
        ]
      ]
    }
  };
}

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
      inventory: [],
      vip: false
    };
    await users.insertOne(u);
  }

  return u;
}

const level = (xp) => Math.floor(xp / 100) + 1;

// ===== START =====
bot.onText(/\/start/, async (msg) => {
  await getUser(msg.chat.id, msg.from.username);

  bot.sendMessage(msg.chat.id, "🎮 GAME STARTED", menu());
});

// ===== CALLBACK =====
bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  let u = await getUser(chatId, q.from.username);

  let text = "";

  // ===== FARM =====
  if (q.data === "farm") {
    let gain = Math.floor(Math.random() * 10) + 1;

    if (u.vip) gain *= 2;

    u.coins += gain;
    u.xp += 5;
    u.level = level(u.xp);

    text = `⛏ +${gain} coins`;
  }

  // ===== WORK =====
  if (q.data === "work") {
    let reward = Math.random() < 0.7 ? 5 : Math.random() < 0.95 ? 20 : 100;

    if (u.vip) reward *= 2;

    u.coins += reward;
    u.xp += 10;
    u.level = level(u.xp);

    text = `💼 +${reward}`;
  }

  // ===== BALANCE =====
  if (q.data === "balance") {
    text = `💰 ${u.coins}
💎 ${u.gems}
⭐ XP ${u.xp}
📊 LVL ${u.level}
👑 VIP: ${u.vip ? "YES" : "NO"}`;
  }

  // ===== CASE =====
  if (q.data === "case") {
    const cost = 20;
    if (u.coins < cost) {
      text = "❌ no coins";
    } else {
      u.coins -= cost;

      const roll = Math.random();
      let reward = roll < 0.6 ? 10 : roll < 0.9 ? 30 : 100;

      u.coins += reward;
      u.xp += 15;

      text = `📦 case +${reward}`;
    }
  }

  // ===== BATTLE =====
  if (q.data === "battle") {
    const all = await users.find().toArray();
    const enemy = all[Math.floor(Math.random() * all.length)];

    if (!enemy || enemy.chatId === u.chatId) {
      text = "no enemy";
    } else {
      const win =
        Math.random() * u.level > Math.random() * enemy.level;

      if (win) {
        u.coins += 30;
        text = `⚔ WIN vs ${enemy.username}`;
      } else {
        text = `💀 LOSE vs ${enemy.username}`;
      }
    }
  }

  // ===== SHOP =====
  if (q.data === "shop") {
    text = `🛒 SHOP:

1️⃣ VIP (100 coins)
→ x2 farm + work

2️⃣ 50 gems (200 coins)

3️⃣ Sword (+10 power)

Use:
buy_vip / buy_gems / buy_sword`;
  }

  // ===== BUY VIP =====
  if (q.data === "buy_vip") {
    if (u.coins >= 100) {
      u.coins -= 100;
      u.vip = true;
      text = "👑 VIP activated!";
    } else text = "❌ no coins";
  }

  await users.updateOne({ chatId }, { $set: u });

  bot.answerCallbackQuery(q.id);
  bot.sendMessage(chatId, text, menu());
});

console.log("🚀 LEVEL 2 GAME BOT RUNNING");
