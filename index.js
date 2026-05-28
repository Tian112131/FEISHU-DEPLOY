const express = require("express");
const lark = require("@larksuiteoapi/node-sdk");
const OpenAI = require("openai");

const app = express();
app.use(express.json({ limit: "2mb" }));

const {
  OPENAI_API_KEY,
  OPENAI_MODEL = "gpt-4.1-mini",
  FEISHU_APP_ID,
  FEISHU_APP_SECRET,
  FEISHU_BOT_NAME,
  PORT = 3000,
  MAX_HISTORY_MESSAGES = 10
} = process.env;

if (!OPENAI_API_KEY) console.warn("Missing env: OPENAI_API_KEY");
if (!FEISHU_APP_ID) console.warn("Missing env: FEISHU_APP_ID");
if (!FEISHU_APP_SECRET) console.warn("Missing env: FEISHU_APP_SECRET");

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const feishuClient = new lark.Client({
  appId: FEISHU_APP_ID,
  appSecret: FEISHU_APP_SECRET,
  disableTokenCache: false
});

// Simple memory storage.
// For production, replace this with Redis, MongoDB, PostgreSQL, etc.
const conversations = new Map();
const handledEvents = new Set();

function getTextFromFeishuMessage(message) {
  if (!message || message.message_type !== "text") return null;

  try {
    const content = JSON.parse(message.content || "{}");
    return (content.text || "").trim();
  } catch {
    return null;
  }
}

function removeBotMention(text) {
  if (!text) return "";
  // Feishu/Lark text mentions are often represented as @_user_x in event content.
  return text.replace(/@_user_\d+/g, "").trim();
}

function getSessionId(event) {
  const chatId = event?.message?.chat_id || "unknown_chat";
  const userId = event?.sender?.sender_id?.user_id || "unknown_user";
  return `${chatId}:${userId}`;
}

async function replyToFeishuMessage(messageId, text) {
  return feishuClient.im.message.reply({
    path: {
      message_id: messageId
    },
    data: {
      msg_type: "text",
      content: JSON.stringify({
        text
      })
    }
  });
}

function addToConversation(sessionId, role, content) {
  const history = conversations.get(sessionId) || [];
  history.push({ role, content });

  const max = Number(MAX_HISTORY_MESSAGES) || 10;
  while (history.length > max) history.shift();

  conversations.set(sessionId, history);
  return history;
}

async function askOpenAI(sessionId, userText) {
  const history = conversations.get(sessionId) || [];

  const messages = [
    {
      role: "system",
      content: "你是一个在飞书中的中文助手。回答要清楚、实用、简洁。"
    },
    ...history,
    {
      role: "user",
      content: userText
    }
  ];

  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages
  });

  const answer = response.choices?.[0]?.message?.content?.trim();
  return answer || "我没有生成有效回复，请稍后再试。";
}

async function handleCommand(sessionId, messageId, text) {
  const command = text.trim();

  if (command === "/help") {
    await replyToFeishuMessage(
      messageId,
      "可用指令：\n/help 查看帮助\n/clear 清除当前会话上下文"
    );
    return true;
  }

  if (command === "/clear") {
    conversations.delete(sessionId);
    await replyToFeishuMessage(messageId, "✅ 当前会话上下文已清除。");
    return true;
  }

  return false;
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    name: "feishu-chatgpt-bot",
    message: "Bot server is running."
  });
});

app.post("/webhook", async (req, res) => {
  const body = req.body;

  // 1. Feishu URL verification
  if (body?.type === "url_verification") {
    return res.json({ challenge: body.challenge });
  }

  // 2. Reply 200 quickly enough for Feishu.
  // Actual processing is still done before returning here for simplicity.
  try {
    const eventType = body?.header?.event_type;
    if (eventType !== "im.message.receive_v1") {
      return res.json({ code: 0, msg: "ignored event" });
    }

    const eventId = body?.header?.event_id;
    if (eventId && handledEvents.has(eventId)) {
      return res.json({ code: 0, msg: "duplicate event ignored" });
    }
    if (eventId) handledEvents.add(eventId);

    const event = body.event;
    const message = event.message;
    const messageId = message.message_id;
    const chatType = message.chat_type;

    if (message.message_type !== "text") {
      await replyToFeishuMessage(messageId, "暂时只支持文本消息。");
      return res.json({ code: 0 });
    }

    // In group chat, only respond when the bot is mentioned.
    if (chatType === "group") {
      const mentions = message.mentions || [];
      const isMentioned = mentions.some(m => {
        return m.name === FEISHU_BOT_NAME || m?.id?.app_id === FEISHU_APP_ID;
      });

      if (!isMentioned) {
        return res.json({ code: 0, msg: "group message without bot mention ignored" });
      }
    }

    const rawText = getTextFromFeishuMessage(message);
    const userText = removeBotMention(rawText);

    if (!userText) {
      await replyToFeishuMessage(messageId, "请发送文本问题。");
      return res.json({ code: 0 });
    }

    const sessionId = getSessionId(event);

    const handled = await handleCommand(sessionId, messageId, userText);
    if (handled) return res.json({ code: 0 });

    const answer = await askOpenAI(sessionId, userText);

    addToConversation(sessionId, "user", userText);
    addToConversation(sessionId, "assistant", answer);

    await replyToFeishuMessage(messageId, answer);

    return res.json({ code: 0 });
  } catch (error) {
    console.error("Webhook error:", error?.response?.data || error?.message || error);
    return res.status(500).json({
      code: 1,
      msg: "server error"
    });
  }
});

app.listen(PORT, () => {
  console.log(`Feishu ChatGPT bot server listening on port ${PORT}`);
});
