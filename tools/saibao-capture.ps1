#requires -Version 5.1
<#
  王者赛宝 · 小组赛备战页抓取

  只做三件事：
    1. 用 UIA 找到「全部赛程 → 循环赛 → 1..4 组 → 已结束卡片 → 备战详情」；
    2. 逐局截图（上半屏 + 选手行）；
    3. 把页面元数据写到 capture.json。

  像素切图、头像聚类、选手头像匹配由 tools/saibao_icons.py 完成。
  安全：只点击白名单文本；绝不点击 重置比赛 / 改判比分 / 交换红蓝方 / 邀请备战。
#>
param(
  [Parameter(Mandatory = $true)][string]$SessionDir,
  [string]$Groups = "1,2,3,4",
  [int]$MaxSeries = 0,
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Text;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public class SaibaoNative {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr GetWindowDC(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hWnd, IntPtr hdc);

  public struct RECT { public int Left, Top, Right, Bottom; }
  public struct POINT { public int X, Y; }

  public static bool SaveShot(IntPtr hWnd, string path) {
    RECT r;
    if (!GetWindowRect(hWnd, out r)) return false;
    int w = r.Right - r.Left, h = r.Bottom - r.Top;
    if (w <= 0 || h <= 0) return false;
    using (var bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb))
    using (var g = Graphics.FromImage(bmp)) {
      IntPtr hdc = g.GetHdc();
      bool ok = PrintWindow(hWnd, hdc, 2);
      g.ReleaseHdc(hdc);
      bmp.Save(path, ImageFormat.Png);
      return ok;
    }
  }
}
"@

[void][SaibaoNative]::SetProcessDPIAware()
$script:Win = [IntPtr]::Zero
$script:Pages = New-Object System.Collections.ArrayList
$script:Completed = @{}
$script:Quiet = [bool]$Quiet
$script:DonePath = Join-Path $SessionDir "capture.json"
$script:ProgressPath = Join-Path $SessionDir "progress.json"

function Write-Log([string]$msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $msg
  Write-Host $line
  Add-Content -Path (Join-Path $SessionDir "capture.log") -Value $line -Encoding UTF8
}

function Save-Progress([string]$phase, [string]$group, [int]$idx, [int]$total, [string]$seriesId, [int]$game, [string]$message) {
  $pct = if ($total -gt 0) { [Math]::Round([Math]::Min(100, $idx / $total * 100), 1) } else { 0 }
  $obj = [ordered]@{
    phase = $phase; group = $group; seriesIndex = $idx; seriesTotal = $total;
    seriesId = $seriesId; game = $game; message = $message; percent = $pct;
    completed = @($script:Completed.Keys);
    updatedAt = (Get-Date).ToString("o")
  }
  $obj | ConvertTo-Json -Depth 6 | Set-Content -Path $script:ProgressPath -Encoding UTF8
}

function Check-Control {
  if (Test-Path (Join-Path $SessionDir "stop.flag")) { throw "STOPPED" }
  while (Test-Path (Join-Path $SessionDir "pause.flag")) {
    Save-Progress "paused" "" 0 0 "" 0 "已暂停，点继续后从下一场开始"
    Start-Sleep -Milliseconds 700
    if (Test-Path (Join-Path $SessionDir "stop.flag")) { throw "STOPPED" }
  }
}

function Find-SaibaoWindow {
  $script:hits = @()
  $cb = [SaibaoNative+EnumWindowsProc]{
    param($h, $l)
    if ([SaibaoNative]::IsWindowVisible($h)) {
      $sb = New-Object System.Text.StringBuilder 256
      [void][SaibaoNative]::GetWindowText($h, $sb, 256)
      if ($sb.ToString() -eq "王者赛宝") { $script:hits += $h }
    }
    return $true
  }
  [void][SaibaoNative]::EnumWindows($cb, [IntPtr]::Zero)
  if ($script:hits.Count -eq 0) { throw "找不到「王者赛宝」窗口，请先把小程序打开" }
  $script:Win = $script:hits[0]
  [void][SaibaoNative]::ShowWindow($script:Win, 9)
  if ($script:Quiet) {
    [void][SaibaoNative]::ShowWindow($script:Win, 4)
    Write-Log "安静模式：不抢前台，鼠标点击后回原位"
  } else {
    [void][SaibaoNative]::SetForegroundWindow($script:Win)
  }
  Start-Sleep -Milliseconds 700
  $r = New-Object SaibaoNative+RECT
  [void][SaibaoNative]::GetWindowRect($script:Win, [ref]$r)
  $script:WinLeft = $r.Left; $script:WinTop = $r.Top
  $script:WinW = $r.Right - $r.Left; $script:WinH = $r.Bottom - $r.Top
  Write-Log ("窗口 {0} @ {1},{2} {3}x{4}" -f $script:Win, $script:WinLeft, $script:WinTop, $script:WinW, $script:WinH)
}

function Get-UiaAll {
  $root = [System.Windows.Automation.AutomationElement]::FromHandle($script:Win)
  return $root.FindAll([System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition)
}

function Find-Text([string]$name, [int]$minY = -99999, [int]$maxY = 99999, [switch]$Clickable) {
  $all = Get-UiaAll
  for ($i = 0; $i -lt $all.Count; $i++) {
    $e = $all.Item($i)
    if ($e.Current.ControlType -ne [System.Windows.Automation.ControlType]::Text) { continue }
    if ($e.Current.Name -ne $name) { continue }
    $r = $e.Current.BoundingRectangle
    if ($e.Current.IsOffscreen) { continue }
    if ($r.Y -lt $minY -or $r.Y -gt $maxY) { continue }
    if ($Clickable) {
      $p = New-Object System.Windows.Point
      if (-not $e.TryGetClickablePoint([ref]$p)) { continue }
      if ($p.X -lt $script:WinLeft -or $p.X -gt ($script:WinLeft + $script:WinW)) { continue }
      if ($p.Y -lt $script:WinTop -or $p.Y -gt ($script:WinTop + $script:WinH)) { continue }
    }
    return $e
  }
  return $null
}

function Click-At([int]$x, [int]$y) {
  if (-not $script:Quiet) { [void][SaibaoNative]::SetForegroundWindow($script:Win) }
  $old = New-Object SaibaoNative+POINT
  $hadOld = [SaibaoNative]::GetCursorPos([ref]$old)
  [void][SaibaoNative]::SetCursorPos($x, $y)
  Start-Sleep -Milliseconds 130
  [SaibaoNative]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 80
  [SaibaoNative]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
  if ($script:Quiet -and $hadOld) { [void][SaibaoNative]::SetCursorPos($old.X, $old.Y) }
  Start-Sleep -Milliseconds 700
}

function Click-Element($e) {
  $p = New-Object System.Windows.Point
  if (-not $e.TryGetClickablePoint([ref]$p)) { throw "元素不可点击：$($e.Current.Name)" }
  Click-At ([int]$p.X) ([int]$p.Y)
}

function Click-Text([string]$name) {
  $e = Find-Text $name
  if (-not $e) { throw "找不到按钮：$name" }
  Click-Element $e
}

function Click-TextCenter([string]$name, [int]$minY = -99999, [int]$maxY = 99999) {
  $e = Find-Text $name $minY $maxY
  if (-not $e) { throw "找不到文字：$name" }
  $r = $e.Current.BoundingRectangle
  Click-At ([int]($r.X + $r.Width / 2)) ([int]($r.Y + $r.Height / 2))
}

function Click-Back {
  Click-At ($script:WinLeft + 70) ($script:WinTop + 78)
  Start-Sleep -Milliseconds 900
}

function Go-Schedule {
  for ($i = 0; $i -lt 7; $i++) {
    # 备战页：有「禁用 / 选择」两排
    $banLbl = Find-Text "禁用" ($script:WinTop + 900) ($script:WinTop + 1300)
    $pickLbl = Find-Text "选择" ($script:WinTop + 900) ($script:WinTop + 1300)
    if ($banLbl -and $pickLbl) { Click-Back; continue }
    # 已经在「全部赛程」页：标题在顶部，且不是按钮
    $title = Find-Text "全部赛程" ($script:WinTop + 20) ($script:WinTop + 150)
    if ($title) { return }
    # 赛事首页的「全部赛程」入口
    $e = Find-Text "全部赛程" -Clickable
    if ($e) {
      try {
        Click-Element $e
        Start-Sleep -Seconds 2
        $title = Find-Text "全部赛程" ($script:WinTop + 20) ($script:WinTop + 150)
        if ($title) { return }
      } catch { }
    }
    if (Find-Text "备战详情" -Clickable) {
      Click-At ($script:WinLeft + 20) ($script:WinTop + 180)
      Start-Sleep -Milliseconds 700
      continue
    }
    Click-Back
  }
  throw "回不到赛事首页，找不到「全部赛程」"
}

function Scroll-To($e) {
  try {
    $pat = $e.GetCurrentPattern([System.Windows.Automation.ScrollItemPattern]::Pattern)
    $pat.ScrollIntoView()
  } catch { /* 部分节点不支持，忽略 */ }
  Start-Sleep -Milliseconds 900
}

function Get-FinishedCards {
  $all = Get-UiaAll
  $ended = @(); $dates = @()
  for ($i = 0; $i -lt $all.Count; $i++) {
    $e = $all.Item($i)
    if ($e.Current.ControlType -ne [System.Windows.Automation.ControlType]::Text) { continue }
    $n = $e.Current.Name
    if ($n -eq "已结束") { $ended += $e }
    elseif ($n -match '^\d{1,2}/\d{1,2}\s+\d{1,2}:\d{2}$') { $dates += $e }
  }
  $out = @()
  foreach ($e in $ended) {
    $r = $e.Current.BoundingRectangle
    $d = $null
    foreach ($x in $dates) {
      $xr = $x.Current.BoundingRectangle
      if ([Math]::Abs($xr.Y - $r.Y) -lt 14 -and $xr.X -lt $r.X -and $xr.X -gt ($r.X - 260)) { $d = $x; break }
    }
    if ($d) {
      $out += [pscustomobject]@{ End = $e; Date = $d; X = [int]$r.X; Y = [int]$r.Y; DateText = $d.Current.Name }
    }
  }
  $seen = @{}
  $uniq = @()
  foreach ($c in ($out | Sort-Object Y, X)) {
    $k = "{0}:{1}" -f [int]($c.X / 20), [int]($c.Y / 20)
    if (-not $seen.ContainsKey($k)) { $seen[$k] = $true; $uniq += $c }
  }
  return $uniq
}

function Find-CardAgain([string]$dateText, [int]$nearY) {
  $cards = Get-FinishedCards
  $best = $null; $bestD = 999999
  foreach ($c in $cards) {
    if ($c.DateText -ne $dateText) { continue }
    $d = [Math]::Abs($c.Y - $nearY)
    if ($d -lt $bestD) { $bestD = $d; $best = $c }
  }
  if ($best) { return $best }
  return ($cards | Where-Object { $_.DateText -eq $dateText } | Select-Object -First 1)
}

function Get-ModalContainer {
  $red = Find-Text "红方"
  if (-not $red) { return $null }
  $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  $node = $red
  for ($i = 0; $i -lt 8; $i++) {
    $node = $walker.GetParent($node)
    if (-not $node) { break }
    $kids = $node.FindAll([System.Windows.Automation.TreeScope]::Descendants,
      [System.Windows.Automation.Condition]::TrueCondition)
    for ($j = 0; $j -lt $kids.Count; $j++) {
      if ($kids.Item($j).Current.Name -eq "备战详情") { return $node }
    }
  }
  return $null
}

function Find-InScope($scope, [string]$name) {
  for ($i = 0; $i -lt $scope.Count; $i++) {
    $e = $scope.Item($i)
    if ($e.Current.ControlType -ne [System.Windows.Automation.ControlType]::Text) { continue }
    if ($e.Current.IsOffscreen) { continue }
    if ($e.Current.Name -eq $name) { return $e }
  }
  return $null
}

<# 一次把当前页所有 Text 节点抓成快照；同一页后续查询都走快照，避免反复全树扫描。 #>
function Get-TextSnapshot {
  $all = Get-UiaAll
  $rows = New-Object System.Collections.ArrayList
  for ($i = 0; $i -lt $all.Count; $i++) {
    $e = $all.Item($i)
    if ($e.Current.ControlType -ne [System.Windows.Automation.ControlType]::Text) { continue }
    $r = $e.Current.BoundingRectangle
    [void]$rows.Add([pscustomobject]@{
      Name = $e.Current.Name; X = [int]$r.X; Y = [int]$r.Y;
      W = [int]$r.Width; H = [int]$r.Height;
      Off = [bool]$e.Current.IsOffscreen; El = $e
    })
  }
  return $rows
}

function Snap-Find($snap, [string]$name) {
  foreach ($r in $snap) {
    if ($r.Off) { continue }
    if ($r.Name -eq $name) { return $r }
  }
  return $null
}

function Get-PageHeaderFromSnap($snap) {
  $round = ""; $date = ""; $winner = ""; $left = ""; $right = ""
  $scoreL = 0; $scoreR = 0; $duration = ""
  foreach ($r in $snap) {
    if ($r.Off) { continue }
    $n = $r.Name.Trim()
    $ry = $r.Y - $script:WinTop
    if ($n -match '^第\d+轮') { $round = $n }
    if ($n -match '^\d{1,2}/\d{1,2}\s+\d{1,2}:\d{2}$') { $date = $n }
    if ($n -eq "胜利") { $winner = if (($r.X - $script:WinLeft) -lt ($script:WinW / 2)) { "left" } else { "right" } }
    if ($n -match '^(\d+)\s*:\s*(\d+)$') { $scoreL = [int]$Matches[1]; $scoreR = [int]$Matches[2] }
    if ($n -match '^\d{1,2}:\d{2}$' -and $ry -gt 380 -and $ry -lt 560) { $duration = $n }
    if ($ry -gt 380 -and $ry -lt 560) {
      if ($r.X -lt ($script:WinLeft + 380)) {
        if ($n.Length -ge 2 -and $n -notmatch '^(红方|蓝方|已结束|BO\d|第\d+轮|2026PKC.*)$' -and $n -notmatch '^\d{1,2}/\d{1,2}') { $left = $n }
      } elseif ($r.X -gt ($script:WinLeft + 470)) {
        if ($n.Length -ge 2 -and $n -notmatch '^(红方|蓝方|已结束|BO\d|第\d+轮|2026PKC.*)$' -and $n -notmatch '^\d{1,2}/\d{1,2}') { $right = $n }
      }
    }
    if ($n -match '^\d+$' -and $ry -gt 380 -and $ry -lt 560) {
      if ($r.X -lt ($script:WinLeft + 460)) { $scoreL = [int]$n } elseif ($r.X -gt ($script:WinLeft + 460)) { $scoreR = [int]$n }
    }
  }
  return [pscustomobject]@{
    Round = $round; Date = $date; Winner = $winner; Left = $left; Right = $right;
    ScoreL = $scoreL; ScoreR = $scoreR; Duration = $duration
  }
}

function Get-PlayerNamesFromSnap($snap) {
  $left = @(); $right = @()
  foreach ($r in $snap) {
    if ($r.Off) { continue }
    $n = $r.Name.Trim()
    $ry = $r.Y - $script:WinTop
    if ($ry -lt [int]($script:WinH * 0.72)) { continue }
    if ($n.Length -lt 2 -or $n.Length -gt 24) { continue }
    if ($n -match '^[\d/\.\s:kK%]+$') { continue }
    if ($n -match '^(总览|数据|输出伤害|承受伤害|经济|参团|KDA|胜利|失败|禁用|选择|资源|总经济)$') { continue }
    if ($r.X -lt ($script:WinLeft + 430)) { $left += [pscustomobject]@{ Name = $n; Y = $r.Y } }
    elseif ($r.X -gt ($script:WinLeft + 450)) { $right += [pscustomobject]@{ Name = $n; Y = $r.Y } }
  }
  $left = $left | Sort-Object Y | Select-Object -First 5
  $right = $right | Sort-Object Y | Select-Object -First 5
  return [pscustomobject]@{ Left = @($left | ForEach-Object { $_.Name }); Right = @($right | ForEach-Object { $_.Name }) }
}

function Get-ModalInfo {
  $container = Get-ModalContainer
  $all = if ($container) {
    $container.FindAll([System.Windows.Automation.TreeScope]::Descendants,
      [System.Windows.Automation.Condition]::TrueCondition)
  } else {
    Get-UiaAll
  }
  $header = $null
  for ($i = 0; $i -lt $all.Count; $i++) {
    $e = $all.Item($i)
    if ($e.Current.ControlType -ne [System.Windows.Automation.ControlType]::Text) { continue }
    if ($e.Current.IsOffscreen) { continue }
    if ($e.Current.Name -match '^【第(\d+)轮】') { $header = $e; break }
  }
  if (-not $header) { return $null }
  $hr = $header.Current.BoundingRectangle
  $round = ""; $group = ""
  if ($header.Current.Name -match '【第(\d+)轮】\s*第(\d+)组') {
    $round = "第" + $Matches[1] + "轮"; $group = $Matches[2] + "组"
  }
  $teamY0 = $hr.Y + 55
  $teamY1 = $hr.Y + 145
  $prepareEl = Find-InScope $all "备战详情"
  if ($prepareEl) {
    $ay = $prepareEl.Current.BoundingRectangle.Y
    $teamY0 = $ay - 130
    $teamY1 = $ay - 30
  }
  # 弹窗里的「红方 / 蓝方」是唯一锚点：赛程卡片没有这两个字，
  # 可以避开弹窗背后同 Y 的其它卡片文字。
  $red = Find-InScope $all "红方"
  $blue = Find-InScope $all "蓝方"
  $leftName = ""; $rightName = ""
  $allTexts = @()
  for ($i = 0; $i -lt $all.Count; $i++) {
    $e = $all.Item($i)
    if ($e.Current.ControlType -ne [System.Windows.Automation.ControlType]::Text) { continue }
    if ($e.Current.IsOffscreen) { continue }
    $allTexts += $e
  }
  if ($red) {
    $rr = $red.Current.BoundingRectangle
    foreach ($e in $allTexts) {
      $r = $e.Current.BoundingRectangle
      if ($r.X -lt ($rr.X - 160) -or $r.X -gt ($rr.X + 160)) { continue }
      if ($r.Y -lt ($rr.Y - 120) -or $r.Y -gt ($rr.Y - 20)) { continue }
      $n = $e.Current.Name.Trim()
      if ($n.Length -ge 2 -and $n -notmatch '^\d+$' -and $n -notmatch '办赛指引|开始比赛|分享赛事|参赛战队|赛事数据|比赛动态|管理|红方|蓝方') { $leftName = $n; break }
    }
  }
  if ($blue) {
    $br = $blue.Current.BoundingRectangle
    foreach ($e in $allTexts) {
      $r = $e.Current.BoundingRectangle
      if ($r.X -lt ($br.X - 160) -or $r.X -gt ($br.X + 160)) { continue }
      if ($r.Y -lt ($br.Y - 120) -or $r.Y -gt ($br.Y - 20)) { continue }
      $n = $e.Current.Name.Trim()
      if ($n.Length -ge 2 -and $n -notmatch '^\d+$' -and $n -notmatch '办赛指引|开始比赛|分享赛事|参赛战队|赛事数据|比赛动态|管理|红方|蓝方') { $rightName = $n; break }
    }
  }
  if ($leftName -and $rightName) {
    return [pscustomobject]@{ Round = $round; Group = $group; Left = $leftName; Right = $rightName; HeaderY = [int]$hr.Y }
  }
  $teams = @()
  for ($i = 0; $i -lt $all.Count; $i++) {
    $e = $all.Item($i)
    if ($e.Current.ControlType -ne [System.Windows.Automation.ControlType]::Text) { continue }
    if ($e.Current.IsOffscreen) { continue }
    $r = $e.Current.BoundingRectangle
    if ($r.Y -lt $teamY0 -or $r.Y -gt $teamY1) { continue }
    $n = $e.Current.Name.Trim()
    if (-not $n -or $n -match '^(红方|蓝方|VS|备战详情|已结束|邀请备战)$') { continue }
    if ($n -match '^\d+$' -or $n -match '^\d{1,2}/\d{1,2}') { continue }
    if ($n -match '办赛指引|开始比赛|分享赛事|赛事进行中|参赛战队|赛事数据|比赛动态|管理') { continue }
    if ($r.X -lt ($script:WinLeft + 430) -or $r.X -gt ($script:WinLeft + 450)) { $teams += [pscustomobject]@{ Name = $n; X = [int]$r.X } }
  }
  $teams = $teams | Sort-Object X
  $left = if ($teams.Count -ge 1) { $teams[0].Name } else { "" }
  $right = if ($teams.Count -ge 2) { $teams[$teams.Count - 1].Name } else { "" }
  return [pscustomobject]@{ Round = $round; Group = $group; Left = $left; Right = $right; HeaderY = [int]$hr.Y }
}

function Get-PageHeader {
  $all = Get-UiaAll
  $round = ""; $date = ""; $winner = ""
  $left = ""; $right = ""
  $scoreL = 0; $scoreR = 0
  $duration = ""
  for ($i = 0; $i -lt $all.Count; $i++) {
    $e = $all.Item($i)
    if ($e.Current.ControlType -ne [System.Windows.Automation.ControlType]::Text) { continue }
    if ($e.Current.IsOffscreen) { continue }
    $n = $e.Current.Name.Trim()
    $r = $e.Current.BoundingRectangle
    $ry = $r.Y - $script:WinTop
    if ($n -match '^第\d+轮') { $round = $n }
    if ($n -match '^\d{1,2}/\d{1,2}\s+\d{1,2}:\d{2}$') { $date = $n }
    if ($n -eq "胜利") { $winner = if (($r.X - $script:WinLeft) -lt ($script:WinW / 2)) { "left" } else { "right" } }
    if ($n -match '^(\d+)\s*:\s*(\d+)$') { $scoreL = [int]$Matches[1]; $scoreR = [int]$Matches[2] }
    if ($n -match '^\d{1,2}:\d{2}$' -and $ry -gt 380 -and $ry -lt 560) { $duration = $n }
    if ($ry -gt 380 -and $ry -lt 560) {
      if ($r.X -lt ($script:WinLeft + 380)) { if ($n.Length -ge 2 -and $n -notmatch '^(红方|蓝方|已结束|BO\d|第\d+轮|2026PKC.*)$' -and $n -notmatch '^\d{1,2}/\d{1,2}') { $left = $n } }
      elseif ($r.X -gt ($script:WinLeft + 470)) { if ($n.Length -ge 2 -and $n -notmatch '^(红方|蓝方|已结束|BO\d|第\d+轮|2026PKC.*)$' -and $n -notmatch '^\d{1,2}/\d{1,2}') { $right = $n } }
    }
    if ($n -match '^\d+$' -and $ry -gt 380 -and $ry -lt 560) {
      if ($r.X -lt ($script:WinLeft + 460)) { $scoreL = [int]$n } elseif ($r.X -gt ($script:WinLeft + 460)) { $scoreR = [int]$n }
    }
  }
  return [pscustomobject]@{
    Round = $round; Date = $date; Winner = $winner; Left = $left; Right = $right;
    ScoreL = $scoreL; ScoreR = $scoreR; Duration = $duration
  }
}

function Capture-Page([string]$path) {
  [void][SaibaoNative]::SaveShot($script:Win, $path)
}

function Wheel([int]$delta, [int]$times = 1) {
  [void][SaibaoNative]::SetCursorPos(($script:WinLeft + [int]($script:WinW / 2)), ($script:WinTop + [int]($script:WinH / 2)))
  for ($i = 0; $i -lt $times; $i++) {
    [SaibaoNative]::mouse_event(0x0800, 0, 0, $delta, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 120
  }
}

function Drag-Horizontal([int]$fromX, [int]$toX, [int]$y) {
  [void][SaibaoNative]::SetCursorPos(($script:WinLeft + $fromX), ($script:WinTop + $y))
  Start-Sleep -Milliseconds 100
  [SaibaoNative]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
  $steps = 12
  for ($i = 1; $i -le $steps; $i++) {
    $x = $fromX + [int](($toX - $fromX) * $i / $steps)
    [void][SaibaoNative]::SetCursorPos(($script:WinLeft + $x), ($script:WinTop + $y))
    Start-Sleep -Milliseconds 28
  }
  [SaibaoNative]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 900
}

function Get-VisibleRounds {
  $all = Get-UiaAll
  $out = @()
  for ($i = 0; $i -lt $all.Count; $i++) {
    $e = $all.Item($i)
    if ($e.Current.ControlType -ne [System.Windows.Automation.ControlType]::Text) { continue }
    if ($e.Current.IsOffscreen) { continue }
    if ($e.Current.Name -notmatch '^第[1-7]轮$') { continue }
    $r = $e.Current.BoundingRectangle
    $ry = $r.Y - $script:WinTop
    if ($ry -lt 440 -or $ry -gt 620) { continue }
    $out += [pscustomobject]@{ Name = $e.Current.Name; X = [int]$r.X; Y = [int]$r.Y }
  }
  return $out | Sort-Object X
}

function Get-PlayerNames {
  $all = Get-UiaAll
  $left = @(); $right = @()
  for ($i = 0; $i -lt $all.Count; $i++) {
    $e = $all.Item($i)
    if ($e.Current.ControlType -ne [System.Windows.Automation.ControlType]::Text) { continue }
    if ($e.Current.IsOffscreen) { continue }
    $n = $e.Current.Name.Trim()
    $r = $e.Current.BoundingRectangle
    $ry = $r.Y - $script:WinTop
    if ($ry -lt 700) { continue }
    if ($n.Length -lt 2 -or $n.Length -gt 24) { continue }
    if ($n -match '^[\d/\.\s:kK%]+$') { continue }
    if ($n -match '^(总览|数据|输出伤害|承受伤害|经济|参团|KDA|胜利|失败|禁用|选择|资源|总经济)$') { continue }
    if ($r.X -lt ($script:WinLeft + 430)) { $left += [pscustomobject]@{ Name = $n; Y = [int]$r.Y } }
    elseif ($r.X -gt ($script:WinLeft + 450)) { $right += [pscustomobject]@{ Name = $n; Y = [int]$r.Y } }
  }
  $left = $left | Sort-Object Y | Select-Object -First 5
  $right = $right | Sort-Object Y | Select-Object -First 5
  return [pscustomobject]@{ Left = @($left | ForEach-Object { $_.Name }); Right = @($right | ForEach-Object { $_.Name }) }
}

function Save-CaptureJson {
  $obj = [ordered]@{
    event = "2026PKC秋季赛"
    stage = "循环赛"
    capturedAt = (Get-Date).ToString("o")
    pages = @($script:Pages)
  }
  $obj | ConvertTo-Json -Depth 12 | Set-Content -Path $script:DonePath -Encoding UTF8
}

function Process-Card($card, [string]$group, [int]$idx, [int]$total) {
  Check-Control
  # 上一场如果还停在弹窗，先点遮罩关掉，避免下一张卡点不中
  if (Find-Text "备战详情" -Clickable) {
    Click-At ($script:WinLeft + 20) ($script:WinTop + 180)
    Start-Sleep -Milliseconds 600
  }
  Scroll-To $card.End
  $again = Find-CardAgain $card.DateText $card.Y
  if (-not $again) { Write-Log "卡片重定位失败：$($card.DateText)"; return }
  $opened = $false
  foreach ($el in @($again.End, $again.Date)) {
    $p = New-Object System.Windows.Point
    if (-not $el.TryGetClickablePoint([ref]$p)) { continue }
    Click-At ([int]$p.X - 62) ([int]$p.Y - 155)
    Start-Sleep -Milliseconds 1500
    if (Find-Text "备战详情" -Clickable) { $opened = $true; break }
    Click-At ([int]$p.X - 62) ([int]$p.Y - 175)
    Start-Sleep -Milliseconds 1200
    if (Find-Text "备战详情" -Clickable) { $opened = $true; break }
  }
  if (-not $opened) {
    Write-Log "没有打开比赛弹窗：$($card.DateText)"
    Click-At ($script:WinLeft + 20) ($script:WinTop + 180)
    return
  }

  $modal = Get-ModalInfo
  if (-not $modal) {
    Write-Log "没有打开比赛弹窗：$($card.DateText)"
    Click-At ($script:WinLeft + 20) ($script:WinTop + 180)
    return
  }
  $prepare = $null
  for ($t = 0; $t -lt 3; $t++) {
    $modalSnap = Get-TextSnapshot
    $prepare = Snap-Find $modalSnap "备战详情"
    if ($prepare) { break }
    Start-Sleep -Milliseconds 600
  }
  if (-not $prepare) {
    Write-Log "弹窗里没有备战详情：$seriesId"
    Click-At ($script:WinLeft + 20) ($script:WinTop + 180)
    return
  }
  Click-Element $prepare.El
  Start-Sleep -Seconds 3

  $snap = Get-TextSnapshot
  $noData = Snap-Find $snap "暂无数据"
  if ($noData) {
    Write-Log "暂无数据（判负/未打）：$seriesId"
    $script:Pages.Add([ordered]@{
      id = "$seriesId-g1"; seriesId = $seriesId; group = $group; round = $modal.Round;
      teams = @($mLeft, $mRight); gameNo = 1; noData = $true;
      winner = ""; duration = ""; shot = ""; playerShot = ""; players = @{ left = @(); right = @() }
    }) | Out-Null
    $script:Completed[$seriesId] = $true
    Save-CaptureJson
    Click-Back
    Click-At ($script:WinLeft + 20) ($script:WinTop + 180)
    return
  }

  $header = Get-PageHeader
  $left = if ($header.Left) { $header.Left } else { $modal.Left }
  $right = if ($header.Right) { $header.Right } else { $modal.Right }
  $selectEl = Snap-Find $snap "选择"
  $pickRowY = if ($selectEl) { [int]($selectEl.Current.BoundingRectangle.Y - $script:WinTop) } else { 0 }

  for ($g = 1; $g -le 7; $g++) {
    Check-Control
    $tabName = @("第一局","第二局","第三局","第四局","第五局","第六局","第七局")[$g - 1]
    if ($g -gt 1) {
      Wheel 600 8   # 先回到顶部
      $tab = Snap-Find $snap $tabName
      if (-not $tab) { break }
      Click-Element $tab.El
      Start-Sleep -Milliseconds 1800
      $snap = Get-TextSnapshot
    }
    $h = Get-PageHeaderFromSnap $snap
    if ($h.Left) { $left = $h.Left }
    if ($h.Right) { $right = $h.Right }
    $shotName = "$seriesId-g$g.png"
    $playerName = "$seriesId-g$g-players.png"
    $shotPath = Join-Path $SessionDir (Join-Path "pages" $shotName)
    $playerPath = Join-Path $SessionDir (Join-Path "pages" $playerName)
    Capture-Page $shotPath
    Wheel -600 12
    Start-Sleep -Milliseconds 900
    Capture-Page $playerPath
    $snapDown = Get-TextSnapshot
    $players = Get-PlayerNamesFromSnap $snapDown
    Wheel 600 20
    Start-Sleep -Milliseconds 700
    $snap = Get-TextSnapshot

    $script:Pages.Add([ordered]@{
      id = "$seriesId-g$g"; seriesId = $seriesId; group = $group; round = $modal.Round;
      teams = @($left, $right); gameNo = $g; noData = $false;
      pickRowY = $pickRowY;
      winner = if ($h.Winner) { $h.Winner } else { "" };
      duration = $h.Duration; date = $h.Date;
      score = @($h.ScoreL, $h.ScoreR);
      shot = "pages/$shotName"; playerShot = "pages/$playerName";
      players = @{ left = @($players.Left); right = @($players.Right) }
    }) | Out-Null
    Save-CaptureJson
    Save-Progress "game" $group $idx $total $seriesId $g "已抓 $seriesId 第 $g 局"
    if ($g -ge 3) {
      # BO3 小组赛；如果页面还有第四局（BO5），继续循环
      $next = @("第四局","第五局")[$g - 3]
      if ($next -and -not (Snap-Find $snap $next)) { break }
    }
  }
  $script:Completed[$seriesId] = $true
  Save-CaptureJson
  Click-Back
  Start-Sleep -Milliseconds 700
  Click-At ($script:WinLeft + 20) ($script:WinTop + 180)
  Start-Sleep -Milliseconds 700
}

function Process-OpenModal([string]$group, [int]$idx, [int]$total) {
  $modal = Get-ModalInfo
  if (-not $modal) {
    Write-Log "弹窗结构读取失败"
    Click-At ($script:WinLeft + 20) ($script:WinTop + 180)
    return
  }
  $mLeft = if ($modal.Left) { $modal.Left } else { "左队" }
  $mRight = if ($modal.Right) { $modal.Right } else { "右队" }
  $seriesId = "循环赛-$group-$($modal.Round)-$mLeft-$mRight"
  if ($script:Completed.ContainsKey($seriesId)) {
    Write-Log "跳过已完成：$seriesId"
    Click-At ($script:WinLeft + 20) ($script:WinTop + 180)
    return
  }
  Save-Progress "series" $group $idx $total $seriesId 0 "打开 $seriesId"

  $prepare = $null
  for ($t = 0; $t -lt 3; $t++) {
    $prepare = Find-Text "备战详情" -Clickable
    if ($prepare) { break }
    Start-Sleep -Milliseconds 600
  }
  if (-not $prepare) {
    Write-Log "弹窗里没有备战详情：$group-$($modal.Round)"
    Click-At ($script:WinLeft + 20) ($script:WinTop + 180)
    return
  }
  Click-Element $prepare
  Start-Sleep -Seconds 3

  # 队名以备战页头部为准：弹窗背后同 Y 的赛程卡片文字会干扰 UIA。
  $header = Get-PageHeader
  $left = if ($header.Left) { $header.Left } elseif ($modal.Left) { $modal.Left } else { "左队" }
  $right = if ($header.Right) { $header.Right } elseif ($modal.Right) { $modal.Right } else { "右队" }
  $seriesId = "循环赛-$group-$($modal.Round)-$left-$right"
  if ($script:Completed.ContainsKey($seriesId)) {
    Write-Log "跳过已完成：$seriesId"
    Click-Back
    Click-At ($script:WinLeft + 20) ($script:WinTop + 180)
    return
  }
  Save-Progress "series" $group $idx $total $seriesId 0 "打开 $seriesId"

  $noData = Find-Text "暂无数据"
  if ($noData) {
    Write-Log "暂无数据（判负/未打）：$seriesId"
    $script:Pages.Add([ordered]@{
      id = "$seriesId-g1"; seriesId = $seriesId; group = $group; round = $modal.Round;
      teams = @($left, $right); gameNo = 1; noData = $true; pickRowY = 0;
      winner = ""; duration = ""; shot = ""; playerShot = ""; players = @{ left = @(); right = @() }
    }) | Out-Null
    $script:Completed[$seriesId] = $true
    Save-CaptureJson
    Click-Back
    Click-At ($script:WinLeft + 20) ($script:WinTop + 180)
    return
  }

  $selectEl = Find-Text "选择"
  $pickRowY = if ($selectEl) { [int]($selectEl.Current.BoundingRectangle.Y - $script:WinTop) } else { 0 }

  for ($g = 1; $g -le 7; $g++) {
    Check-Control
    $tabName = @("第一局","第二局","第三局","第四局","第五局","第六局","第七局")[$g - 1]
    if ($g -gt 1) {
      Wheel 600 20
      $tab = Find-Text $tabName
      if (-not $tab) { break }
      Click-Element $tab
      Start-Sleep -Milliseconds 1800
    }
    $h = Get-PageHeader
    if ($h.Left) { $left = $h.Left }
    if ($h.Right) { $right = $h.Right }
    $shotName = "$seriesId-g$g.png"
    $playerName = "$seriesId-g$g-players.png"
    $shotPath = Join-Path $SessionDir (Join-Path "pages" $shotName)
    $playerPath = Join-Path $SessionDir (Join-Path "pages" $playerName)
    Capture-Page $shotPath
    Wheel -600 7
    Start-Sleep -Milliseconds 900
    Capture-Page $playerPath
    $players = Get-PlayerNames
    Wheel 600 20
    Start-Sleep -Milliseconds 700
    $script:Pages.Add([ordered]@{
      id = "$seriesId-g$g"; seriesId = $seriesId; group = $group; round = $modal.Round;
      teams = @($left, $right); gameNo = $g; noData = $false; pickRowY = $pickRowY;
      winner = if ($h.Winner) { $h.Winner } else { "" };
      duration = $h.Duration; date = $h.Date;
      score = @($h.ScoreL, $h.ScoreR);
      shot = "pages/$shotName"; playerShot = "pages/$playerName";
      players = @{ left = @($players.Left); right = @($players.Right) }
    }) | Out-Null
    Save-CaptureJson
    Save-Progress "game" $group $idx $total $seriesId $g "已抓 $seriesId 第 $g 局"
    if ($g -ge 3) {
      $next = @("第四局","第五局")[$g - 3]
      if ($next -and -not (Find-Text $next)) { break }
    }
  }
  $script:Completed[$seriesId] = $true
  Save-CaptureJson
  Click-Back
  Start-Sleep -Milliseconds 700
  Click-At ($script:WinLeft + 20) ($script:WinTop + 180)
  Start-Sleep -Milliseconds 700
}

function Process-Visual([string]$group, $counter, [int]$total) {
  $doneRounds = @{}
  $yList = @(660, 920, 1180, 1400)
  for ($pass = 0; $pass -lt 5; $pass++) {
    $rounds = Get-VisibleRounds
    Write-Log ("$group 当前可见轮次：" + (($rounds | ForEach-Object { $_.Name }) -join "、"))
    foreach ($r in $rounds) {
      if ($doneRounds.ContainsKey($r.Name)) { continue }
      $doneRounds[$r.Name] = $true
      $cx = [Math]::Min($script:WinLeft + 780, $r.X + 100)
      foreach ($y in $yList) {
        if ($MaxSeries -gt 0 -and $counter.Value -ge $MaxSeries) { return }
        Check-Control
        Click-At $cx ($script:WinTop + $y)
        Start-Sleep -Milliseconds 1200
        if (Find-Text "备战详情" -Clickable) {
          $counter.Value++
          Process-OpenModal $group $counter.Value $total
        } else {
          Click-At ($script:WinLeft + 20) ($script:WinTop + 180)
        }
      }
    }
    if ($doneRounds.Count -ge 7) { break }
    Drag-Horizontal 760 140 900
    Start-Sleep -Milliseconds 900
  }
  Write-Log "$group 扫描完成：$($doneRounds.Count) 轮"
}

function Main {
  New-Item -ItemType Directory -Force -Path (Join-Path $SessionDir "pages") | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $SessionDir "icons") | Out-Null
  if (Test-Path $script:ProgressPath) {
    try {
      $old = Get-Content -Raw $script:ProgressPath | ConvertFrom-Json
      foreach ($id in @($old.completed)) { if ($id) { $script:Completed[$id] = $true } }
    } catch { }
  }
  Find-SaibaoWindow
  Go-Schedule
  $stage = Find-Text "循环赛" ($script:WinTop + 150) ($script:WinTop + 400)
  if ($stage) {
    Click-TextCenter "循环赛" ($script:WinTop + 150) ($script:WinTop + 400)
    Start-Sleep -Seconds 2
  }
  if (-not (Find-Text "1组")) {
    # 有时点到了 16进8 的分栏，再点一次「循环赛」面包屑
    Click-TextCenter "循环赛" ($script:WinTop + 150) ($script:WinTop + 400)
    Click-At ($script:WinLeft + 100) ($script:WinTop + 300)
  }
  for ($t = 0; $t -lt 8; $t++) {
    if (Find-Text "1组") { break }
    Start-Sleep -Milliseconds 700
  }
  if (-not (Find-Text "1组")) { throw "找不到「循环赛」入口" }
  $groupList = $Groups.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ }
  foreach ($g in $groupList) {
    $groupName = if ($g -match '组$') { $g } else { $g + "组" }
    Check-Control
    Save-Progress "group" $groupName 0 0 "" 0 "切到 $groupName"
    Wheel 600 20
    Start-Sleep -Milliseconds 500
    Click-TextCenter $groupName ($script:WinTop + 340) ($script:WinTop + 500)
    Start-Sleep -Seconds 2
    $visible = Get-VisibleRounds
    Write-Log ("$groupName 开始按可见轮次扫描：" + (($visible | ForEach-Object { $_.Name }) -join "、"))
    # 先拖回第 1 轮
    Drag-Horizontal 150 780 900
    Drag-Horizontal 150 780 900
    $counter = @{ Value = 0 }
    Process-Visual $groupName $counter $MaxSeries
  }
  Save-CaptureJson
  Save-Progress "done" "" 0 0 "" 0 "抓取完成"
  Write-Log "完成，共 $($script:Pages.Count) 页"
}

try {
  Main
} catch {
  Write-Log ("FATAL: " + $_.Exception.Message)
  Save-CaptureJson
  Save-Progress "error" "" 0 0 "" 0 $_.Exception.Message
  exit 1
}
