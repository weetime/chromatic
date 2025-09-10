# Chrome Push API 通知收集器

一个专门收集Chrome Push API推送通知的浏览器插件。

## 功能

- 🔔 **接收Push通知**：自动接收网站通过Push API发送的推送消息
- 📊 **消息管理**：在统一界面中查看、搜索、删除推送消息
- 🧪 **测试功能**：内置测试推送通知功能
- ⚡ **实时更新**：popup窗口实时显示新消息

## 安装

1. 打开Chrome浏览器
2. 进入 `chrome://extensions/`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择此项目文件夹

## 使用

1. **测试功能**：点击插件图标，点击"Test Push"按钮测试推送通知
2. **接收消息**：访问支持Push API的网站，允许通知权限，插件会自动收集推送消息
3. **管理消息**：在插件界面中查看、搜索、删除推送消息

## 文件结构

```
chromatic/
├── manifest.json          # 插件配置
├── background.js          # Service Worker (Push消息处理)
├── content.js             # 内容脚本 (订阅检测)
├── popup.html             # 用户界面
├── popup.js               # 界面逻辑
├── popup.css              # 界面样式
├── icons/                 # 插件图标
└── README.md              # 说明文档
```

## 技术说明

- 基于W3C Push API标准
- 支持Chrome原生通知系统
- 使用Chrome Storage API本地存储
- 符合Chrome扩展安全策略

## 权限

- `notifications`：显示系统通知
- `background`：后台运行Service Worker
- `storage`：本地存储消息数据
- `activeTab`：访问当前标签页
- `tabs`：监听标签页变化
- `scripting`：注入内容脚本

## 注意事项

- 插件只收集真正的Push API推送消息
- 不会收集页面导航、表单提交等页面事件
- 所有数据仅存储在本地，不会上传到外部服务器