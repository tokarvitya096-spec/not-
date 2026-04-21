import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import { MongoClient, ObjectId } from "mongodb";

dotenv.config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const client = new MongoClient(process.env.MONGO_URL);
await client.connect();

const db = client.db("game");
const users = db.collection("users");
const battles = db.collection("battles");

// ===== USER =====
async function getUser(chatId, username) {
  let u = await users.findOne({ chatId });

  if (!u) {
    u = {
      chatId,
      username: username || "player",
      coins: 100,
      xp: 0,
      level: 1
    };
    await users.insertOne(u);
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
        [{ text: "⛏ FARM", callback_data: "farm" }],
        [{ text: "💼 WORK", callback_data: "work" }],
        [{ text: "📦 CASE", callback_data: "case" }],
        [{ text: "🎰 CASINO", callback_data: "casino" }],
        [{ text: "⚔️ PVP", callback_data: "pvp" }],
        [{ text: "👤 PROFILE", callback_data: "profile" }]
      ]
    }
  };
}

// ===== START =====
bot.onText(/\/start/, async (msg) => {
  await getUser(msg.chat.id, msg.from.username);
  bot.sendMessage(msg.chat.id, "🎮 FULL GAME STARTED", menu());
});

// ===== CALLBACK =====
bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const messageId = q.message.message_id;

  const u = await getUser(chatId, q.from.username);

  bot.answerCallbackQuery(q.id).catch(() => {});

  // ================= PROFILE
  if (q.data === "profile") {
    return bot.editMessageText(
`👤 PROFILE

💰 ${u.coins}
⭐ XP ${u.xp}
📊 LVL ${level(u.xp)}`,
      {
        chat_id: chatId,
        message_id: messageId,
        ...menu()
      }
    );
  }

  // ================= FARM
  if (q.data === "farm") {
    const gain = Math.floor(Math.random() * 10) + 5;
    u.coins += gain;
    u.xp += 5;

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(`⛏ +${gain}`, {
      chat_id: chatId,
      message_id: messageId,
      ...menu()
    });
  }

  // ================= WORK
  if (q.data === "work") {
    const reward = Math.floor(Math.random() * 40) + 10;
    u.coins += reward;
    u.xp += 8;

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(`💼 +${reward}`, {
      chat_id: chatId,
      message_id: messageId,
      ...menu()
    });
  }

  // ================= CASE
  if (q.data === "case") {
    const reward = Math.random() < 0.7 ? 15 : 40;

    u.coins += reward;

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(`📦 +${reward}`, {
      chat_id: chatId,
      message_id: messageId,
      ...menu()
    });
  }

  // ================= CASINO MENU
  if (q.data === "casino") {
    return bot.editMessageText("🎰 CASINO", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: "🎲 COINFLIP", callback_data: "coinflip" }],
          [{ text: "🎰 SLOTS", callback_data: "slots" }],
          [{ text: "⬅ BACK", callback_data: "home" }]
        ]
      }
    });
  }

  // ================= COINFLIP (FIXED)
  if (q.data === "coinflip") {
    const bet = 10;

    if (u.coins < bet) {
      return bot.answerCallbackQuery(q.id, {
        text: "❌ Not enough coins",
        show_alert: true
      });
    }

    const win = Math.random() < 0.5;

    u.coins += win ? bet : -bet;

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(
win ? "🎉 WIN +10" : "💀 LOSE -10",
      {
        chat_id: chatId,
        message_id: messageId,
        ...menu()
      }
    );
  }

  // ================= SLOTS (FIXED)
  if (q.data === "slots") {
    const bet = 20;

    if (u.coins < bet) {
      return bot.answerCallbackQuery(q.id, {
        text: "❌ Not enough coins",
        show_alert: true
      });
    }

    const s = ["🍒", "🍋", "💎", "7️⃣"];
    const r1 = s[Math.floor(Math.random() * s.length)];
    const r2 = s[Math.floor(Math.random() * s.length)];
    const r3 = s[Math.floor(Math.random() * s.length)];

    let text = `🎰 ${r1} | ${r2} | ${r3}\n\n`;

    if (r1 === r2 && r2 === r3) {
      u.coins += bet * 5;
      text += "💎 JACKPOT x5";
    } else if (r1 === r2 || r2 === r3 || r1 === r3) {
      u.coins += bet * 2;
      text += "🎉 WIN x2";
    } else {
      u.coins -= bet;
      text += "💀 LOSE";
    }

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      ...menu()
    });
  }

  // ================= PVP (SIMPLE FIXED)
  if (q.data === "pvp") {
    const roll1 = Math.floor(Math.random() * 6) + 1;
    const roll2 = Math.floor(Math.random() * 6) + 1;

    let text = `⚔️ PVP\n\nYou: ${roll1}\nEnemy: ${roll2}\n\n`;

    if (roll1 > roll2) {
      u.coins += 20;
      text += "🏆 WIN +20";
    } else if (roll2 > roll1) {
      u.coins -= 10;
      text += "💀 LOSE -10";
    } else {
      text += "🤝 DRAW";
    }

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      ...menu()
    });
  }
});

console.log("🚀 FULL GAME RUNNING (FIXED CASINO)");
