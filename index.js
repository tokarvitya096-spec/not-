import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import express from "express";
import { MongoClient } from "mongodb";

dotenv.config();

// ===== BOT =====
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// ===== DB =====
const client = new MongoClient(process.env.MONGO_URL);
await client.connect();

const db = client.db("game");
const users = db.collection("users");

// ===== EXPRESS SITE =====
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send(`
    <h1>🎮 Game Leaderboard</h1>
    <p>Open /top or /players</p>
  `);
});

// API: всі гравці
app.get("/players", async (req, res) => {
  const data = await users.find().toArray();
  res.json(data);
});

// API: топ
app.get("/top", async (req, res) => {
  const data = await users
    .find()
    .sort({ coins: -1 })
    .limit(10)
    .toArray();

  res.json(data);
});

app.listen(PORT, () => {
  console.log("🌐 Site running on port", PORT);
});

// ===== HELPERS =====
async function getUser(chatId) {
  return await users.findOne({ chatId });
}

// ===== START =====
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || "no_name";

  await users.updateOne(
    { chatId },
    {
      $setOnInsert: {
        chatId,
        username,
        coins: 0,
        level: 1
      }
    },
    { upsert: true }
  );

  bot.sendMessage(chatId, "🎮 Гру запущено!\n/farm /balance /top");
});

// ===== FARM =====
bot.onText(/\/farm/, async (msg) => {
  const chatId = msg.chat.id;

  const reward = Math.floor(Math.random() * 10) + 1;

  await users.updateOne(
    { chatId },
    { $inc: { coins: reward } }
  );

  bot.sendMessage(chatId, `⚡ +${reward} монет`);
});

// ===== BALANCE =====
bot.onText(/\/balance/, async (msg) => {
  const chatId = msg.chat.id;

  const user = await getUser(chatId);

  bot.sendMessage(chatId, `💰 Баланс: ${user?.coins || 0}`);
});

// ===== TOP =====
bot.onText(/\/top/, async (msg) => {
  const chatId = msg.chat.id;

  const top = await users.find().sort({ coins: -1 }).limit(10).toArray();

  let text = "🏆 TOP гравців:\n\n";

  top.forEach((u, i) => {
    text += `${i + 1}. ${u.username} — ${u.coins} 💰\n`;
  });

  bot.sendMessage(chatId, text);
});

// ===== ADMIN GIVE =====
const ADMIN_ID = Number(process.env.ADMIN_ID);

bot.onText(/\/add (\d+)/, async (msg, match) => {
  if (msg.chat.id !== ADMIN_ID) return;

  const amount = Number(match[1]);

  await users.updateOne(
    { chatId: msg.chat.id },
    { $inc: { coins: amount } }
  );

  bot.sendMessage(msg.chat.id, `✅ +${amount}`);
});

console.log("🤖 Bot started");
