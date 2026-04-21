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
function mainMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "⛏ Farm", callback_data: "farm" }, { text: "💼 Work", callback_data: "work" }],
        [{ text: "⚔ Battle", callback_data: "battle" }, { text: "📦 Case", callback_data: "case" }],
        [{ text: "💰 Balance", callback_data: "balance" }, { text: "🏆 Top", callback_data: "top" }]
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
      xp: 0,
      level: 1,
      wins: 0
    };
    await users.insertOne(u);
  }

  return u;
}

const level = (xp) => Math.floor(xp / 100) + 1;

// ===== START =====
bot.onText(/\/start/, async (msg) => {
  await getUser(msg.chat.id, msg.from.username);

  bot.sendMessage(
    msg.chat.id,
    "🎮 Welcome!\nОберіть дію:",
    mainMenu()
  );
});

// ===== BUTTONS =====
bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const user = await getUser(chatId, q.from.username);

  let text = "";

  switch (q.data) {

    case "farm": {
      const gain = Math.floor(Math.random() * 10) + 1;
      user.coins += gain;
      user.xp += 5;
      user.level = level(user.xp);
      text = `⛏ +${gain} монет`;
      break;
    }

    case "work": {
      const r = Math.random();
      let reward = r < 0.7 ? 5 : r < 0.95 ? 20 : 100;

      user.coins += reward;
      user.xp += 10;
      user.level = level(user.xp);

      text = `💼 +${reward} монет`;
      break;
    }

    case "balance":
      text = `💰 ${user.coins}\n⭐ XP: ${user.xp}\n📊 LVL: ${user.level}`;
      break;

    case "case": {
      const cost = 20;
      if (user.coins < cost) {
        text = "❌ нема монет";
        break;
      }

      user.coins -= cost;

      const roll = Math.random();
      const reward = roll < 0.6 ? 10 : roll < 0.9 ? 30 : 100;

      user.coins += reward;
      user.xp += 15;

      text = `📦 кейс: +${reward}`;
      break;
    }

    case "battle": {
      const all = await users.find().toArray();
      const enemy = all[Math.floor(Math.random() * all.length)];

      if (!enemy || enemy.chatId === user.chatId) {
        text = "нема противника";
        break;
      }

      const win = Math.random() * user.level > Math.random() * enemy.level;

      if (win) {
        user.coins += 20;
        user.wins += 1;
        text = `⚔ перемога над ${enemy.username}`;
      } else {
        text = `💀 програв ${enemy.username}`;
      }

      break;
    }

    case "top": {
      const top = await users.find().sort({ coins: -1 }).limit(5).toArray();

      text = "🏆 TOP:\n\n";
      top.forEach((u, i) => {
        text += `${i + 1}. ${u.username} — ${u.coins}\n`;
      });

      break;
    }
  }

  await users.updateOne({ chatId }, { $set: user });

  bot.answerCallbackQuery(q.id);

  bot.sendMessage(chatId, text, mainMenu());
});

console.log("🚀 Bot with menu started");
