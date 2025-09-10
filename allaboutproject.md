# Push通知收集器 - 项目说明

## 项目简介

这是一个Chrome浏览器扩展，用于自动收集和监控网页的Push通知消息。该扩展能够检测网站上的Push API订阅，收集推送通知，并提供统一的管理界面。

## 架构说明

### 核心组件

1. **popup.html/popup.js** - 用户界面，显示收集到的通知消息
2. **background.js** - Service Worker，处理Push事件和消息存储
3. **content.js** - 内容脚本，检测网页中的Push API订阅
4. **manifest.json** - 扩展配置文件

### 数据流

```
网页Push API → content.js → background.js → popup.js
     ↓              ↓            ↓           ↓
  订阅检测      消息传递      事件处理    界面显示
```

## 主要功能

### 1. Push订阅检测
- 自动检测网页中的Service Worker注册
- 监控Push API订阅创建和更新
- 记录订阅端点和密钥信息

### 2. 通知消息收集
- 捕获Push事件并解析通知数据
- 支持标准Push消息和声明式Push消息
- 自动存储消息到本地存储

### 3. 消息管理界面
- 实时显示收集到的通知消息
- 支持按类型、时间、来源排序
- 提供搜索和过滤功能
- 支持消息导出为CSV格式

### 4. 统计信息
- 总消息数量统计
- 今日消息数量统计
- Push订阅数量统计

## 技术实现

### Push API支持检测
```javascript
const support = {
    serviceWorker: 'serviceWorker' in navigator,
    pushManager: 'PushManager' in window,
    notifications: 'Notification' in window
};
```

### 消息存储结构
```javascript
const message = {
    id: string,           // 唯一标识符
    title: string,        // 通知标题
    body: string,         // 通知内容
    icon: string,         // 图标URL
    url: string,          // 来源URL
    timestamp: string,    // 时间戳
    type: string,         // 消息类型
    status: string,       // 状态
    data: object          // 附加数据
};
```

### 订阅信息结构
```javascript
const subscription = {
    endpoint: string,     // 订阅端点
    keys: object,         // 加密密钥
    options: object,      // 订阅选项
    scope: string,        // Service Worker作用域
    url: string,          // 来源URL
    timestamp: string     // 创建时间
};
```

## 使用方式

1. **安装扩展** - 在Chrome中加载扩展
2. **访问网站** - 访问支持Push API的网站
3. **自动检测** - 扩展自动检测Push订阅
4. **查看消息** - 点击扩展图标查看收集的消息
5. **管理数据** - 使用界面功能管理消息数据

## 常见问题

### Q: 为什么Push订阅数量显示为0？
A: 可能的原因：
- 网站尚未注册Push订阅
- 浏览器通知权限被禁用
- Service Worker未正确注册
- 扩展权限不足

### Q: 如何测试Push通知功能？
A: 使用扩展内置的"Test Push"按钮发送测试通知

### Q: 消息数据存储在哪里？
A: 使用Chrome的local storage API，数据存储在浏览器本地

## 调试建议

1. **检查控制台日志** - 查看详细的调试信息
2. **验证权限** - 确保扩展有必要的权限
3. **测试网站** - 使用支持Push API的测试网站
4. **检查网络** - 确保网络连接正常

## 更新日志

- v1.0.0 - 初始版本，基础Push通知收集功能
- v2.0.0 - 极客风格UI重构和订阅数量修复
  - 全新的Cyberpunk/极客风格界面设计
  - 深色主题配合霓虹绿色配色方案
  - 科技感动画效果和视觉元素
  - 修复Push订阅数量显示为0的问题
  - 优化数据加载和实时更新逻辑
  - 改进用户界面交互体验
