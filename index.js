import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import { MongoClient } from "mongodb";

dotenv.config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const client = new MongoClient(process.env.MONGO_URL);
await client.connect();

const db = client.db("game");
const users = db.collection("users");

// ===== PVP REQUESTS =====
const pendingBattles = new Map();

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
      gems: 0,
      xp: 0,
      level: 1,
      vip: false,
      wins: 0,
      lastFarm: 0,
      lastCase: 0
    };

    await users.insertOne(u);
  }

  return u;
}

// ===== MAIN MENU =====
function mainMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🏠 HOME", callback_data: "home" }],
        [
          { text: "⛏ FARM", callback_data: "tab_farm" },
          { text: "⚔ BATTLE", callback_data: "tab_battle" }
        ],
        [
          { text: "📦 CASE", callback_data: "tab_case" },
          { text: "💰 PROFILE", callback_data: "tab_profile" }
        ]
      ]
    }
  };
}

// ===== START =====
bot.onText(/\/start/, async (msg) => {
  await getUser(msg.chat.id, msg.from.username);
  bot.sendMessage(msg.chat.id, "🎮 GAME STARTED", mainMenu());
});

// ===== CALLBACK =====
bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const messageId = q.message.message_id;

  let u = await getUser(chatId, q.from.username);
  const now = Date.now();

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

      return bot.editMessageText(`⛏ FARM cooldown: ${h}h`, {
        chat_id: chatId,
        message_id: messageId,
        ...mainMenu()
      });
    }

    let gain = Math.floor(Math.random() * 10) + 5;
    if (u.vip) gain *= 2;

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

      return bot.editMessageText(`📦 CASE cooldown: ${h}h`, {
        chat_id: chatId,
        message_id: messageId,
        ...mainMenu()
      });
    }

    if (u.coins < 20) {
      return bot.editMessageText("❌ Not enough coins", {
        chat_id: chatId,
        message_id: messageId,
        ...mainMenu()
      });
    }

    u.coins -= 20;

    const reward = Math.random() < 0.6 ? 10 : Math.random() < 0.9 ? 30 : 100;

    u.coins += reward;
    u.xp += 15;
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
💎 ${u.gems}
⭐ XP ${u.xp}
📊 LVL ${u.level}
👑 VIP ${u.vip ? "YES" : "NO"}
🏆 WINS ${u.wins}`,
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

  // ================= BATTLE TAB
  if (q.data === "tab_battle") {
    const all = await users.find().toArray();

    let list = [];

    all.forEach(op => {
      if (op.chatId !== chatId) {
        list.push([
          {
            text: `⚔ ${op.username}`,
            callback_data: `pvp_${op.chatId}`
          }
        ]);
      }
    });

    return bot.editMessageText("⚔ BATTLE TAB", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          ...list,
          [{ text: "⬅ BACK", callback_data: "home" }]
        ]
      }
    });
  }

  // ================= SEND PVP REQUEST
  if (q.data.startsWith("pvp_")) {
    const enemyId = Number(q.data.split("_")[1]);

    pendingBattles.set(enemyId, chatId);

    await bot.sendMessage(
      enemyId,
      `⚔ Battle request from ${u.username}`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ ACCEPT", callback_data: `accept_${chatId}` },
              { text: "❌ DECLINE", callback_data: `decline_${chatId}` }
            ]
          ]
        }
      }
    );

    return bot.editMessageText("📩 Request sent", {
      chat_id: chatId,
      message_id: messageId,
      ...mainMenu()
    });
  }

  // ================= ACCEPT BATTLE
  if (q.data.startsWith("accept_")) {
    const attackerId = Number(q.data.split("_")[1]);

    const attacker = await users.findOne({ chatId: attackerId });

    if (!attacker) return;

    let myHP = u.level * 10;
    let enemyHP = attacker.level * 10;

    let log = `⚔ PvP\n${attacker.username} vs ${u.username}\n\n`;

    while (myHP > 0 && enemyHP > 0) {
      const aHit = Math.floor(Math.random() * 10 + attacker.level);
      const dHit = Math.floor(Math.random() * 10 + u.level);

      enemyHP -= aHit;
      myHP -= dHit;

      log += `${attacker.username} -${aHit} | You -${dHit}\n`;
    }

    if (myHP > enemyHP) {
      u.coins += 30;
      u.wins += 1;
      log += "\n🏆 YOU WIN";
    } else {
      log += "\n💀 YOU LOSE";
    }

    await users.updateOne({ chatId }, { $set: u });

    pendingBattles.delete(chatId);

    return bot.editMessageText(log, {
      chat_id: chatId,
      message_id: messageId,
      ...mainMenu()
    });
  }

  // ================= DECLINE
  if (q.data.startsWith("decline_")) {
    const attackerId = Number(q.data.split("_")[1]);

    pendingBattles.delete(chatId);

    await bot.sendMessage(attackerId, "❌ Battle declined");

    return bot.editMessageText("❌ Declined", {
      chat_id: chatId,
      message_id: messageId,
      ...mainMenu()
    });
  }

  bot.answerCallbackQuery(q.id);
});

console.log("🚀 TAB GAME BOT RUNNING");
