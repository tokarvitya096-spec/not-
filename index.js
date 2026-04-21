require("dotenv").config();

const { Telegraf } = require("telegraf");
const mongoose = require("mongoose");

// ================= DB =================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.log("DB error:", err));

// ================= BOT =================
const bot = new Telegraf(process.env.BOT_TOKEN);

// ================= MODEL =================
const userSchema = new mongoose.Schema({
  userId: Number,
  coins: { type: Number, default: 0 },

  tapPower: { type: Number, default: 1 },
  level: { type: Number, default: 1 },

  incomePerHour: { type: Number, default: 0 },
  lastClaim: { type: Date, default: Date.now },

  lastTap: Date
});

const User = mongoose.model("User", userSchema);

// ================= FUNCTIONS =================
async function getUser(id) {
  let user = await User.findOne({ userId: id });
  if (!user) {
    user = await User.create({ userId: id });
  }
  return user;
}

function giveOfflineIncome(user) {
  const now = Date.now();
  const last = user.lastClaim ? user.lastClaim.getTime() : now;

  const hours = (now - last) / (1000 * 60 * 60);
  const income = Math.floor(hours * user.incomePerHour);

  if (income > 0) {
    user.coins += income;
    user.lastClaim = new Date();
  }

  return income;
}

// ================= COMMANDS =================

// START
bot.start(async (ctx) => {
  await getUser(ctx.from.id);
  ctx.reply("👋 Вітаю! Пиши /tap щоб фармити Pv\n/shop — магазин\n/profile — профіль");
});

// TAP
bot.command("tap", async (ctx) => {
  const user = await getUser(ctx.from.id);

  giveOfflineIncome(user);

  const now = Date.now();
  const last = user.lastTap ? user.lastTap.getTime() : 0;

  if (now - last < 1000) {
    return ctx.reply("⏳ Занадто швидко!");
  }

  user.coins += user.tapPower;
  user.lastTap = new Date();

  await user.save();

  ctx.reply(`💎 +${user.tapPower} Pv\nБаланс: ${user.coins}`);
});

// PROFILE
bot.command("profile", async (ctx) => {
  const user = await getUser(ctx.from.id);

  const income = giveOfflineIncome(user);
  await user.save();

  ctx.reply(
`👤 Профіль
💰 Pv: ${user.coins}
⚡ Tap: ${user.tapPower}
⛏ Доход/год: ${user.incomePerHour}
📊 Рівень: ${user.level}
${income > 0 ? `\n💸 +${income} Pv (офлайн)` : ""}`
  );
});

// SHOP
bot.command("shop", (ctx) => {
  ctx.reply(
`🛒 Магазин:

1. ⚡ Tap +1 → 100 Pv (/buy_tap)
2. ⛏ Доход +5/год → 200 Pv (/buy_income)
`
  );
});

// BUY TAP
bot.command("buy_tap", async (ctx) => {
  const user = await getUser(ctx.from.id);
  giveOfflineIncome(user);

  const price = 100;

  if (user.coins < price) {
    return ctx.reply("❌ Не вистачає Pv");
  }

  user.coins -= price;
  user.tapPower += 1;

  await user.save();

  ctx.reply("✅ Tap покращено!");
});

// BUY INCOME
bot.command("buy_income", async (ctx) => {
  const user = await getUser(ctx.from.id);
  giveOfflineIncome(user);

  const price = 200;

  if (user.coins < price) {
    return ctx.reply("❌ Не вистачає Pv");
  }

  user.coins -= price;
  user.incomePerHour += 5;

  await user.save();

  ctx.reply("✅ Доход збільшено!");
});

// ================= START =================
bot.launch();
console.log("Bot started");
