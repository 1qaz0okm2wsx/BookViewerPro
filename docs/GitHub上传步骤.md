# GitHub 上传步骤（Windows）

> 本仓库已预置 `.gitignore`（忽略 `node_modules/` 与 `dist/`）与 GitHub Pages 自动部署工作流，按下列步骤即可完成首次推送。

## 一、前置准备

### 1. 安装 Git

从 <https://git-scm.com/download/win> 下载安装，安装时保持默认选项即可。验证：

```powershell
git --version
```

### 2. 配置用户信息（首次使用）

```powershell
git config --global user.name  "你的GitHub用户名"
git config --global user.email "你的邮箱@example.com"
# Windows 换行符建议：
git config --global core.autocrlf true
```

### 3. 配置认证方式（二选一）

**方式 A：HTTPS + Personal Access Token（推荐新手）**

1. 登录 GitHub → 右上角头像 → **Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token**；
2. 勾选 `repo`（私有库）或 `public_repo`（仅公开库），生成后**立即复制保存**（只显示一次）；
2. 首次 `git push` 时用户名填 GitHub 用户名，密码处**粘贴该 Token**。Windows 凭据管理器会自动记住。

**方式 B：SSH 密钥**

```powershell
ssh-keygen -t ed25519 -C "你的邮箱@example.com"   # 一路回车
type $env:USERPROFILE\.ssh\id_ed25519.pub        # 复制公钥
```

将公钥添加到 GitHub → **Settings → SSH and GPG keys → New SSH key**。

## 二、在 GitHub 创建空仓库

1. 登录 GitHub → 右上角 **+ → New repository**；
2. Repository name 填 `bookviewer-pro`（或任意名称）；
3. **不要**勾选 "Add a README"、.gitignore、license（本仓库已自带，勾选会导致推送冲突）；
4. 点击 **Create repository**，页面会显示仓库地址，形如：
   - HTTPS：`https://github.com/你的用户名/bookviewer-pro.git`
   - SSH：`git@github.com:你的用户名/bookviewer-pro.git`

## 三、首次推送

在项目根目录打开 PowerShell：

```powershell
cd C:\path\to\bookviewer-pro

# 1. 初始化仓库（若已是 git 仓库可跳过）
git init
git branch -M main

# 2. 检查将要提交的文件（确认没有 node_modules / dist）
git status

# 3. 提交
git add .
git commit -m "feat: 墨阁 BookViewer Pro 首个版本 —— 阅读/转换/编辑/批注/导出"

# 4. 关联远程仓库（替换为你的地址）
git remote add origin https://github.com/你的用户名/bookviewer-pro.git

# 5. 推送
git push -u origin main
```

推送成功后即可在 `https://github.com/你的用户名/bookviewer-pro` 看到完整项目。

## 四、后续更新流程

```powershell
git add .
git commit -m "fix: 修复 xxx"
git push
```

## 五、（可选）启用 GitHub Pages 在线演示

仓库已内置 `.github/workflows/deploy.yml`，推送后：

1. 打开仓库页 → **Settings → Pages**；
2. **Source** 选择 **GitHub Actions**；
3. 等待 Actions 页面出现绿色 ✔（首次约 2 分钟）；
4. 访问 `https://你的用户名.github.io/bookviewer-pro/` 即为在线版。

> 注意：Pages 托管的是**静态构建产物**，应用本身纯前端运行，访客的数据只存于其自己的浏览器。

## 六、常见问题

| 问题 | 解决 |
| --- | --- |
| `remote: Repository not found` / 403 | HTTPS 推送时密码应为 **Token** 而非账号密码；检查 Token 权限是否含 `repo` |
| 推送提示 `Updates were rejected... non-fast-forward` | 远程有你本地没有的提交（创建仓库时勾选了 README）。执行 `git pull origin main --allow-unrelated-histories` 合并后再推 |
| 提交里混入了 `node_modules` | 确认根目录 `.gitignore` 存在且含 `node_modules/`；已误提交则 `git rm -r --cached node_modules && git commit -m "chore: 移除依赖目录"` |
| 换行符警告 `LF will be replaced by CRLF` | 正常现象，`core.autocrlf true` 下的自动转换，可忽略 |
| 大文件被拒（>100MB） | 不要提交书籍样本/构建产物；确需随仓库分发大文件请用 GitHub Releases 附件 |
| 想设为私有 | 仓库 Settings → General → 底部 **Change repository visibility** |
