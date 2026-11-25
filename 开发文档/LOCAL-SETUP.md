# 本地运行

需要 Python 3 和 Node.js；SQLite 随 Python 自带，无需安装数据库或 Python 第三方包。

双击 `start-local.cmd`，打开 http://127.0.0.1:5180 。先注册，之后登录才进入书架。
启动脚本位于项目根目录。前端代码已移到 frontend；从根目录手动构建请执行 `npm --prefix frontend run build`，手动启动执行 `npm --prefix frontend run dev -- --host 127.0.0.1 --port 5180 --strictPort`。

后端端口 8765，前端端口 5180。关闭两个服务窗口即可停止。下次打开使用同一账号。

数据库位于 `backend/data.sqlite3`，包含 user（密码为 PBKDF2 加盐哈希）、user_state（用户书架、笔记及媒体）、chat_history（用户、笔记本、完整配置、指纹、提问、回答、时间）。卡片配置改变使用新历史；恢复完全相同配置会恢复旧历史。演示 AI 使用本地模板，没有模型费用。

备份整个数据库文件前请先停止后端。不要提交数据库、真实用户内容或密钥到 GitHub。媒体通过 Data URL 保存到 SQLite，单次请求最大 10MB；更大的媒体需要后续实现分块上传。

此版本仅本机运行。GitHub Pages 只能托管静态页面，不能运行 Python 后端；不能用 Pages 链接测试此版本的注册登录。公开上线需另行配置 HTTPS、服务器和登录限流。

原有文件保留原注释；新增功能代码使用中文逐行注释。原有网页示例内容会成为新账号的初始内容。
