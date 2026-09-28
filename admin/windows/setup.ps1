# Portfolio admin — instalace na Windows (10/11, i Home)
# Spouští se přes setup-windows.bat. Dá se pustit opakovaně: co už je
# hotové, přeskočí. Nic nemaže.
#   1. doinstaluje Git a Node.js (winget)
#   2. naklonuje repo do %USERPROFILE%\portfolio (mimo OneDrive)
#   3. nastaví adresu pro commity (noreply) a přihlášení ke GitHubu
#   4. vytvoří zástupce "Portfolio Admin" na ploše
#   5. zkontroluje, že vše funguje

$ErrorActionPreference = 'Stop'
$RepoUrl = 'https://github.com/martinposta/portfolio.git'
$Target  = Join-Path $env:USERPROFILE 'portfolio'
$Email   = '33331553+martinposta@users.noreply.github.com'

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }
function Step($n, $text) { Write-Host ''; Write-Host "[$n/5] $text" -ForegroundColor Cyan }
function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  foreach ($p in @('C:\Program Files\Git\cmd', 'C:\Program Files\nodejs')) {
    if ((Test-Path $p) -and ($env:Path -notlike "*$p*")) { $env:Path += ";$p" }
  }
}
function WingetInstall($id, $name) {
  Say "   Instaluji $name (Windows se může zeptat na povolení - potvrďte)..." 'Yellow'
  winget install --id $id -e --source winget --accept-package-agreements --accept-source-agreements --silent
  if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne -1978335189) { throw "Instalace $name selhala (kód $LASTEXITCODE)." }
  Refresh-Path
}

try {
  Say '=== Portfolio admin - instalace pro Windows ===' 'Green'

  Step 1 'Git a Node.js'
  if (-not (Have 'winget')) {
    Say '   Chybí "winget" (Instalační program aplikací). Otevírám Microsoft Store - nainstalujte' 'Red'
    Say '   "App Installer" a pak tento skript spusťte znovu.' 'Red'
    Start-Process 'ms-windows-store://pdp/?productid=9NBLGGH4NNS1'
    throw 'Chybí winget.'
  }
  Refresh-Path
  if (Have 'git') { Say ('   Git je nainstalovaný: ' + (git --version)) } else { WingetInstall 'Git.Git' 'Git' }
  $nodeOk = $false
  if (Have 'node') { $major = [int]((node -p 'process.versions.node').Split('.')[0]); $nodeOk = $major -ge 18 }
  if ($nodeOk) { Say ('   Node.js je nainstalovaný: ' + (node --version)) } else { WingetInstall 'OpenJS.NodeJS.LTS' 'Node.js' }
  if (-not (Have 'git'))  { throw 'Git se nepodařilo najít ani po instalaci. Zavřete okno a spusťte skript znovu.' }
  if (-not (Have 'node')) { throw 'Node.js se nepodařilo najít ani po instalaci. Zavřete okno a spusťte skript znovu.' }

  Step 2 "Repozitář do $Target"
  if (Test-Path (Join-Path $Target '.git')) {
    Say '   Už je naklonovaný, stahuji novinky...'
    git -C $Target pull --ff-only
    if ($LASTEXITCODE -ne 0) { Say '   Stažení novinek se nepovedlo - admin to zkusí sám při spuštění.' 'Yellow' }
  } elseif ((Test-Path $Target) -and (Get-ChildItem $Target -Force | Select-Object -First 1)) {
    throw "Složka $Target existuje a není prázdná, ale není to klon repa. Přejmenujte ji a spusťte skript znovu."
  } else {
    git clone $RepoUrl $Target
    if ($LASTEXITCODE -ne 0) { throw 'Klonování z GitHubu selhalo - zkontrolujte připojení k internetu.' }
  }

  Step 3 'Nastavení gitu a přihlášení ke GitHubu'
  git -C $Target config user.email $Email
  git -C $Target config user.name 'martinposta'
  Say "   Adresa pro commity: $Email"
  Say '   Teď se ověří přihlášení. Pokud se otevře okno GitHubu, přihlaste se' 'Yellow'
  Say '   (jednou, Windows si to zapamatuje).' 'Yellow'
  Push-Location $Target
  node admin\tools\check-setup.js --push | Out-Null
  Pop-Location

  Step 4 'Zástupce na ploše'
  $desktop = [Environment]::GetFolderPath('Desktop')
  $lnk = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop 'Portfolio Admin.lnk'))
  $lnk.TargetPath = Join-Path $Target 'admin\start.bat'
  $lnk.WorkingDirectory = Join-Path $Target 'admin'
  $lnk.IconLocation = 'shell32.dll,13'
  $lnk.Description = 'Portfolio admin (martinposta.com)'
  $lnk.Save()
  Say "   Hotovo: $desktop\Portfolio Admin"

  Step 5 'Kontrola'
  Push-Location $Target
  node admin\tools\check-setup.js --push
  $ok = ($LASTEXITCODE -eq 0)
  Pop-Location
  Write-Host ''
  if ($ok) {
    Say '=== Vše připraveno. Admin spustíte zástupcem "Portfolio Admin" na ploše. ===' 'Green'
    $answer = Read-Host 'Spustit admin teď? (A/N)'
    if ($answer -match '^[aAyY]') { Start-Process (Join-Path $Target 'admin\start.bat') -WorkingDirectory (Join-Path $Target 'admin') }
  } else {
    Say '=== Něco chybí - viz řádky FAIL výše. Pošlete je Claudovi. ===' 'Red'
  }
} catch {
  Write-Host ''
  Say ('CHYBA: ' + $_.Exception.Message) 'Red'
  Say 'Pošlete tuto zprávu Claudovi, nebo spusťte admin\windows\diagnose.bat.' 'Red'
}
