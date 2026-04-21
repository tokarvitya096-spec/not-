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

// ===== HELPERS =====
async function getUser(chatId, username) {
  let user = await users.findOne({ chatId });

  if (!user) {
    user = {
      chatId,
      username: username || "player",
      coins: 0,
      xp: 0,
      level: 1,
      wins: 0
    };
    await users.insertOne(user);
  }

  return user;
}

function calcLevel(xp) {
  return Math.floor(xp / 100) + 1;
}

// ===== START =====
bot.onText(/\/start/, async (msg) => {
  await getUser(msg.chat.id, msg.from.username);

  bot.sendMessage(msg.chat.id,
`🎮 Welcome to GAME BOT!

Команди:
⚒ /farm
💼 /work
⚔ /battle
💰 /balance
🎁 /daily
🏆 /top
📦 /case`
  );
});

// ===== FARM =====
bot.onText(/\/farm/, async (msg) => {
  const u = await getUser(msg.chat.id, msg.from.username);

  const gain = Math.floor(Math.random() * 10) + 1;

  u.coins += gain;
  u.xp += 5;
  u.level = calcLevel(u.xp);

  await users.updateOne({ chatId: u.chatId }, { $set: u });

  bot.sendMessage(msg.chat.id, `⛏ +${gain} монет`);
});

// ===== WORK =====
bot.onText(/\/work/, async (msg) => {
  const u = await getUser(msg.chat.id, msg.from.username);

  const chance = Math.random();

  let reward = 0;

  if (chance < 0.7) reward = 5;
  else if (chance < 0.95) reward = 20;
  else reward = 100;

  u.coins += reward;
  u.xp += 10;
  u.level = calcLevel(u.xp);

  await users.updateOne({ chatId: u.chatId }, { $set: u });

  bot.sendMessage(msg.chat.id, `💼 Робота: +${reward} монет`);
});

// ===== BALANCE =====
bot.onText(/\/balance/, async (msg) => {
  const u = await getUser(msg.chat.id, msg.from.username);

  bot.sendMessage(msg.chat.id,
`💰 Монети: ${u.coins}
⭐ XP: ${u.xp}
📊 Level: ${u.level}`
  );
});

// ===== DAILY =====
bot.onText(/\/daily/, async (msg) => {
  const u = await getUser(msg.chat.id, msg.from.username);

  const reward = 50;

  u.coins += reward;
  u.xp += 20;

  await users.updateOne({ chatId: u.chatId }, { $set: u });

  bot.sendMessage(msg.chat.id, `🎁 Daily +${reward}`);
});

// ===== CASE =====
bot.onText(/\/case/, async (msg) => {
  const u = await getUser(msg.chat.id, msg.from.username);

  const cost = 20;
  if (u.coins < cost) return bot.sendMessage(msg.chat.id, "❌ нема монет");

  u.coins -= cost;

  const roll = Math.random();

  let reward = 0;

  if (roll < 0.6) reward = 10;
  else if (roll < 0.9) reward = 30;
  else reward = 100;

  u.coins += reward;
  u.xp += 15;

  await users.updateOne({ chatId: u.chatId }, { $set: u });

  bot.sendMessage(msg.chat.id, `📦 кейс: +${reward}`);
});

// ===== BATTLE =====
bot.onText(/\/battle/, async (msg) => {
  const usersList = await users.find().toArray();

  const me = await getUser(msg.chat.id, msg.from.username);

  const enemy = usersList[Math.floor(Math.random() * usersList.length)];

  if (!enemy || enemy.chatId === me.chatId)
    return bot.sendMessage(msg.chat.id, "нема противника");

  const myPower = Math.random() * me.level;
  const enemyPower = Math.random() * enemy.level;

  if (myPower > enemyPower) {
    me.coins += 20;
    me.wins += 1;

    await users.updateOne({ chatId: me.chatId }, { $set: me });

    bot.sendMessage(msg.chat.id, `⚔ ти переміг ${enemy.username}`);
  } else {
    bot.sendMessage(msg.chat.id, `💀 ти програв ${enemy.username}`);
  }
});

// ===== TOP =====
bot.onText(/\/top/, async (msg) => {
  const top = await users.find().sort({ coins: -1 }).limit(10).toArray();

  let text = "🏆 TOP:\n\n";

  top.forEach((u, i) => {
    text += `${i + 1}. ${u.username} — ${u.coins}💰\n`;
  });

  bot.sendMessage(msg.chat.id, text);
});

console.log("🚀 Game bot started");
