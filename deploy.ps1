# ============================================================
#  字趣 · 一键部署
#  用法：右键本文件 → 使用 PowerShell 运行
#        或在本目录执行：  powershell -ExecutionPolicy Bypass -File deploy.ps1
#
#  它会：提交当前改动 → 推送到 GitHub。
#  推送成功后等 1~2 分钟，刷新 https://elaijw38.github.io/jiagugouciji/
# ============================================================
$ErrorActionPreference = 'Continue'
$repo = $PSScriptRoot
# 用仓库的规范大小写，避免每次推送都被 GitHub 提示 “repository moved”
$remote = 'https://github.com/elaijw/jiagugouciji.git'

# git 可能不在 PATH（安装后需要重开窗口），这里自己找
$git = 'C:\Program Files\Git\cmd\git.exe'
if (-not (Test-Path $git)) {
    $cmd = Get-Command git -ErrorAction SilentlyContinue
    if ($cmd) { $git = $cmd.Source } else {
        Write-Host '找不到 git，请先安装：winget install --id Git.Git -e' -ForegroundColor Red
        Read-Host '按回车退出'; exit 1
    }
}

function Step($m) { Write-Host ''; Write-Host ('==> ' + $m) -ForegroundColor Cyan }
function Ok($m)   { Write-Host ('    ' + $m) -ForegroundColor Green }
function Warn($m) { Write-Host ('    ' + $m) -ForegroundColor Yellow }

Write-Host '============================================' -ForegroundColor DarkGray
Write-Host '  字趣 · 部署到 GitHub Pages' -ForegroundColor White
Write-Host '============================================' -ForegroundColor DarkGray

# 别让 git 因为要密码而挂住
$env:GIT_TERMINAL_PROMPT = '0'

# ---------- 0. 确保远端存在且地址正确 ----------
Step '检查远端配置'
$remotes = & $git -C $repo remote
if ($remotes -contains 'origin') {
    $cur = & $git -C $repo remote get-url origin
    if ($cur -ne $remote) {
        & $git -C $repo remote set-url origin $remote
        Warn ('远端地址已修正为 ' + $remote)
    } else {
        Ok ('origin = ' + $cur)
    }
} else {
    & $git -C $repo remote add origin $remote
    Ok ('已添加 origin = ' + $remote)
}

# ---------- 1. 提交本地改动 ----------
Step '检查并提交本地改动'
$changes = & $git -C $repo status --porcelain
if ($changes) {
    Write-Host '    待提交的文件：' -ForegroundColor Gray
    $changes | ForEach-Object { Write-Host ('      ' + $_) -ForegroundColor Gray }
    & $git -C $repo add -A | Out-Null
    $msg = '更新：' + (Get-Date -Format 'yyyy-MM-dd HH:mm')
    & $git -C $repo commit -q -m $msg
    Ok ('已提交：' + $msg)
} else {
    Ok '没有新改动，跳过提交'
}

# ---------- 2. 推送 ----------
Step '推送到 GitHub'
# 本机走 Steam++ 本地转发，链路会偶发 408/502（连接被中途掐断），
# 这类错误重试即可，不是配置或权限问题。故带退避重试多次。
$push = $null
$code = 1
$max = 6
for ($i = 1; $i -le $max; $i++) {
    $push = & $git -C $repo push origin main 2>&1
    $code = $LASTEXITCODE
    if ($code -eq 0) { break }

    $t = ($push | Out-String)

    # 历史分叉：远端有本地没有的提交 → 需要用户确认后覆盖
    if ($t -match 'rejected|non-fast-forward|fetch first|behind|Updates were rejected') {
        Warn '远端有本地没有的提交（两边历史分叉）'
        Write-Host '    这通常是因为以前用网页上传过文件。' -ForegroundColor Gray
        Write-Host '    覆盖后，线上内容将完全等于你本地这份完整版本。' -ForegroundColor Gray
        $ans = Read-Host '    强制覆盖远端？(y/N)'
        if ($ans -eq 'y' -or $ans -eq 'Y') {
            & $git -C $repo fetch origin 2>&1 | Out-Null
            $push = & $git -C $repo push --force-with-lease origin main 2>&1
            $code = $LASTEXITCODE
            if ($code -ne 0) {
                Warn '--force-with-lease 仍被拒（远端刚又变过），改用 --force'
                $push = & $git -C $repo push --force origin main 2>&1
                $code = $LASTEXITCODE
            }
        } else {
            Warn '已取消'
            Read-Host '按回车退出'; exit 1
        }
        if ($code -eq 0) { break }
    }

    # 网络抖动：退避后重试
    if ($i -lt $max) {
        $why = if ($t -match '408') { '请求超时(408)' }
               elseif ($t -match '502|503|504') { '网关错误' }
               elseif ($t -match 'unexpected disconnect|hung up') { '连接被中断' }
               else { '网络错误' }
        $wait = 4 * $i
        Warn ("第 $i/$max 次失败（$why），等 $wait 秒重试…")
        Start-Sleep -Seconds $wait
    }
}

# ---------- 3. 结果 ----------
if ($code -eq 0) {
    Write-Host ''
    Ok '推送成功！'
    Write-Host ''
    Write-Host '  等 1~2 分钟，GitHub Pages 会自动重新构建，然后刷新：' -ForegroundColor White
    Write-Host '    https://elaijw38.github.io/jiagugouciji/' -ForegroundColor White
    Write-Host ''
    Write-Host '  想确认资源都在，访问这个地址看有没有 CSS 文本：' -ForegroundColor Gray
    Write-Host '    https://elaijw38.github.io/jiagugouciji/css/theme.css' -ForegroundColor Gray
} else {
    Write-Host ''
    Write-Host '  推送失败，原始信息：' -ForegroundColor Red
    $push | ForEach-Object { Write-Host ('    ' + $_) -ForegroundColor Red }
    Write-Host ''
    Write-Host '  常见原因：' -ForegroundColor Yellow
    Write-Host '    · 要输密码：这里必须填 Personal Access Token（ghp_...），不是登录密码' -ForegroundColor Yellow
    Write-Host '    · 网络：github.com 连不上，检查代理/加速器是否在运行' -ForegroundColor Yellow
}
Write-Host ''
Read-Host '按回车退出'
