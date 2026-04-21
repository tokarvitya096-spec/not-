import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import { MongoClient } from "mongodb";

dotenv.config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const client = new MongoClient(process.env.MONGO_URL);
await client.connect();

const db = client.db("game");
const users = db.collection("users");

// ===== CONFIG =====
const CHANNEL = "PVEmpire1";

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
      lastWork: 0,
      lastCase: 0,
      tasks: {
        sub: false
      }
    };

    await users.insertOne(u);
  }

  // FIX OLD USERS
  if (!u.tasks) {
    u.tasks = { sub: false };
    await users.updateOne({ chatId }, { $set: { tasks: u.tasks } });
  }

  return u;
}

// ===== LEVEL =====
const level = (xp) => Math.floor(xp / 100) + 1;

// ===== MENU =====
function menu() {
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
          { text: "📜 TASKS", callback_data: "tab_tasks" }
        ],
        [
          { text: "👤 PROFILE", callback_data: "tab_profile" }
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

  const u = await getUser(chatId, q.from.username);
  const now = Date.now();

  bot.answerCallbackQuery(q.id).catch(() => {});

  // ================= HOME
  if (q.data === "home") {
    return bot.editMessageText("🏠 MAIN MENU", {
      chat_id: chatId,
      message_id: messageId,
      ...menu()
    });
  }

  // ================= FARM TAB
  if (q.data === "tab_farm") {
    return bot.editMessageText("⛏ FARM", {
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

  // ================= WORK TAB
  if (q.data === "tab_work") {
    return bot.editMessageText("💼 WORK", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: "💼 WORK", callback_data: "work" }],
          [{ text: "⬅ BACK", callback_data: "home" }]
        ]
      }
    });
  }

  // ================= WORK
  if (q.data === "work") {
    const cd = 3 * 60 * 60 * 1000;

    if (u.lastWork && now - u.lastWork < cd) {
      const h = Math.ceil((cd - (now - u.lastWork)) / 3600000);

      return bot.editMessageText(`💼 cooldown ${h}h`, {
        chat_id: chatId,
        message_id: messageId,
        ...menu()
      });
    }

    const reward =
      Math.random() < 0.7 ? 10 :
      Math.random() < 0.95 ? 25 : 50;

    u.coins += reward;
    u.xp += 8;
    u.level = level(u.xp);
    u.lastWork = now;

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(`💼 +${reward}`, {
      chat_id: chatId,
      message_id: messageId,
      ...menu()
    });
  }

  // ================= CASE TAB
  if (q.data === "tab_case") {
    return bot.editMessageText("📦 CASE", {
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

    const reward = Math.random() < 0.7 ? 15 : 40;

    u.coins += reward;
    u.lastCase = now;

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(`📦 +${reward}`, {
      chat_id: chatId,
      message_id: messageId,
      ...menu()
    });
  }

  // ================= TASKS (AUTO CHECK)
  if (q.data === "tab_tasks") {
    try {
      const res = await bot.getChatMember("@PVEmpire1", chatId);

      const isMember =
        res.status === "member" ||
        res.status === "administrator" ||
        res.status === "creator";

      if (isMember) {
        if (!u.tasks.sub) {
          u.tasks.sub = true;
          u.coins += 25;
          u.xp += 10;
          u.level = level(u.xp);

          await users.updateOne({ chatId }, { $set: u });
        }

        return bot.editMessageText(
`📜 TASKS

1️⃣ Subscribe:
👉 https://t.me/PVEmpire1

Status: ${u.tasks.sub ? "✅ DONE (+25)" : "❌ NOT DONE"}`,
          {
            chat_id: chatId,
            message_id: messageId,
            ...menu()
          }
        );
      }

      return bot.editMessageText(
`📜 TASKS

1️⃣ Subscribe:
👉 https://t.me/PVEmpire1

Status: ❌ NOT DONE`,
        {
          chat_id: chatId,
          message_id: messageId,
          ...menu()
        }
      );

    } catch (e) {
      return bot.answerCallbackQuery(q.id, {
        text: "⚠️ Cannot check channel",
        show_alert: true
      });
    }
  }

  // ================= PROFILE
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

console.log("🚀 FULL GAME RUNNING");
