@echo off
chcp 65001 >nul
title 墨阁 BookViewer Pro · 一键推送到 GitHub
cd /d %~dp0

echo ====================================================
echo    墨阁 BookViewer Pro —— 一键推送到 GitHub
echo ====================================================
echo.

git --version >nul 2>&1
if errorlevel 1 (
  echo [错误] 未检测到 Git。
  echo        请到 https://git-scm.com/download/win 下载安装，
  echo        安装完成后重新双击本脚本。
  echo.
  pause
  exit /b 1
)

:: 首次使用 Git 需要登记身份
for /f "delims=" %%n in ('git config user.name 2^>nul') do set "GN=%%n"
if "%GN%"=="" (
  echo 首次使用 Git，需要登记你的身份（仅保存在本机）：
  set /p GN=  你的名字: 
  set /p GE=  你的邮箱: 
  git config user.name "%GN%"
  git config user.email "%GE%"
  echo.
)

set /p REPO=请输入 GitHub 仓库地址（如 https://github.com/you/bookviewer-pro.git）: 
if "%REPO%"=="" (
  echo [错误] 未输入仓库地址。
  pause
  exit /b 1
)

echo.
echo [1/5] 初始化本地仓库…
if not exist .git git init -q
git branch -M main

echo [2/5] 登记项目文件…
git add .

echo [3/5] 创建提交…
git commit -m "feat: 墨阁 BookViewer Pro —— 阅读/转换/编辑/批注/导出" >nul 2>&1

echo [4/5] 关联远程仓库…
git remote remove origin >nul 2>&1
git remote add origin %REPO%

echo [5/5] 推送中（首次会弹出浏览器，请完成 GitHub 授权登录）…
echo.
git push -u origin main

if errorlevel 1 (
  echo.
  echo [未完成] 推送失败，常见原因与对策：
  echo   1. 远程仓库不是空的 —— 创建仓库时勾选了 README/LICENSE，
  echo      请删除该仓库重新创建一个空仓库，再运行本脚本；
  echo   2. 授权窗口被关闭 —— 直接再运行一次本脚本，在弹出的
  echo      浏览器页面中登录并授权即可；
  echo   3. 地址拼写有误 —— 确认用户名与仓库名，形如
  echo      https://github.com/用户名/bookviewer-pro.git
) else (
  echo.
  echo ====================================================
  echo  [完成] 推送成功！打开你的仓库即可查看项目主页。
  echo  提示：在仓库 Settings → Pages → Source 选择
  echo       "GitHub Actions"，约两分钟后自动获得在线演示站。
  echo ====================================================
)
echo.
pause
