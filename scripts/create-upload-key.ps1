# Creates the Google Play upload key outside the repository.
# Run it yourself in a terminal; the password is typed here and never shown or stored in the repo.
#   powershell -ExecutionPolicy Bypass -File scripts/create-upload-key.ps1
$ErrorActionPreference = "Stop"

$dir = Join-Path $env:USERPROFILE ".tin-whistle"
$keystore = Join-Path $dir "upload.jks"
$properties = Join-Path $dir "android-upload.properties"
New-Item -ItemType Directory -Force $dir | Out-Null

if (Test-Path $keystore) {
  Write-Host "An upload key already exists at $keystore. Nothing was changed."
  exit 0
}

$keytool = @(
  $(if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME "bin\keytool.exe" }),
  "C:\Program Files\STMicroelectronics\STM32Cube\STM32CubeMX\jre\bin\keytool.exe",
  "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $keytool) { throw "keytool was not found. Set JAVA_HOME to a JDK 17+ and run again." }

function Read-Secret([string]$prompt) {
  $secure = Read-Host $prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

$plain = Read-Secret "Choose a password for the upload key (8+ characters, English letters, digits and symbols)"
$again = Read-Secret "Type it again"
if ($plain -cne $again) { throw "The passwords do not match." }
if ($plain.Length -lt 8) { throw "Use at least 8 characters." }
# Gradle reads the properties file as ISO-8859-1, so keep to printable ASCII.
if ($plain -notmatch '^[\x21-\x7E]+$') { throw "Use only English letters, digits and symbols (no spaces or letters like ç, ğ, ş)." }

# The password reaches keytool through an environment variable, not the command line.
$env:TWNC_UPLOAD_PASSWORD = $plain
try {
  & $keytool -genkeypair -keystore $keystore -storetype PKCS12 -alias upload -keyalg RSA -keysize 4096 -validity 10000 `
    -dname "CN=Tin Whistle Note Creator" -storepass:env TWNC_UPLOAD_PASSWORD -keypass:env TWNC_UPLOAD_PASSWORD
  if ($LASTEXITCODE -ne 0) { throw "keytool failed." }
} finally {
  Remove-Item Env:TWNC_UPLOAD_PASSWORD
}

$storeFile = $keystore -replace "\\", "/"
$escaped = $plain -replace "\\", "\\"
Set-Content -Path $properties -Encoding ascii -Value @(
  "storeFile=$storeFile",
  "storePassword=$escaped",
  "keyAlias=upload",
  "keyPassword=$escaped"
)
# Only the current user may read the password file.
icacls $properties /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null

Write-Host ""
Write-Host "Upload key created: $keystore"
Write-Host "Gradle signing settings: $properties"
Write-Host "Back up upload.jks and its password somewhere safe (for example a password manager)."
