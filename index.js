import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import { MongoClient } from "mongodb";

dotenv.config();

// ===== BOT =====
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// ===== DB =====
const client = new MongoClient(process.env.MONGO_URL);
await client.connect();

const db = client.db("game");
const users = db.collection("users");

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
        [
          { text: "⛏ Farm", callback_data: "farm" },
          { text: "💼 Work", callback_data: "work" }
        ],
        [
          { text: "⚔ Battle", callback_data: "battle" },
          { text: "📦 Case", callback_data: "case" }
        ],
        [
          { text: "💰 Balance", callback_data: "balance" }
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

  let text = "";

  // ===== FARM =====
  if (q.data === "farm") {
    let gain = Math.floor(Math.random() * 10) + 1;
    if (u.vip) gain *= 2;

    u.coins += gain;
    u.xp += 5;
    u.level = level(u.xp);

    text = `⛏ Farm...\n+${gain} coins`;

    await users.updateOne({ chatId }, { $set: u });

    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId
    });

    return setTimeout(() => {
      bot.editMessageText("🎮 MENU", {
        chat_id: chatId,
        message_id: messageId,
        ...menu()
      });
    }, 1200);
  }

  // ===== WORK =====
  if (q.data === "work") {
    let reward = Math.random() < 0.7 ? 5 : Math.random() < 0.95 ? 20 : 100;
    if (u.vip) reward *= 2;

    u.coins += reward;
    u.xp += 10;
    u.level = level(u.xp);

    text = `💼 Work...\n+${reward} coins`;

    await users.updateOne({ chatId }, { $set: u });

    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId
    });

    return setTimeout(() => {
      bot.editMessageText("🎮 MENU", {
        chat_id: chatId,
        message_id: messageId,
        ...menu()
      });
    }, 1200);
  }

  // ===== BALANCE =====
  if (q.data === "balance") {
    text = `💰 Coins: ${u.coins}
💎 Gems: ${u.gems}
⭐ XP: ${u.xp}
📊 Level: ${u.level}
👑 VIP: ${u.vip ? "YES" : "NO"}
🏆 Wins: ${u.wins}`;

    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      ...menu()
    });
  }

  // ===== CASE =====
  if (q.data === "case") {
    const cost = 20;

    if (u.coins < cost) {
      text = "❌ Not enough coins";
    } else {
      u.coins -= cost;

      const roll = Math.random();
      const reward = roll < 0.6 ? 10 : roll < 0.9 ? 30 : 100;

      u.coins += reward;
      u.xp += 15;

      text = `📦 Case opened!\n+${reward}`;
    }

    await users.updateOne({ chatId }, { $set: u });

    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId
    });

    return setTimeout(() => {
      bot.editMessageText("🎮 MENU", {
        chat_id: chatId,
        message_id: messageId,
        ...menu()
      });
    }, 1200);
  }

  // ===== BATTLE =====
  if (q.data === "battle") {
    const all = await users.find().toArray();
    const enemy = all[Math.floor(Math.random() * all.length)];

    if (!enemy || enemy.chatId === u.chatId) {
      text = "❌ No enemy found";
    } else {
      const win =
        Math.random() * u.level > Math.random() * enemy.level;

      if (win) {
        u.coins += 30;
        u.wins += 1;
        text = `⚔ WIN vs ${enemy.username}`;
      } else {
        text = `💀 LOSE vs ${enemy.username}`;
      }
    }

    await users.updateOne({ chatId }, { $set: u });

    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId
    });

    return setTimeout(() => {
      bot.editMessageText("🎮 MENU", {
        chat_id: chatId,
        message_id: messageId,
        ...menu()
      });
    }, 1200);
  }

  bot.answerCallbackQuery(q.id);
});

console.log("🚀 FULL GAME BOT RUNNING");
