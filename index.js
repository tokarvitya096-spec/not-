import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import { MongoClient } from "mongodb";

dotenv.config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

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
      xp: 0,
      level: 1,
      lastFarm: 0,
      lastCase: 0
    };

    await users.insertOne(u);
  }

  return u;
}

// ===== MENU =====
function mainMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🏠 HOME", callback_data: "home" }],
        [
          { text: "⛏ FARM", callback_data: "tab_farm" },
          { text: "💼 WORK", callback_data: "tab_work" }
        ],
        [
          { text: "📦 CASE", callback_data: "tab_case" },
          { text: "👤 PROFILE", callback_data: "tab_profile" }
        ]
      ]
    }
  };
}

// ===== START =====
bot.onText(/\/start/, async (msg) => {
  await getUser(msg.chat.id, msg.from.username);
  bot.sendMessage(msg.chat.id, "🎮 GAME READY", mainMenu());
});

// ===== CALLBACK =====
bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const messageId = q.message.message_id;

  const u = await getUser(chatId, q.from.username);
  const now = Date.now();

  bot.answerCallbackQuery(q.id).catch(() => {});

  // ================= HOME
  if (q.data === "home") {
    return bot.editMessageText("🏠 MAIN MENU", {
      chat_id: chatId,
      message_id: messageId,
      ...mainMenu()
    });
  }

  // ================= FARM TAB
  if (q.data === "tab_farm") {
    return bot.editMessageText("⛏ FARM TAB", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: "⛏ FARM NOW", callback_data: "farm" }],
          [{ text: "⬅ BACK", callback_data: "home" }]
        ]
      }
    });
  }

  // ================= FARM (6h)
  if (q.data === "farm") {
    const cd = 6 * 60 * 60 * 1000;

    if (u.lastFarm && now - u.lastFarm < cd) {
      const h = Math.ceil((cd - (now - u.lastFarm)) / 3600000);

      return bot.editMessageText(`⛏ cooldown ${h}h`, {
        chat_id: chatId,
        message_id: messageId,
        ...mainMenu()
      });
    }

    const gain = Math.floor(Math.random() * 10) + 5;

    u.coins += gain;
    u.xp += 5;
    u.level = level(u.xp);
    u.lastFarm = now;

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(`⛏ +${gain} coins`, {
      chat_id: chatId,
      message_id: messageId,
      ...mainMenu()
    });
  }

  // ================= WORK TAB
  if (q.data === "tab_work") {
    return bot.editMessageText("💼 WORK TAB", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: "💼 WORK NOW", callback_data: "work" }],
          [{ text: "⬅ BACK", callback_data: "home" }]
        ]
      }
    });
  }

  // ================= WORK
  if (q.data === "work") {
    const reward =
      Math.random() < 0.7 ? 5 :
      Math.random() < 0.95 ? 20 : 50;

    u.coins += reward;
    u.xp += 10;
    u.level = level(u.xp);

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(`💼 +${reward} coins`, {
      chat_id: chatId,
      message_id: messageId,
      ...mainMenu()
    });
  }

  // ================= CASE TAB
  if (q.data === "tab_case") {
    return bot.editMessageText("📦 CASE TAB", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: "📦 OPEN CASE", callback_data: "case" }],
          [{ text: "⬅ BACK", callback_data: "home" }]
        ]
      }
    });
  }

  // ================= CASE (24h)
  if (q.data === "case") {
    const cd = 24 * 60 * 60 * 1000;

    if (u.lastCase && now - u.lastCase < cd) {
      const h = Math.ceil((cd - (now - u.lastCase)) / 3600000);

      return bot.editMessageText(`📦 cooldown ${h}h`, {
        chat_id: chatId,
        message_id: messageId,
        ...mainMenu()
      });
    }

    const reward = Math.random() < 0.6 ? 10 : 30;

    u.coins += reward;
    u.lastCase = now;

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(`📦 +${reward} coins`, {
      chat_id: chatId,
      message_id: messageId,
      ...mainMenu()
    });
  }

  // ================= PROFILE TAB
  if (q.data === "tab_profile") {
    return bot.editMessageText(
`👤 PROFILE

💰 ${u.coins}
⭐ XP ${u.xp}
📊 LVL ${u.level}`,
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
});

console.log("🚀 CLEAN GAME RUNNING");
