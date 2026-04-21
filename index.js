require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const mongoose = require("mongoose");

const bot = new TelegramBot(process.env.TOKEN, { polling: true });

// 🔗 MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB підключено"))
  .catch(err => console.log(err));

// 📦 Схема користувача
const userSchema = new mongoose.Schema({
  userId: Number,
  username: String,
  pv: { type: Number, default: 0 },
  lastClaim: { type: Number, default: Date.now }
});

const User = mongoose.model("User", userSchema);

// 🧩 Отримати або створити юзера
async function getUser(msg) {
  let user = await User.findOne({ userId: msg.from.id });

  if (!user) {
    user = new User({
      userId: msg.from.id,
      username: msg.from.username || msg.from.first_name
    });
    await user.save();
  }

  return user;
}

// ▶️ /start
bot.onText(/\/start/, async (msg) => {
  await getUser(msg);

  bot.sendMessage(msg.chat.id,
`👋 Привіт!

💰 Це Pv Empire
Тапай і заробляй PV!

Команди:
/tap - тапати
/balance - баланс
/top - топ гравців
/claim - забрати пасивний дохід`
  );
});

// 👆 Тапання
bot.onText(/\/tap/, async (msg) => {
  const user = await getUser(msg);

  const earn = Math.floor(Math.random() * 10) + 1;
  user.pv += earn;

  await user.save();

  bot.sendMessage(msg.chat.id, `👆 +${earn} PV`);
});

// 💰 Баланс
bot.onText(/\/balance/, async (msg) => {
  const user = await getUser(msg);

  bot.sendMessage(msg.chat.id,
`💰 Баланс: ${user.pv} PV`
  );
});

// ⏱ Пасивний дохід (раз на годину)
bot.onText(/\/claim/, async (msg) => {
  const user = await getUser(msg);

  const now = Date.now();
  const diff = now - user.lastClaim;

  if (diff < 3600000) {
    const mins = Math.ceil((3600000 - diff) / 60000);
    return bot.sendMessage(msg.chat.id,
      `⏳ Зачекай ${mins} хв`
    );
  }

  const reward = 50;
  user.pv += reward;
  user.lastClaim = now;

  await user.save();

  bot.sendMessage(msg.chat.id,
    `✅ +${reward} PV (пасивний дохід)`
  );
});

// 🏆 Топ гравців
bot.onText(/\/top/, async (msg) => {
  const top = await User.find().sort({ pv: -1 }).limit(10);

  let text = "🏆 ТОП ГРАВЦІВ:\n\n";

  top.forEach((u, i) => {
    text += `${i + 1}. ${u.username} — ${u.pv} PV\n`;
  });

  bot.sendMessage(msg.chat.id, text);
});

console.log("🤖 Бот запущений");
