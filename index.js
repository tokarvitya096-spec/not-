import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

// BOT + DB
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const client = new MongoClient(process.env.MONGO_URL);

await client.connect();
const db = client.db("botdb");
const users = db.collection("users");

// ===== START =====
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  await users.updateOne(
    { chatId },
    { $setOnInsert: { chatId, coins: 0 } },
    { upsert: true }
  );

  bot.sendMessage(chatId, "👋 Бот запущено!\nКоманди:\n/balance\n/farm");
});

// ===== BALANCE =====
bot.onText(/\/balance/, async (msg) => {
  const chatId = msg.chat.id;

  const user = await users.findOne({ chatId });

  bot.sendMessage(chatId, `💰 Баланс: ${user?.coins || 0} монет`);
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

// ===== ADMIN ADD COINS =====
const ADMIN_ID = Number(process.env.ADMIN_ID);

bot.onText(/\/add (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;

  if (chatId !== ADMIN_ID) {
    return bot.sendMessage(chatId, "⛔ Нема доступу");
  }

  const amount = Number(match[1]);

  await users.updateOne(
    { chatId },
    { $inc: { coins: amount } }
  );

  bot.sendMessage(chatId, `✅ Додано ${amount} монет`);
});

console.log("🤖 Bot started");
