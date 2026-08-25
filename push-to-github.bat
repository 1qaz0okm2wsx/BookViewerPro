@echo off
chcp 65001 >nul
title 墨阁 BookViewer Pro · 一键推送到 GitHub
cd /d %~dp0

echo ====================================================
echo    墨阁 BookViewer Pro —— 一键推送到 GitHub
echo    （每次上传自动打版：补丁版本 +0.0.1）
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

node --version >nul 2>&1
if errorlevel 1 (
  echo [错误] 未检测到 Node.js（打版脚本需要）。
  echo        请到 https://nodejs.org 安装 LTS 版本后重试。
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
echo [1/6] 初始化本地仓库…
if not exist .git git init -q
git branch -M main

:: 判断是否已有提交：有 → 打版 +0.0.1；没有 → 首推，使用当前版本
git rev-parse --verify HEAD >nul 2>&1
if errorlevel 1 (
  echo [2/6] 首次推送，使用当前版本…
) else (
  echo [2/6] 自动打版（补丁版本 +0.0.1）…
  node scripts\bump-version.mjs
)
for /f "delims=" %%v in ('node -e "const s=require('fs').readFileSync('src/version.ts','utf8');console.log(/\"(\d+\.\d+\.\d+)\"/.exec(s)[1])"') do set "V=%%v"
echo       本次版本：v%V%

echo [3/6] 登记项目文件…
git add .

echo [4/6] 创建提交…
git commit -m "release: v%V% · 墨阁 BookViewer Pro" >nul 2>&1

echo [5/6] 关联远程仓库并打标签 v%V% …
git remote remove origin >nul 2>&1
git remote add origin %REPO%
git tag -f -a "v%V%" -m "release: v%V%" >nul 2>&1

echo [6/6] 推送中（首次会弹出浏览器，请完成 GitHub 授权登录）…
echo.
git push -u origin main --tags

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
  echo  [完成] v%V% 推送成功！打开你的仓库即可查看项目主页。
  echo  提示：在仓库 Settings → Pages → Source 选择
  echo       "GitHub Actions"，约两分钟后自动获得在线演示站。
  echo ====================================================
)
echo.
pause
