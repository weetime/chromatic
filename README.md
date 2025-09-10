# Chrome Push API 通知收集器

一个专门收集Chrome Push API推送通知的浏览器插件，经过重构优化，代码更优雅、可读、可维护。

## ✨ 功能特性

- 🔔 **接收Push通知**：自动接收网站通过Push API发送的推送消息
- 📊 **消息管理**：在统一界面中查看、搜索、删除推送消息
- 🧪 **测试功能**：内置测试推送通知功能
- ⚡ **实时更新**：popup窗口实时显示新消息
- 📈 **统计信息**：显示消息统计和Push订阅数量
- 💾 **数据导出**：支持CSV格式导出推送消息

## 🚀 安装使用

### 安装步骤
1. 打开Chrome浏览器
2. 进入 `chrome://extensions/`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择此项目文件夹

### 使用方法
1. **测试功能**：点击插件图标，点击"Test Push"按钮测试推送通知
2. **接收消息**：访问支持Push API的网站，允许通知权限，插件会自动收集推送消息
3. **管理消息**：在插件界面中查看、搜索、删除推送消息
4. **导出数据**：点击"导出"按钮将消息保存为CSV文件

## 📁 项目结构

```
chromatic/
├── manifest.json          # 插件配置文件
├── background.js          # Service Worker (Push消息处理)
├── content.js             # 内容脚本 (订阅检测)
├── popup.html             # 用户界面
├── popup.js               # 界面逻辑
├── popup.css              # 界面样式
├── icons/                 # 插件图标
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   ├── icon128.png
│   └── icon.svg
├── test-refactored.js     # 测试脚本
└── README.md              # 说明文档
```

## 🏗️ 技术架构

### 重构优化
- **代码精简**：总体代码量减少约25%
- **模块化设计**：功能模块化，职责分离
- **可读性提升**：方法命名清晰，逻辑结构优化
- **可维护性**：统一的错误处理和事件管理

### 核心组件
- **PushNotificationManager**：Service Worker，处理Push消息和通知
- **PushMessageCollector**：Popup界面，管理消息显示和用户交互
- **PushSubscriptionDetector**：Content Script，检测Push订阅

### 技术栈
- **W3C Push API**：标准推送消息处理
- **Chrome Extensions API**：扩展功能实现
- **Chrome Storage API**：本地数据存储
- **Service Worker**：后台消息处理
- **原生通知系统**：系统级通知显示

## 🔧 权限说明

- `notifications`：显示系统通知
- `background`：后台运行Service Worker
- `storage`：本地存储消息数据
- `activeTab`：访问当前标签页
- `tabs`：监听标签页变化
- `scripting`：注入内容脚本

## 🧪 测试验证

项目包含测试脚本 `test-refactored.js`，可以在浏览器控制台中运行来验证功能：

```javascript
// 在浏览器控制台中运行
runAllTests(); // 运行所有测试
```

测试包括：
- 后台通信测试
- 订阅数据测试
- 推送通知测试

## 📋 开发说明

### 代码质量
- **ES6+语法**：使用现代JavaScript特性
- **异步处理**：统一的Promise和async/await处理
- **错误处理**：完整的错误捕获和日志记录
- **性能优化**：减少不必要的重复操作

### 设计模式
- **策略模式**：消息处理器使用策略模式
- **观察者模式**：事件监听器使用观察者模式
- **单一职责原则**：每个类和方法职责单一

## ⚠️ 注意事项

- 插件只收集真正的Push API推送消息
- 不会收集页面导航、表单提交等页面事件
- 所有数据仅存储在本地，不会上传到外部服务器
- 需要HTTPS环境才能使用Push API功能

## 🔄 更新日志

### v1.1.0 (重构版本)
- ✅ 代码重构优化，提升可读性和可维护性
- ✅ 模块化设计，职责分离更清晰
- ✅ 性能优化，减少代码冗余
- ✅ 统一错误处理和事件管理
- ✅ 添加测试脚本和文档完善

### v1.0.0 (初始版本)
- ✅ 基础Push API集成
- ✅ 通知显示功能
- ✅ 消息管理界面
- ✅ 数据持久化存储