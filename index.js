import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import { MongoClient } from "mongodb";

dotenv.config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const client = new MongoClient(process.env.MONGO_URL);
await client.connect();

const db = client.db("casino");
const users = db.collection("users");

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
        [{ text: "🎰 COINFLIP", callback_data: "coinflip" }],
        [{ text: "🎲 SLOTS", callback_data: "slots" }],
        [{ text: "👤 PROFILE", callback_data: "profile" }]
      ]
    }
  };
}

// ===== START =====
bot.onText(/\/start/, async (msg) => {
  await getUser(msg.chat.id, msg.from.username);
  bot.sendMessage(msg.chat.id, "🎰 CASINO STARTED", menu());
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

💰 Coins: ${u.coins}
⭐ XP: ${u.xp}
📊 LVL: ${u.level}`,
      {
        chat_id: chatId,
        message_id: messageId,
        ...menu()
      }
    );
  }

  // ================= COINFLIP
  if (q.data === "coinflip") {
    const bet = 10;

    if (u.coins < bet) {
      return bot.answerCallbackQuery(q.id, {
        text: "❌ Not enough coins",
        show_alert: true
      });
    }

    const win = Math.random() < 0.5;

    if (win) {
      u.coins += bet;
      u.xp += 5;
    } else {
      u.coins -= bet;
    }

    u.level = level(u.xp);

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(
win
? `🎉 WIN +${bet}`
: `💀 LOSE -${bet}`,
      {
        chat_id: chatId,
        message_id: messageId,
        ...menu()
      }
    );
  }

  // ================= SLOTS
  if (q.data === "slots") {
    const bet = 20;

    if (u.coins < bet) {
      return bot.answerCallbackQuery(q.id, {
        text: "❌ Not enough coins",
        show_alert: true
      });
    }

    const symbols = ["🍒", "🍋", "💎", "7️⃣", "🔔"];
    const r1 = symbols[Math.floor(Math.random() * symbols.length)];
    const r2 = symbols[Math.floor(Math.random() * symbols.length)];
    const r3 = symbols[Math.floor(Math.random() * symbols.length)];

    let result = `🎰 ${r1} | ${r2} | ${r3}\n\n`;

    if (r1 === r2 && r2 === r3) {
      const win = bet * 5;
      u.coins += win;
      u.xp += 20;
      result += `💎 JACKPOT +${win}`;
    } else if (r1 === r2 || r2 === r3 || r1 === r3) {
      const win = bet * 2;
      u.coins += win;
      u.xp += 10;
      result += `🎉 WIN +${win}`;
    } else {
      u.coins -= bet;
      result += `💀 LOSE -${bet}`;
    }

    u.level = level(u.xp);

    await users.updateOne({ chatId }, { $set: u });

    return bot.editMessageText(result, {
      chat_id: chatId,
      message_id: messageId,
      ...menu()
    });
  }
});

console.log("🎰 CASINO BOT RUNNING");
