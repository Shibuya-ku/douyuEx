# DouyuEx Lite

DouyuEx Lite 是基于 [qianjiachun/douyuEx](https://github.com/qianjiachun/douyuEx) 的斗鱼直播观看增强用户脚本。本分支保留 fork 后的观看体验改进，并将精灵球主工具条收敛为签到、续牌、扩展功能和在线弹幕助手四项。

## Lite 保留范围

- 观看增强：弹幕显示与输入辅助、过滤、收藏、历史、倍速、影院比例、音量、截图/GIF、画中画、斗鱼同屏、音频和回放配套。
- 精灵球主工具条：一键签到、一键续牌、扩展功能、在线弹幕助手（点击后打开 `douyuex.com`，这是本次保留的外部入口）。
- 扩展功能：自动最高弹幕色、自动网页全屏、自动最高画质、防页签冻结、阻止 P2P 上传，以及钓鱼。
- 后台任务：等级任务每 35 秒检查，观时奖励每 5 分钟检查；进入房间立即检查，因此已有进度、30 分钟阶段及后续阶段都由服务端状态自动处理。
- fork 改进：最高弹幕色等待异步色板、无每周支持弹窗、无更新红点和自动更新检查。

账号资产管理、批量礼物、第三方统计、跨平台取流和原作者更新服务等与观看无关或需要外部支持的功能已从 Lite 入口和初始化链路移除。播放器底部观看菜单继续保留滤镜、画中画、音频和斗鱼同屏等观看工具。弹幕前缀隐藏、弹幕框拉高和礼物栏切换均为直接切换，不再弹二次确认。

## 安装

1. 安装 Tampermonkey 或兼容的用户脚本管理器。
2. 在本仓库下载构建产物 [dist/douyuex.user.js](dist/douyuex.user.js)。
3. 用该文件更新原脚本，或在脚本管理器中新建脚本并粘贴文件内容保存，然后打开斗鱼直播间。仅启用一个 DouyuEx 版本。

脚本面向斗鱼直播与点播页面，并为直播页内嵌鱼吧同步夜间主题。在线弹幕助手是用户主动点击后才打开的外部入口。签到保留鱼吧补签、固定帖子阅读、固定房间关注后取关及星推等原有子任务；续牌确认后赠送荧光棒，钓鱼启用后按原有周期执行。更新 Lite 前请停用旧版 DouyuEx；即使旧版先挂载了界面，Lite 也会在房间初始化时清理旧节点并重新绑定无确认的前缀/拉高按钮。

## 开发与测试

源码位于 `src/`，构建会生成 `dist/douyuex.js`、`dist/douyuex.user.js` 和 `dist/douyuex_version.txt`。安装 Node.js 后执行以下命令；本次验证使用 Node.js 24.22.3：

```bash
npm ci
npm run build
npm test
```

`npm test` 运行模块、奖励、回放、播放器和集成测试。浏览器测试还需本地可用的 Playwright 和浏览器：

```bash
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run test:browser
```

`npm run test:browser` 使用本地 fixture 检查两个构建产物的工具条、偏好、动态 DOM、播放器菜单及错误隔离。也可设置 `PLAYWRIGHT_MODULE` 指向已有 Playwright 模块目录，设置 `BROWSER_EXECUTABLE` 指向已有浏览器执行文件。真实公开页面冒烟测试命令和限制见 [docs/Lite开发与测试报告.md](docs/Lite开发与测试报告.md)。

开发过程中不自动推送、发布或安装脚本；提交前请检查 `git diff --check` 和两个构建产物版本一致性。

## 归属

本 Lite 分支保留原作者的代码归属和 MIT 许可。Lite 精简范围、实现记录和测试边界见：

- [Lite 精简需求与开发方案](docs/Lite精简需求与开发方案.md)
- [Lite 开发与测试报告](docs/Lite开发与测试报告.md)
- [Fork 修改梳理](docs/Fork修改梳理.md)
- [产品模块梳理](docs/产品模块梳理.md)
