@echo off
rem 切换到脚本所在项目目录。
cd /d "%~dp0"
rem 首次运行时安装前端依赖，SQLite 无需安装。
if not exist frontend\node_modules call npm --prefix frontend ci
if errorlevel 1 exit /b 1
rem 后台启动 Python 标准库服务器。
start "Between Lines API" /min python backend\server.py
rem 启动前端，打开终端显示的本地链接。
call npm --prefix frontend run dev -- --host 127.0.0.1 --port 5180 --strictPort
