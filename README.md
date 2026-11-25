# 扣指成诗

## 目录

- `需求文档/`：PRD、用户故事及需求补充。
- `原型图/`：页面原型图、设计规范。应用运行素材保留在 frontend/public。
- `开发文档/`：启动说明、技术交接、接口及数据库设计文档。
- `frontend/`：React 前端、静态资源、Vite 配置和依赖清单。
- `backend/`：Python 后端及本地 SQLite 数据库（数据库不提交 Git）。
- `test/`：独立测试代码及测试说明。
- `harmony/`：独立鸿蒙工程，内置测试保持原生工具要求的位置。
- `scripts/`：跨项目辅助脚本。

双击根目录 `start-local.cmd`，打开 http://127.0.0.1:5180 。
详细说明见 [本地启动](开发文档/LOCAL-SETUP.md)；产品说明见 [PRD](需求文档/PRD.md)。

在根目录构建前端：`npm --prefix frontend run build`。
单独启动后端：`python backend/server.py`。
GitHub Pages 只提供静态内容，不能运行 Python 登录及数据库接口。
