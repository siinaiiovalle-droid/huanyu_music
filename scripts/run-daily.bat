@echo off
rem 寰宇音乐台 · 每日生产任务入口（由 Windows 计划任务调用）
rem 作用：清空代理环境变量 → 运行 scripts/daily.js → 输出追加到 build/daily.log
setlocal
cd /d "%~dp0\.."

rem 本机全局代理会让 git push 稳定报 TLS connect error，任务里必须绕过
set HTTP_PROXY=
set HTTPS_PROXY=
set http_proxy=
set https_proxy=
set ALL_PROXY=
set all_proxy=

if not exist build mkdir build

echo ============================================================>> build\daily.log
echo [%date% %time%] 每日生产开始>> build\daily.log
node scripts\daily.js %*>> build\daily.log 2>&1
echo [%date% %time%] 结束，退出码 %errorlevel%>> build\daily.log

endlocal
