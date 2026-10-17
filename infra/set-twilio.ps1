# Saves the Twilio settings for verification calls on the Cloud Run service.
# Run it yourself in PowerShell: it asks for the three values; the token is hidden as you type
# and is never printed or written to a file.
# Usage:  powershell -ExecutionPolicy Bypass -File infra\set-twilio.ps1

$ErrorActionPreference = "Stop"
$project = "last-mile-guard-510814"
$region = "us-central1"
$service = "last-mile-guard"
$gcloud = Join-Path $env:LOCALAPPDATA "Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
if (-not (Test-Path $gcloud)) { $gcloud = "gcloud" }

$sid = (Read-Host "Twilio Account SID (starts with AC)").Trim()
if ($sid -notmatch '^AC[0-9a-fA-F]{32}$') { throw "That does not look like an Account SID (AC followed by 32 characters)." }

$from = (Read-Host "Twilio phone number, with country code (for example +15551234567)").Trim() -replace '\s', ''
if ($from -notmatch '^\+[1-9][0-9]{7,14}$') { throw "Enter the Twilio number with + and the country code." }

$secure = Read-Host "Twilio Auth Token (hidden)" -AsSecureString
$token = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if ($token -notmatch '^[0-9a-fA-F]{32}$') { throw "That does not look like an Auth Token (32 characters)." }

Write-Host "Saving the settings on $service (about 30 seconds)..."
& $gcloud run services update $service --project $project --region $region --quiet `
  --update-env-vars "TWILIO_ACCOUNT_SID=$sid,TWILIO_FROM_NUMBER=$from,TWILIO_AUTH_TOKEN=$token" | Out-Null
$token = $null
Write-Host "Done. Verification calls are switched on. Tell Claude 'done' to check the setup."
