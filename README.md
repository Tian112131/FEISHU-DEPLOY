# 飞书应用机器人接入 OpenAI / ChatGPT

这是一个普通 Node.js + Express 版本的飞书开放平台应用机器人后端，可以上传到 GitHub，然后部署到 Render、Railway 等平台。

它的作用是：

```text
用户在飞书里私聊机器人 / 群聊 @机器人
        ↓
飞书事件订阅 POST 到 /webhook
        ↓
Node.js 后端调用 OpenAI API
        ↓
机器人回复飞书消息
```

## 1. 本地运行

安装依赖：

```bash
npm install
```

设置环境变量。可以复制 `.env.example`，但本项目默认没有读取 `.env` 文件；部署平台上请直接在环境变量面板配置。

本地测试时可以用：

```bash
set OPENAI_API_KEY=你的OpenAIKey
set FEISHU_APP_ID=cli_xxx
set FEISHU_APP_SECRET=xxx
set FEISHU_BOT_NAME=你的机器人名称
npm start
```

macOS / Linux：

```bash
export OPENAI_API_KEY=你的OpenAIKey
export FEISHU_APP_ID=cli_xxx
export FEISHU_APP_SECRET=xxx
export FEISHU_BOT_NAME=你的机器人名称
npm start
```

访问：

```text
http://localhost:3000/
```

看到 `Bot server is running.` 即表示服务已启动。

## 2. 上传 GitHub

推荐仓库结构：

```text
feishu-chatgpt-bot/
├─ index.js
├─ package.json
├─ README.md
└─ .env.example
```

不要把真实 API Key、App Secret 上传到 GitHub。

## 3. 部署到 Render / Railway

部署后你会得到一个公网 HTTPS 地址，例如：

```text
https://你的项目.onrender.com
```

飞书事件订阅地址填写：

```text
https://你的项目.onrender.com/webhook
```

## 4. 环境变量

部署平台里配置：

```text
OPENAI_API_KEY=你的OpenAI API Key
OPENAI_MODEL=gpt-4.1-mini
FEISHU_APP_ID=飞书应用 App ID
FEISHU_APP_SECRET=飞书应用 App Secret
FEISHU_BOT_NAME=飞书机器人名称
MAX_HISTORY_MESSAGES=10
```

## 5. 飞书开放平台配置

需要完成：

1. 创建企业自建应用
2. 添加机器人能力
3. 权限管理中开通消息接收和消息发送相关权限
4. 事件订阅中配置请求地址：`https://你的域名/webhook`
5. 订阅事件：`im.message.receive_v1`
6. 发布应用版本
7. 把机器人添加到群聊，或直接私聊机器人

群聊中通常需要 `@机器人 问题内容`，私聊可以直接发问题。

## 6. 指令

```text
/help   查看帮助
/clear  清除当前会话上下文
```

## 7. 注意

当前代码使用内存保存上下文，服务重启后上下文会丢失。如果你需要长期记忆，可以接入 Redis、MongoDB 或数据库。
